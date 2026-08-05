import { prisma } from "../models/prismaClient";
import { buildAutoDisplayName } from "../utils/publicDisplayName";

async function backfillDisplayNames(): Promise<number> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
    },
  });

  const unnamedUsers = users.filter((user) => !user.displayName.trim());

  if (unnamedUsers.length === 0) {
    return 0;
  }

  await prisma.$transaction(
    unnamedUsers.map((user) =>
      prisma.user.update({
        where: { id: user.id },
        data: { displayName: buildAutoDisplayName(user.id) },
      })
    )
  );

  return unnamedUsers.length;
}

backfillDisplayNames()
  .then((updatedCount) => {
    console.log(`Display-name backfill complete. Updated ${updatedCount} user(s).`);
  })
  .catch((error) => {
    console.error("Display-name backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
