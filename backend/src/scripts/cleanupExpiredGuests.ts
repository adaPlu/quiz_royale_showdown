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
      // DATA-10: a guest who joined public matchmaking with no room code becomes
      // the room's host (matchmakeOrCreate -> createRoomEntity). Room_hostUserId_fkey
      // is ON DELETE RESTRICT and finished rooms are never deleted, so deleting such
      // a guest raises P2003. Membership status alone does not capture this — the
      // guest's own RoomPlayer row points at a GAME_OVER room and looks eligible.
      roomsHosted: { select: { id: true }, take: 1 },
    },
    take: 500,
  });

  const removableIds = expiredGuests
    .filter(
      (guest) =>
        guest.roomsHosted.length === 0 &&
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
