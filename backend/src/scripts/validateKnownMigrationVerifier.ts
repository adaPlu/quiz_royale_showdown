import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function runVerifier(expectSuccess: boolean): void {
  const result = spawnSync(
    "npx",
    ["tsx", "src/scripts/verifyKnownMigrationState.ts", "--require-complete"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  const succeeded = result.status === 0;
  if (succeeded !== expectSuccess) {
    throw new Error(
      expectSuccess
        ? "Known migration verifier unexpectedly rejected the canonical schema"
        : "Known migration verifier accepted a malformed same-named index",
    );
  }
}

async function restoreRefreshTokenIndex(): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "RefreshToken_tokenHash_key"`);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX "RefreshToken_tokenHash_key"
    ON "RefreshToken"("tokenHash")
  `);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for migration verifier validation");
  }

  console.log("Verifying canonical known-migration schema shape...");
  runVerifier(true);

  console.log("Proving a malformed same-named migration object fails closed...");
  await prisma.$executeRawUnsafe(`DROP INDEX "RefreshToken_tokenHash_key"`);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX "RefreshToken_tokenHash_key"
    ON "RefreshToken"("id")
  `);
  await prisma.$disconnect();

  runVerifier(false);

  await prisma.$connect();
  await restoreRefreshTokenIndex();
  await prisma.$disconnect();

  console.log("Re-verifying the restored canonical schema...");
  runVerifier(true);
  console.log("Known migration verifier fail-closed rehearsal passed.");
}

main()
  .catch(async (error: unknown) => {
    await prisma.$connect().catch(() => undefined);
    await restoreRefreshTokenIndex().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    console.error(
      "Known migration verifier validation failed:",
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
