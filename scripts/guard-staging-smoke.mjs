import { spawnSync } from "node:child_process";

const phase = process.argv[2];
const scriptByPhase = {
  phase1: "load-test/phase1-live-flow-smoke.mjs",
  phase2: "load-test/phase2-full-loop-smoke.mjs"
};

const requiredAck = "STAGING_BACKEND";
const apiBaseUrl = process.env.API_BASE_URL ?? "";
const wsBaseUrl = process.env.WS_BASE_URL ?? "";
const ack = process.env.STAGING_SMOKE_ACK ?? "";
const dryRun = process.env.STAGING_SMOKE_DRY_RUN === "1";
const allowLocal = process.env.ALLOW_LOCAL_SMOKE === "1";
const smokeTimeoutMs = process.env.SMOKE_TIMEOUT_MS ?? "";

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

if (!scriptByPhase[phase]) {
  fail("usage: node scripts/guard-staging-smoke.mjs phase1|phase2");
}

if (ack !== requiredAck) {
  fail(`set STAGING_SMOKE_ACK=${requiredAck} before running staging smoke`);
}

if (!apiBaseUrl || !wsBaseUrl) {
  fail("set API_BASE_URL and WS_BASE_URL to the staging backend before running smoke");
}

if (!apiBaseUrl.endsWith("/api/v1")) {
  fail("API_BASE_URL must include /api/v1");
}

const localPattern = /localhost|127\.0\.0\.1|10\.0\.2\.2/i;
if (!allowLocal && (localPattern.test(apiBaseUrl) || localPattern.test(wsBaseUrl))) {
  fail("refusing local smoke target unless ALLOW_LOCAL_SMOKE=1 is set");
}

if (smokeTimeoutMs && (!/^\d+$/.test(smokeTimeoutMs) || Number(smokeTimeoutMs) < 15000)) {
  fail("SMOKE_TIMEOUT_MS must be a number >= 15000 when set");
}

if (phase === "phase2" && smokeTimeoutMs && Number(smokeTimeoutMs) < 120000) {
  fail("SMOKE_TIMEOUT_MS should be >= 120000 for phase2 full-loop staging smoke");
}

pass(`target API ${apiBaseUrl}`);
pass(`target WS ${wsBaseUrl}`);
pass(`selected ${phase}`);
if (smokeTimeoutMs) {
  pass(`SMOKE_TIMEOUT_MS=${smokeTimeoutMs}`);
}

const command = ["node", scriptByPhase[phase]];

if (dryRun) {
  console.log(`DRY RUN ${command.join(" ")}`);
  process.exit(0);
}

const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
