import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter, authLimiter } from "./middleware/rateLimiter";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { roomsRouter } from "./routes/rooms";
import usersRouter from "./routes/users";
import powerupsRouter from "./routes/powerups";
import cosmeticsRouter from "./routes/cosmetics";
import leaderboardRouter from "./routes/leaderboard";
import pushRouter from "./routes/push";
import challengesRouter from "./routes/challenges";

export const createApp = () => {
  const app = express();

  app.set("trust proxy", 1);
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
  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1", apiLimiter);
  app.use("/api/v1/rooms", roomsRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/powerups", powerupsRouter);
  app.use("/api/v1/cosmetics", cosmeticsRouter);
  app.use("/api/v1/leaderboard", leaderboardRouter);
  app.use("/api/v1/push", pushRouter);
  app.use("/api/v1/challenges", challengesRouter);
  app.use(errorHandler);

  return app;
};
