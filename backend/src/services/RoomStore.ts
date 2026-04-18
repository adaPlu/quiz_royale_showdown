import { ulid } from "ulid";

import type { PlayerSummary, RoomSnapshot } from "../types/contracts";

type RoomRecord = {
  roomId: string;
  code: string;
  hostUserId: string;
  phase: RoomSnapshot["phase"];
  roundNumber: number;
  totalRounds: number;
  players: Map<string, PlayerSummary>;
};

const randomCode = (): string => ulid().slice(-6).toUpperCase();

const toSnapshot = (room: RoomRecord): RoomSnapshot => ({
  roomId: room.roomId,
  code: room.code,
  phase: room.phase,
  roundNumber: room.roundNumber,
  totalRounds: room.totalRounds,
  players: Array.from(room.players.values()).sort((left, right) => right.score - left.score)
});

export class RoomStore {
  private readonly roomsById = new Map<string, RoomRecord>();
  private readonly roomIdsByCode = new Map<string, string>();

  createRoom(host: { id: string; displayName: string }, totalRounds = 10): RoomSnapshot {
    const roomId = ulid();
    let code = randomCode();
    while (this.roomIdsByCode.has(code)) {
      code = randomCode();
    }

    const room: RoomRecord = {
      roomId,
      code,
      hostUserId: host.id,
      phase: "WAITING",
      roundNumber: 0,
      totalRounds,
      players: new Map([
        [
          host.id,
          {
            id: host.id,
            displayName: host.displayName,
            score: 0,
            streak: 0,
            isEliminated: false
          }
        ]
      ])
    };

    this.roomsById.set(roomId, room);
    this.roomIdsByCode.set(code, roomId);
    return toSnapshot(room);
  }

  getRoomByCode(code: string): RoomSnapshot | null {
    const roomId = this.roomIdsByCode.get(code.toUpperCase());
    if (!roomId) {
      return null;
    }

    return this.getRoomById(roomId);
  }

  getRoomById(roomId: string): RoomSnapshot | null {
    const room = this.roomsById.get(roomId);
    return room ? toSnapshot(room) : null;
  }

  joinRoom(
    roomCode: string,
    player: { id: string; displayName: string }
  ): { room: RoomSnapshot; player: PlayerSummary } | null {
    const roomId = this.roomIdsByCode.get(roomCode.toUpperCase());
    if (!roomId) {
      return null;
    }

    const room = this.roomsById.get(roomId);
    if (!room) {
      return null;
    }

    const existingPlayer = room.players.get(player.id);
    const nextPlayer =
      existingPlayer ??
      ({
        id: player.id,
        displayName: player.displayName,
        score: 0,
        streak: 0,
        isEliminated: false
      } satisfies PlayerSummary);

    room.players.set(player.id, nextPlayer);

    return {
      room: toSnapshot(room),
      player: nextPlayer
    };
  }

  leaveRoom(roomId: string, userId: string): { room: RoomSnapshot | null; removed: boolean } {
    const room = this.roomsById.get(roomId);
    if (!room) {
      return { room: null, removed: false };
    }

    const removed = room.players.delete(userId);
    if (!removed) {
      return { room: toSnapshot(room), removed: false };
    }

    if (room.players.size === 0) {
      this.roomsById.delete(roomId);
      this.roomIdsByCode.delete(room.code);
      return { room: null, removed: true };
    }

    return {
      room: toSnapshot(room),
      removed: true
    };
  }

  startRoom(roomId: string, requesterUserId: string): RoomSnapshot | null {
    const room = this.roomsById.get(roomId);
    if (!room || room.hostUserId !== requesterUserId) {
      return null;
    }

    room.phase = "COUNTDOWN";
    room.roundNumber = 1;
    return toSnapshot(room);
  }
}

export const roomStore = new RoomStore();
