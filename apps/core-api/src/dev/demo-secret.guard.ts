import { createHash, timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Problem } from '../platform/problem';

/** The header every `/__demo/*` call sends when the server has DEMO_ROUTES_SECRET. */
export const DEMO_SECRET_HEADER = 'x-link-demo-secret';

const digest = (v: string) => createHash('sha256').update(v).digest();

/** True when the header matches the secret (constant time; no secret = nothing to check). */
export function demoSecretOk(secret: string | undefined, header: string | undefined) {
  if (!secret) return true;
  if (!header) return false;
  return timingSafeEqual(digest(secret), digest(header));
}

/**
 * Demo routes on a hosted server (src/platform/guard.ts demoRoutesAllowed): a call without the
 * right secret gets 401 and changes nothing. A developer machine sets no secret and is unchanged.
 */
@Injectable()
export class DemoSecretGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (demoSecretOk(process.env.DEMO_ROUTES_SECRET, req.header(DEMO_SECRET_HEADER))) return true;
    throw new Problem(401, 'demo_secret_required', 'Demo routes need the demo secret.');
  }
}
