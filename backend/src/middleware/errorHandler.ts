/**
 * Global Express error handler.
 *
 * Must be registered LAST — after all routes and other middleware.
 * Converts AppError instances and unexpected errors to structured JSON responses.
 */

import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { isAppError } from "../utils/errors";
import { logger } from "../utils/logger";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ─── Zod validation errors ────────────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      issues: err.flatten()
    });
    return;
  }

  // ─── Operational AppError ─────────────────────────────────────────────
  if (isAppError(err)) {
    if (!err.isOperational) {
      logger.error("Unexpected AppError", {
        code: err.code,
        status: err.status,
        message: err.message,
        stack: err.stack
      });
    }

    const body: Record<string, unknown> = {
      error: err.message,
      code: err.code
    };

    if ("issues" in err && err.issues !== undefined) {
      body.issues = err.issues;
    }

    res.status(err.status).json(body);
    return;
  }

  // ─── Unhandled / unknown errors ──────────────────────────────────────
  logger.error("Unhandled error", {
    method: req.method,
    url: req.url,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });

  const isDev = process.env.NODE_ENV !== "production";

  res.status(500).json({
    error: isDev && err instanceof Error ? err.message : "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
    ...(isDev && err instanceof Error ? { stack: err.stack } : {})
  });
}
