import { Router } from "express";

import { requireHttpAuth, type AuthenticatedRequest } from "../middleware/httpAuth";
import { roomStore } from "../services/RoomStore";

export const roomsRouter = Router();

roomsRouter.post("/", requireHttpAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const room = roomStore.createRoom({
    id: authReq.authUser.id,
    displayName: authReq.authUser.displayName
  });

  res.status(201).json({
    room
  });
});

roomsRouter.get("/:roomCode", (req, res) => {
  const room = roomStore.getRoomByCode(req.params.roomCode);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  res.json({
    room
  });
});

roomsRouter.post("/:roomId/start", requireHttpAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const room = roomStore.startRoom(String(req.params.roomId), authReq.authUser.id);
  if (!room) {
    return res.status(404).json({ error: "Room not found or user is not the host" });
  }

  return res.json({
    room
  });
});

roomsRouter.post("/:roomId/leave", requireHttpAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const result = roomStore.leaveRoom(String(req.params.roomId), authReq.authUser.id);
  if (!result.room && !result.removed) {
    return res.status(404).json({ error: "Room not found" });
  }

  return res.status(204).send();
});
