import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { roomService } from "../services/RoomService";

export const roomsRouter = Router();

const createRoomSchema = z.object({
  isPrivate: z.boolean().optional(),
  maxPlayers: z.number().int().min(2).max(100).optional(),
});

const joinRoomSchema = z.object({
  roomCode: z.string().trim().min(1).max(8).optional(),
});

roomsRouter.post("/", requireAuth, validate({ body: createRoomSchema }), async (req, res, next) => {
  try {
    const room = await roomService.createRoom(req.jwtClaims!.sub, req.body as z.infer<typeof createRoomSchema>);
    res.status(201).json({ room: roomService.toSnapshot(room) });
  } catch (error) {
    next(error);
  }
});

roomsRouter.post("/join", requireAuth, validate({ body: joinRoomSchema }), async (req, res, next) => {
  try {
    const result = await roomService.joinRoom(req.jwtClaims!.sub, (req.body as z.infer<typeof joinRoomSchema>).roomCode);
    res.json({ room: result.snapshot });
  } catch (error) {
    next(error);
  }
});

roomsRouter.get("/:roomCode", async (req, res, next) => {
  try {
    const room = await roomService.getRoomByCode(String(req.params.roomCode));
    res.json({ room: roomService.toSnapshot(room) });
  } catch (error) {
    next(error);
  }
});

roomsRouter.post("/:roomId/start", requireAuth, async (req, res, next) => {
  try {
    const room = await roomService.startGame(String(req.params.roomId), req.jwtClaims!.sub);
    res.json({ room: roomService.toSnapshot(room) });
  } catch (error) {
    next(error);
  }
});

roomsRouter.post("/:roomId/leave", requireAuth, async (req, res, next) => {
  try {
    await roomService.leaveRoom(String(req.params.roomId), req.jwtClaims!.sub);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
