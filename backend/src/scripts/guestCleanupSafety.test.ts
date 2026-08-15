import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// DATA-10. An expired guest who hosted a finished room used to pass the cleanup
// filter, hit Room_hostUserId_fkey (ON DELETE RESTRICT) with a P2003, set
// exitCode 1, and abort start.sh under `set -eu` — before `exec node
// dist/index.js`. The offending Room row is durable, so every later deploy
// failed the same way until someone edited the database by hand.
//
// Two independent guards, tested independently: the filter must exclude hosts,
// and startup must survive the script failing for any other reason.
describe("expired guest cleanup — startup safety (DATA-10)", () => {
  const scriptSource = readFileSync(
    path.resolve(process.cwd(), "src/scripts/cleanupExpiredGuests.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  // Strip comments and blanks before asserting on ordering: prose that merely
  // *mentions* a command must not satisfy an assertion about running it.
  const startScript = readFileSync(path.resolve(process.cwd(), "start.sh"), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#") && line.trim() !== "")
    .join("\n");

  it("excludes guests who host a surviving room from deletion", () => {
    // The host relation must be selected...
    expect(scriptSource).toContain("roomsHosted");
    // ...and actually gate the removable set, not merely be fetched.
    expect(scriptSource).toMatch(/guest\.roomsHosted\.length === 0/);
  });

  it("does not let a failed cleanup abort startup", () => {
    const cleanupLine = startScript
      .split("\n")
      .find((line) => line.includes("cleanupExpiredGuests.js"));

    expect(cleanupLine).toBeDefined();
    // Under `set -eu` a bare invocation aborts the script. It must be guarded.
    expect(cleanupLine).toMatch(/\|\||;\s*true|set \+e/);
  });

  it("still starts the server after the cleanup step", () => {
    const cleanupAt = startScript.indexOf("cleanupExpiredGuests.js");
    const execAt = startScript.indexOf("exec node dist/index.js");

    expect(cleanupAt).toBeGreaterThanOrEqual(0);
    expect(execAt).toBeGreaterThan(cleanupAt);
  });
});
