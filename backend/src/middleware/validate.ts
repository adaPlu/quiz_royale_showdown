/**
 * Zod middleware factory for Express route validation.
 *
 * Usage:
 *   router.post("/", validate({ body: mySchema }), handler)
 *
 * Validates req.body, req.params, and req.query against provided schemas.
 * On failure, responds 400 with a structured error and Zod flatten output.
 */

import type { Request, Response, NextFunction } from "express";
import { type ZodTypeAny, ZodError } from "zod";

interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, unknown> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.body = result.error.flatten();
      } else {
        req.body = result.data as unknown;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.params = result.error.flatten();
      } else {
        req.params = result.data as Record<string, string>;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.query = result.error.flatten();
      } else {
        req.query = result.data as Record<string, string>;
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        issues: errors
      });
      return;
    }

    next();
  };
}

/**
 * Parse a request body against a Zod schema and throw on failure.
 * Useful inside async route handlers where you want to throw into
 * the global error handler.
 */
export function parseBody<T>(req: Request, schema: ZodTypeAny): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ZodError(result.error.errors);
  }
  return result.data as T;
}
