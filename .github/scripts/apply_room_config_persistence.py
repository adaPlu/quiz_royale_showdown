from pathlib import Path

path = Path("backend/src/services/RoomService.ts")
text = path.read_text(encoding="utf-8")

old_create = '''          status: "WAITING",
          totalRounds: 10,
          currentRound: 0,
'''
new_create = '''          status: "WAITING",
          totalRounds: 10,
          currentRound: 0,
          isPrivate: config.isPrivate,
          maxPlayers: config.maxPlayers,
          autoStartSolo: config.autoStartSolo,
'''
if old_create not in text:
    raise SystemExit("Room creation pattern not found")
text = text.replace(old_create, new_create, 1)

old_methods = '''  private async setRoomConfig(roomId: string, config: RoomConfig): Promise<void> {
    if (!redisService) {
      return;
    }

    await redisService.setJson(
      `room:${roomId}:config`,
      config,
      ROOM_PLAYERS_TTL_SECONDS
    );
  }

  private async getRoomConfig(roomId: string): Promise<RoomConfig> {
    if (!redisService) {
      return DEFAULT_ROOM_CONFIG;
    }

    const config = await redisService.getJson<RoomConfig>(`room:${roomId}:config`);
    return config ?? DEFAULT_ROOM_CONFIG;
  }
'''
new_methods = '''  private async setRoomConfig(roomId: string, config: RoomConfig): Promise<void> {
    await prisma.room.update({
      where: { id: roomId },
      data: {
        isPrivate: config.isPrivate,
        maxPlayers: config.maxPlayers,
        autoStartSolo: config.autoStartSolo,
      },
    });

    if (redisService) {
      await redisService.setJson(
        `room:${roomId}:config`,
        config,
        ROOM_PLAYERS_TTL_SECONDS
      );
    }
  }

  private async getRoomConfig(roomId: string): Promise<RoomConfig> {
    if (redisService) {
      const cached = await redisService.getJson<RoomConfig>(`room:${roomId}:config`);
      if (cached) return cached;
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: {
        isPrivate: true,
        maxPlayers: true,
        autoStartSolo: true,
      },
    });
    if (!room) {
      throw new NotFoundError(`Room ${roomId} not found`);
    }

    const config: RoomConfig = {
      isPrivate: room.isPrivate,
      maxPlayers: room.maxPlayers,
      autoStartSolo: room.autoStartSolo,
    };

    if (redisService) {
      await redisService.setJson(
        `room:${roomId}:config`,
        config,
        ROOM_PLAYERS_TTL_SECONDS,
      );
    }

    return config;
  }
'''
if old_methods not in text:
    raise SystemExit("Room configuration methods pattern not found")
text = text.replace(old_methods, new_methods, 1)

path.write_text(text, encoding="utf-8")
