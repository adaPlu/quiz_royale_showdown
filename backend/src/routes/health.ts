import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    ts: Date.now(),
    version: "1.0.0",
    service: "quiz-royale-backend",
    timestamp: new Date().toISOString()
  });
});
