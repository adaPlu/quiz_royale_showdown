import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function checkFile(relativePath) {
  if (fs.existsSync(path.join(repoRoot, relativePath))) {
    pass(`${relativePath} exists`);
  } else {
    fail(`${relativePath} is missing`);
  }
}

[
  "backend/Dockerfile",
  "backend/start.sh",
  "backend/railway.json",
  "backend/package.json",
  "backend/prisma/schema.prisma",
  "docs/STAGING_SMOKE.md",
  "scripts/guard-staging-load.mjs",
  "load-test/phase1-live-flow-smoke.mjs",
  "load-test/phase2-full-loop-smoke.mjs",
  "load-test/game-simulation.js"
].forEach(checkFile);

const backendPackage = JSON.parse(read("backend/package.json"));
if (backendPackage.dependencies?.prisma) {
  pass("Prisma CLI is available in production dependencies");
} else {
  fail("backend/package.json must keep prisma in dependencies for runtime migrations");
}

const railway = JSON.parse(read("backend/railway.json"));
if (railway.build?.builder === "DOCKERFILE" && railway.build?.dockerfilePath === "Dockerfile") {
  pass("Railway uses backend Dockerfile when service root is backend/");
} else {
  fail("backend/railway.json must use Dockerfile builder with dockerfilePath Dockerfile");
}

if (railway.deploy?.healthcheckPath === "/health") {
  pass("Railway health check points at /health");
} else {
  fail("Railway health check must point at /health");
}

const dockerfile = read("backend/Dockerfile");
if (dockerfile.includes('CMD ["sh", "start.sh"]')) {
  pass("Docker runtime executes start.sh");
} else {
  fail("backend/Dockerfile must execute start.sh");
}

const startScript = read("backend/start.sh");
if (startScript.includes("npx prisma migrate deploy")) {
  pass("start.sh runs prisma migrate deploy");
} else {
  fail("start.sh must run prisma migrate deploy");
}

if (startScript.includes("PRISMA_BASELINE_CURRENT_INIT")) {
  pass("current init baseline is explicit opt-in");
} else {
  fail("start.sh must keep current init baseline behind PRISMA_BASELINE_CURRENT_INIT");
}

const appSource = read("backend/src/app.ts");
const mountedRoutes = [...appSource.matchAll(/app\.use\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
const allowedMountedRoutes = new Set(["/health", "/api/v1", "/api/v1/auth", "/api/v1/rooms"]);
const unexpectedRoutes = mountedRoutes.filter((route) => !allowedMountedRoutes.has(route));

if (unexpectedRoutes.length === 0) {
  pass(`mounted routes are launch-scoped: ${mountedRoutes.join(", ")}`);
} else {
  fail(`unexpected mounted routes found: ${unexpectedRoutes.join(", ")}`);
}

const forbiddenRouteImports = [
  "admin",
  "challenges",
  "cosmetics",
  "leaderboard",
  "powerups",
  "push",
  "users"
];
const mountedFutureImports = forbiddenRouteImports.filter((name) =>
  appSource.includes(`./routes/${name}`)
);

if (mountedFutureImports.length === 0) {
  pass("future route modules are not imported by backend/src/app.ts");
} else {
  fail(`future route modules imported by app.ts: ${mountedFutureImports.join(", ")}`);
}

const loadGuard = read("scripts/guard-staging-load.mjs");
if (loadGuard.includes("STAGING_LOAD_ACK") && loadGuard.includes("50_PLAYERS_STAGING")) {
  pass("50-player staging load command requires explicit acknowledgement");
} else {
  fail("50-player staging load command must require STAGING_LOAD_ACK=50_PLAYERS_STAGING");
}

if (failures.length > 0) {
  console.error(`\nStaging preflight failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nStaging preflight passed.");
