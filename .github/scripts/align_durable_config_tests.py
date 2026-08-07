from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Pattern not found in {path}: {old[:80]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "backend/src/services/RoomService.ts",
    "    const config = await this.getRoomConfig(room.id);\n    const joinResult = await this.joinRoomPlayer(room.id, userId, config);",
    "    const config = this.configFromRoom(room);\n    const joinResult = await this.joinRoomPlayer(room.id, userId, config);",
)

replace_once(
    "backend/src/services/RoomService.ts",
    "  private async setRoomConfig(roomId: string, config: RoomConfig): Promise<void> {",
    '''  private configFromRoom(
    room: Pick<Room, "isPrivate" | "maxPlayers" | "autoStartSolo">,
  ): RoomConfig {
    return {
      isPrivate: room.isPrivate ?? DEFAULT_ROOM_CONFIG.isPrivate,
      maxPlayers: room.maxPlayers ?? DEFAULT_ROOM_CONFIG.maxPlayers,
      autoStartSolo: room.autoStartSolo ?? DEFAULT_ROOM_CONFIG.autoStartSolo,
    };
  }

  private async setRoomConfig(roomId: string, config: RoomConfig): Promise<void> {''',
)

replace_once(
    "backend/src/services/RoomService.ts",
    "    const config = configOverride ?? (await this.getRoomConfig(room.id));",
    "    const config = configOverride ?? this.configFromRoom(room);",
)

replace_once(
    "backend/src/routes/__tests__/rooms.http.test.ts",
    '''const prismaMock = vi.hoisted(() => ({
  roomPlayer: {
    findMany: vi.fn(),
  },
}));''',
    '''const prismaMock = vi.hoisted(() => ({
  room: {
    findUnique: vi.fn(),
  },
  roomPlayer: {
    findMany: vi.fn(),
  },
}));''',
)

replace_once(
    "backend/src/routes/__tests__/rooms.http.test.ts",
    '''    gameOrchestratorMock.startGame.mockResolvedValue(undefined);
    prismaMock.roomPlayer.findMany.mockResolvedValue([{ userId: "host-user" }]);''',
    '''    gameOrchestratorMock.startGame.mockResolvedValue(undefined);
    prismaMock.room.findUnique.mockResolvedValue({ gameDifficulty: "medium" });
    prismaMock.roomPlayer.findMany.mockResolvedValue([{ userId: "host-user" }]);''',
)

replace_once(
    "backend/src/routes/__tests__/admin.http.test.ts",
    "    questionGeneratorServiceMock.generateAndStore.mockResolvedValue(undefined);",
    "    questionGeneratorServiceMock.generateAndStore.mockResolvedValue(0);",
)

replace_once(
    "backend/src/routes/__tests__/admin.http.test.ts",
    '''    expect(response.status).toBe(200);
    expect(questionGeneratorServiceMock.generateAndStore).toHaveBeenCalledWith(500);
    expect(response.body).toMatchObject({
      message: "AI question generation started (target: 500)",
      status: "running",
    });''',
    '''    expect(response.status).toBe(200);
    expect(questionGeneratorServiceMock.generateAndStore).toHaveBeenCalledWith(60);
    expect(response.body).toMatchObject({
      message: "OpenAI question generation completed",
      status: "completed",
      requested: 60,
      added: 0,
    });''',
)

replace_once(
    "backend/src/routes/__tests__/admin.http.test.ts",
    '''  it("logs background generation failures", async () => {
    const error = new Error("generation failed");
    questionGeneratorServiceMock.generateAndStore.mockRejectedValue(error);
    const app = await createAdminTestApp();

    const response = await request(
      app,
      "POST",
      "/api/v1/admin/questions/generate",
      { count: 5 },
      { "x-admin-key": TEST_ADMIN_SECRET }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    expect(loggerMock.error).toHaveBeenCalledWith("AI question generation failed", { error });
  });''',
    '''  it("returns a failure when OpenAI generation fails", async () => {
    questionGeneratorServiceMock.generateAndStore.mockRejectedValue(
      new Error("generation failed"),
    );
    const app = await createAdminTestApp();

    const response = await request(
      app,
      "POST",
      "/api/v1/admin/questions/generate",
      { count: 5 },
      { "x-admin-key": TEST_ADMIN_SECRET }
    );

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: "generation failed",
      code: "INTERNAL_SERVER_ERROR",
    });
  });''',
)
