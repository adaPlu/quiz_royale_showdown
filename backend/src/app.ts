import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter, authLimiter } from "./middleware/rateLimiter";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import challengesRouter from "./routes/challenges";
import cosmeticsRouter from "./routes/cosmetics";
import friendsRouter from "./routes/friends";
import { healthRouter } from "./routes/health";
import leaderboardRouter from "./routes/leaderboard";
import powerupsRouter from "./routes/powerups";
import pushRouter from "./routes/push";
import { roomsRouter } from "./routes/rooms";
import usersRouter from "./routes/users";
import { NotFoundError } from "./utils/errors";

export const createApp = () => {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "64kb" }));

  app.get("/", (_req, res) => {
    res.json({
      name: "Quiz Royale Showdown API",
      status: "ready"
    });
  });

  app.use("/health", healthRouter);
  app.use("/api/v1", apiLimiter);
  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/challenges", challengesRouter);
  app.use("/api/v1/cosmetics", cosmeticsRouter);
  app.use("/api/v1/friends", friendsRouter);
  app.use("/api/v1/leaderboard", leaderboardRouter);
  app.use("/api/v1/powerups", powerupsRouter);
  app.use("/api/v1/push", pushRouter);
  app.use("/api/v1/rooms", roomsRouter);
  app.use("/api/v1/users", usersRouter);

  app.use((_req, _res, next) => {
    next(new NotFoundError("Route not found"));
  });

  app.use(errorHandler);

  return app;
};
