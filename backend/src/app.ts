import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { roomsRouter } from "./routes/rooms";

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      name: "Quiz Royale Showdown API",
      status: "ready"
    });
  });

  app.use("/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/rooms", roomsRouter);

  return app;
};
