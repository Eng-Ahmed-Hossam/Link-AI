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

/** Database guards that callers can meet, by constraint name → the stable problem code (07 §1). */
const CONSTRAINT_PROBLEMS: Record<string, () => Problem> = {
  seat_cap_exceeded: () =>
    new Problem(
      409,
      'seat_unavailable',
      'A session this plan covers is full. You can join the waitlist.',
    ),
  seat_cap_below_taken: () =>
    new Problem(409, 'seat_cap_below_filled', 'More seats are already taken in a coming session.'),
  enrolments_one_live: () =>
    new Problem(409, 'already_enrolled', 'This child already has a place in this group.'),
  waitlist_one_open: () =>
    new Problem(409, 'already_waiting', 'This child is already on the waitlist for this group.'),
  reviews_once: () => new Problem(409, 'already_reviewed', 'You already reviewed this term.'),
  review_replies_review_id_key: () =>
    new Problem(409, 'already_replied', 'This review already has a reply.'),
  // Database v2 (migrations 0023–0030).
  student_device_limit: () =>
    new Problem(
      409,
      'student_device_limit',
      'This account already has 2 devices. Ask your parent to remove a device.',
    ),
  student_account_guardian: () =>
    new Problem(403, 'forbidden', 'Only a parent of this child can create a student account.'),
  hall_taken: () => new Problem(409, 'hall_taken', 'The hall is taken at that time.'),
  hall_not_of_centre: () => new Problem(422, 'hall_not_of_centre', 'Pick a hall of this centre.'),
  makeup_session_invalid: () =>
    new Problem(
      422,
      'makeup_session_invalid',
      'Pick a coming session of this centre, for the same subject and school year.',
    ),
  makeup_decided: () =>
    new Problem(409, 'makeup_decided', 'This make-up request was already decided.'),
  makeup_requests_live: () =>
    new Problem(
      409,
      'makeup_already_requested',
      'A make-up for this session is already asked for.',
    ),
  note_locked: () => new Problem(409, 'note_locked', 'An approved note can’t be changed.'),
  note_approver: () =>
    new Problem(403, 'forbidden', 'You need the messages.approve permission at this centre.'),
  focus_plan_locked: () =>
    new Problem(409, 'focus_plan_locked', 'An approved plan can’t be changed.'),
  focus_plan_not_approved: () =>
    new Problem(409, 'focus_plan_not_approved', 'Only an approved plan can be ticked.'),
  topic_unknown: () => new Problem(422, 'topic_unknown', 'Pick a topic of the topic map.'),
};

/** The constraint a PostgreSQL error names, if any. */
export const pgConstraint = (e: unknown): string | null =>
  e && typeof e === 'object' && 'constraint' in e && typeof e.constraint === 'string'
    ? e.constraint
    : null;

export function toProblem(e: unknown): Problem {
  if (e instanceof Problem) return e;
  const constraint = pgConstraint(e);
  if (constraint && CONSTRAINT_PROBLEMS[constraint]) return CONSTRAINT_PROBLEMS[constraint]();
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
