import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env";
import { requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter, authLimiter } from "./middleware/rateLimiter";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { roomsRouter } from "./routes/rooms";
import { adminRouter } from "./routes/admin";
import challengesRouter from "./routes/challenges";
import cosmeticsRouter from "./routes/cosmetics";
import friendsRouter from "./routes/friends";
import leaderboardRouter from "./routes/leaderboard";
import powerupsRouter from "./routes/powerups";
import pushRouter from "./routes/push";
import usersRouter from "./routes/users";
import { NotFoundError } from "./utils/errors";

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

  // Apply rate limiting: strict limit on auth, general limit on all other API routes
  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1", apiLimiter);
  app.use("/api/v1/rooms", roomsRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/friends", requireAuth, friendsRouter);
  app.use("/api/v1/powerups", powerupsRouter);
  app.use("/api/v1/cosmetics", cosmeticsRouter);
  app.use("/api/v1/leaderboard", leaderboardRouter);
  app.use("/api/v1/challenges", challengesRouter);
  app.use("/api/v1/push", pushRouter);
  app.use("/api/v1/admin", adminRouter);

  app.use((_req, _res, next) => {
    next(new NotFoundError("Route not found"));
  });

  app.use(errorHandler);

  return app;
};
