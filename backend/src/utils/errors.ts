/**
 * AppError hierarchy for Quiz Royale backend.
 *
 * All thrown errors that should produce structured HTTP responses should
 * extend AppError.  The global error handler converts them to JSON.
 */

export class AppError extends Error {
  /** HTTP status code. */
  readonly status: number;
  /** Machine-readable error code for client logic. */
  readonly code: string;
  /** Whether to log this error as an unexpected server fault. */
  readonly isOperational: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      isOperational?: boolean;
      cause?: unknown;
    } = {}
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? "INTERNAL_SERVER_ERROR";
    this.isOperational = options.isOperational ?? true;

    // Maintains correct prototype chain in compiled JS
    Object.setPrototypeOf(this, new.target.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ─── 4xx Client Errors ─────────────────────────────────────────────────────

export class BadRequestError extends AppError {
  constructor(message = "Bad request", code = "BAD_REQUEST") {
    super(message, { status: 400, code, isOperational: true });
  }
}

export class ValidationError extends AppError {
  readonly issues: unknown;

  constructor(message = "Validation failed", issues?: unknown) {
    super(message, { status: 400, code: "VALIDATION_ERROR", isOperational: true });
    this.issues = issues;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, { status: 401, code: "UNAUTHORIZED", isOperational: true });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, { status: 403, code: "FORBIDDEN", isOperational: true });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, { status: 404, code: "NOT_FOUND", isOperational: true });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, { status: 409, code: "CONFLICT", isOperational: true });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(message, { status: 429, code: "TOO_MANY_REQUESTS", isOperational: true });
  }
}

// ─── 5xx Server Errors ─────────────────────────────────────────────────────

export class InternalServerError extends AppError {
  constructor(message = "Internal server error", cause?: unknown) {
    super(message, {
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      isOperational: false,
      cause
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable") {
    super(message, { status: 503, code: "SERVICE_UNAVAILABLE", isOperational: true });
  }
}

// ─── Guard ─────────────────────────────────────────────────────────────────

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
