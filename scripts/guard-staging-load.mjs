import { spawnSync } from "node:child_process";

const requiredAck = "50_PLAYERS_STAGING";
const apiBaseUrl = process.env.API_BASE_URL ?? "";
const wsBaseUrl = process.env.WS_BASE_URL ?? "";
const ack = process.env.STAGING_LOAD_ACK ?? "";
const dryRun = process.env.STAGING_LOAD_DRY_RUN === "1";
const allowLocal = process.env.ALLOW_LOCAL_LOAD === "1";

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

if (ack !== requiredAck) {
  fail(`set STAGING_LOAD_ACK=${requiredAck} before running a staging load probe`);
}

if (!apiBaseUrl || !wsBaseUrl) {
  fail("set API_BASE_URL and WS_BASE_URL to the staging backend before running load");
}

if (!apiBaseUrl.endsWith("/api/v1")) {
  fail("API_BASE_URL must include /api/v1");
}

const localPattern = /localhost|127\.0\.0\.1|10\.0\.2\.2/i;
if (!allowLocal && (localPattern.test(apiBaseUrl) || localPattern.test(wsBaseUrl))) {
  fail("refusing local load target unless ALLOW_LOCAL_LOAD=1 is set");
}

const vus = process.env.K6_VUS ?? "50";
const duration = process.env.K6_DURATION ?? "2m";

if (!/^\d+$/.test(vus) || Number(vus) <= 0 || Number(vus) > 50) {
  fail("K6_VUS must be a positive integer no higher than 50 for this guarded command");
}

if (!/^\d+(s|m)$/.test(duration)) {
  fail("K6_DURATION must be a simple duration such as 30s or 2m");
}

pass(`target API ${apiBaseUrl}`);
pass(`target WS ${wsBaseUrl}`);
pass(`configured K6_VUS=${vus}`);
pass(`configured K6_DURATION=${duration}`);

const command = [
  "k6",
  "run",
  "-e",
  `API_BASE_URL=${apiBaseUrl}`,
  "-e",
  `WS_BASE_URL=${wsBaseUrl}`,
  "-e",
  `K6_VUS=${vus}`,
  "-e",
  `K6_DURATION=${duration}`,
  "load-test/game-simulation.js"
];

if (dryRun) {
  console.log(`DRY RUN ${command.join(" ")}`);
  process.exit(0);
}

const k6Check = spawnSync("k6", ["version"], { stdio: "ignore", shell: true });
if (k6Check.status !== 0) {
  fail("k6 is not installed or not on PATH");
}

console.log(`Running ${command.join(" ")}`);
const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
