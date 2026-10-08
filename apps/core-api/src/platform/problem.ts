import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { LOGGER, type Logger } from './logger';
import { requestIdOf } from './request-context';

/**
 * RFC 9457 problem (07 §1). Clients switch on `code`, never on `title`. 404 is also the answer for
 * a row that exists but RLS hides, so nothing leaks (10 §2).
 */
export class Problem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detail);
  }
}

export const notFound = (what = 'resource') =>
  new Problem(404, 'not_found', `This ${what} does not exist or you cannot see it.`);
export const forbidden = (detail = 'You are not allowed to do this.') =>
  new Problem(403, 'forbidden', detail);
export const unauthenticated = (code = 'unauthenticated', detail = 'Sign in to continue.') =>
  new Problem(401, code, detail);

export function problemBody(p: Problem, requestId: string | undefined) {
  return {
    type: `https://docs.link.eg/errors/${p.code.replace(/_/g, '-')}`,
    title: p.detail,
    status: p.status,
    code: p.code,
    detail: p.detail,
    requestId,
    ...p.extra,
  };
}

export function toProblem(e: unknown): Problem {
  if (e instanceof Problem) return e;
  if (e instanceof ZodError)
    return new Problem(422, 'validation_failed', 'Some fields are missing or not valid.', {
      errors: e.issues.map((i) => ({ field: i.path.join('.') || '(body)', code: i.code })),
    });
  if (e instanceof HttpException) {
    const s = e.getStatus();
    if (s === 404) return new Problem(404, 'not_found', 'No such endpoint.');
    if (s === 400) return new Problem(400, 'bad_request', 'The request is malformed.');
    if (s === 413) return new Problem(413, 'payload_too_large', 'The request body is too large.');
    return new Problem(s, 'http_error', e.message);
  }
  // Malformed JSON from express.json().
  if (e instanceof SyntaxError && 'status' in e && (e as { status?: number }).status === 400)
    return new Problem(400, 'bad_request', 'The request body is not valid JSON.');
  return new Problem(500, 'internal_error', 'Something went wrong on our side.');
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly log: Logger) {}

  catch(e: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const p = toProblem(e);
    if (p.status >= 500)
      this.log.error(
        { err: e, method: req.method, path: req.route?.path ?? req.path },
        'request failed',
      );
    if (res.headersSent) return;
    if (p.status === 429 && typeof p.extra.retryAfterSeconds === 'number')
      res.setHeader('retry-after', String(p.extra.retryAfterSeconds));
    res
      .status(p.status)
      .type('application/problem+json')
      .send(JSON.stringify(problemBody(p, requestIdOf(req))));
  }
}
