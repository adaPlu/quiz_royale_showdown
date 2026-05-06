import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request { requestId: string; }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}
