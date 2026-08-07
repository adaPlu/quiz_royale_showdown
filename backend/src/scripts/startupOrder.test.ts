import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("production startup migration ordering", () => {
  it("migrates a fresh database before requiring the complete schema", () => {
    const script = readFileSync(path.resolve(process.cwd(), "start.sh"), "utf8");

    const compatibilityPreflight = script.indexOf(
      "node dist/scripts/verifyKnownMigrationState.js\n",
    );
    const repair = script.indexOf("node dist/scripts/repairKnownMigrations.js");
    const migrateDeploy = script.indexOf("npx prisma migrate deploy");
    const completeVerification = script.indexOf(
      "node dist/scripts/verifyKnownMigrationState.js --require-complete",
    );
    const serverStart = script.indexOf("exec node dist/index.js");

    expect(compatibilityPreflight).toBeGreaterThanOrEqual(0);
    expect(repair).toBeGreaterThan(compatibilityPreflight);
    expect(migrateDeploy).toBeGreaterThan(repair);
    expect(completeVerification).toBeGreaterThan(migrateDeploy);
    expect(serverStart).toBeGreaterThan(completeVerification);
  });
});
