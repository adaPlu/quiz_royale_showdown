import "dotenv/config";

import { RoomStatus } from "@prisma/client";

import { prisma } from "../models/prismaClient";

async function main(): Promise<void> {
  const now = new Date();
  const expiredGuests = await prisma.user.findMany({
    where: {
      isGuest: true,
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      roomPlayers: {
        select: {
          room: { select: { status: true } },
        },
      },
    },
    take: 500,
  });

  const removableIds = expiredGuests
    .filter((guest) =>
      guest.roomPlayers.every((membership) => membership.room.status === RoomStatus.GAME_OVER)
    )
    .map((guest) => guest.id);

  if (removableIds.length === 0) {
    console.log("No expired guest accounts are eligible for cleanup.");
    return;
  }

  const result = await prisma.user.deleteMany({
    where: { id: { in: removableIds }, isGuest: true },
  });
  console.log(`Removed ${result.count} expired guest account(s).`);
}

main()
  .catch((error: unknown) => {
    console.error("Expired guest cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
