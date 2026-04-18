import { Router } from "express";
import { ulid } from "ulid";

export const roomsRouter = Router();

roomsRouter.get("/:roomCode", (req, res) => {
  res.json({
    room: {
      id: ulid(),
      code: req.params.roomCode.toUpperCase(),
      status: "WAITING",
      totalPlayers: 0
    }
  });
});
