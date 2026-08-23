import { spawnSync } from 'node:child_process';

const ALLOWED_DIRECT_ADVISORIES = new Map([
  [
    'deepmerge-ts',
    new Set(['GHSA-ggr8-5vv4-36mx']),
  ],
]);

function advisoryId(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const url = typeof entry.url === 'string' ? entry.url : '';
  const match = url.match(/(GHSA-[a-z0-9-]+)/i);
  return match?.[1] ?? null;
}

function runAudit() {
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  const output = result.stdout?.trim();
  if (!output) {
    console.error(result.stderr || 'npm audit produced no JSON output.');
    process.exit(1);
  }

  try {
    return JSON.parse(output);
  } catch (error) {
    console.error('Failed to parse npm audit JSON.');
    console.error(output);
    process.exit(1);
  }
}

const report = runAudit();
const vulnerabilities = report.vulnerabilities ?? {};
const allowedPackages = new Set();

for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
  const allowedIds = ALLOWED_DIRECT_ADVISORIES.get(packageName);
  if (!allowedIds) continue;

  const directAdvisories = (vulnerability.via ?? []).filter(
    (entry) => entry && typeof entry === 'object',
  );
  const ids = directAdvisories.map(advisoryId).filter(Boolean);

  if (
    directAdvisories.length > 0 &&
    ids.length === directAdvisories.length &&
    ids.every((id) => allowedIds.has(id))
  ) {
    allowedPackages.add(packageName);
  }
}

let changed = true;
while (changed) {
  changed = false;
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (allowedPackages.has(packageName)) continue;
    const via = vulnerability.via ?? [];
    if (
      via.length > 0 &&
      via.every((entry) => typeof entry === 'string' && allowedPackages.has(entry))
    ) {
      allowedPackages.add(packageName);
      changed = true;
    }
  }
}

const blocking = Object.entries(vulnerabilities).filter(([packageName, vulnerability]) => {
  if (allowedPackages.has(packageName)) return false;
  return vulnerability.severity === 'high' || vulnerability.severity === 'critical';
});

if (allowedPackages.size > 0) {
  console.warn(
    `Temporarily allowing upstream Prisma 6 audit chain: ${[...allowedPackages].sort().join(', ')}`,
  );
  console.warn(
    'Allowed root advisory: GHSA-ggr8-5vv4-36mx. Remove this exception when Prisma 6 publishes a patched @prisma/config dependency or during the dedicated Prisma 7 migration.',
  );
}

if (blocking.length > 0) {
  console.error('Blocking high/critical npm audit findings:');
  for (const [packageName, vulnerability] of blocking) {
    console.error(`- ${packageName}: ${vulnerability.severity} (${vulnerability.range ?? 'unknown range'})`);
  }
  process.exit(1);
}

console.log('No non-allowlisted high or critical npm audit findings.');
