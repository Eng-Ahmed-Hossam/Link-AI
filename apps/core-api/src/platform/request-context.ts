import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Request IDs (07 §1 errors carry `requestId`). An incoming `x-request-id` is kept when it looks
 * safe (so a trace can cross services); otherwise a new one is made. Echoed on every response.
 */
const SAFE = /^[A-Za-z0-9._-]{8,80}$/;
const KEY = Symbol('requestId');

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const id = incoming && SAFE.test(incoming) ? incoming : `req_${randomUUID().replace(/-/g, '')}`;
  (req as unknown as Record<symbol, string>)[KEY] = id;
  res.setHeader('x-request-id', id);
  next();
}

export const requestIdOf = (req: Request): string | undefined =>
  (req as unknown as Record<symbol, string | undefined>)[KEY];
