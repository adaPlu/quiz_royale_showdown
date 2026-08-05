from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    if old not in content:
        raise RuntimeError(f"Expected text not found in {path}: {old[:160]!r}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")

# Keep readiness failure recovery while preserving the established route contract:
# atomically start first, validate the required question capacity, and reset on failure.
replace_once(
    "backend/src/routes/rooms.ts",
    '''      const currentRoom = await roomService.getRoomById(roomId);
      const difficulty = await getRoomGameDifficulty(roomId);
      await gameOrchestrator.assertQuestionBankReady(
        difficulty,
        currentRoom.room.totalRounds,
      );
      const room = await roomService.startGame(roomId, requesterId, { allowSolo });
''',
    '''      const room = await roomService.startGame(roomId, requesterId, { allowSolo });
      const difficulty = await getRoomGameDifficulty(roomId);
      try {
        await gameOrchestrator.assertQuestionBankReady(
          difficulty,
          room.room.totalRounds,
        );
      } catch (error) {
        await roomService.resetStartFailure(
          roomId,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
''',
)

# RoomService now uses one conditional update to prevent concurrent starts.
replace_once(
    "backend/src/services/__tests__/RoomService.test.ts",
    '''    prismaMock.room.findUnique.mockResolvedValueOnce(waitingRoom).mockResolvedValueOnce(startedRoom);
    prismaMock.room.update.mockResolvedValue(undefined);

    const result = await service.startGame("room-1", "host-user", { allowSolo: true });

    expect(prismaMock.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: {
        status: "COUNTDOWN",
        startedAt: expect.any(Date),
      },
    });
''',
    '''    prismaMock.room.findUnique.mockResolvedValueOnce(waitingRoom).mockResolvedValueOnce(startedRoom);
    prismaMock.room.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.startGame("room-1", "host-user", { allowSolo: true });

    expect(prismaMock.room.updateMany).toHaveBeenCalledWith({
      where: {
        id: "room-1",
        hostUserId: "host-user",
        status: "WAITING",
      },
      data: {
        status: "COUNTDOWN",
        startedAt: expect.any(Date),
      },
    });
''',
)

# The final standings contract now resolves public names from user records.
replace_once(
    "backend/src/services/__tests__/GameOrchestrator.test.ts",
    '''  room: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
};''',
    '''  room: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  user: {
    findMany: vi.fn()
  }
};''',
)
replace_once(
    "backend/src/services/__tests__/GameOrchestrator.test.ts",
    '''vi.mock("../RoomService", () => ({
  roomService: {
    resetStartFailure: vi.fn()
  }
}));''',
    '''vi.mock("../RoomService", () => ({
  roomService: {
    resetStartFailure: vi.fn(),
    getRoomById: vi.fn().mockResolvedValue(null)
  }
}));''',
)
replace_once(
    "backend/src/services/__tests__/GameOrchestrator.test.ts",
    '''    prismaMock.room.findUnique.mockResolvedValue({ seasonId: null });
    prismaMock.room.update.mockResolvedValue({});''',
    '''    prismaMock.room.findUnique.mockResolvedValue({ seasonId: null });
    prismaMock.room.update.mockResolvedValue({});
    prismaMock.user.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({
        id,
        email: `${id}@example.com`,
        displayName: id,
      })),
    );''',
)
replace_once(
    "backend/src/services/__tests__/GameOrchestrator.test.ts",
    '''          { playerId: "finalist-b", rank: 1, score: 400, xpAwarded: 40 },
          { playerId: "finalist-a", rank: 2, score: 300, xpAwarded: 30 }''',
    '''          {
            playerId: "finalist-b",
            displayName: "finalist-b",
            rank: 1,
            score: 400,
            xpAwarded: 40,
          },
          {
            playerId: "finalist-a",
            displayName: "finalist-a",
            rank: 2,
            score: 300,
            xpAwarded: 30,
          }''',
)

print("Updated gameplay tests for atomic starts and named final standings.")
