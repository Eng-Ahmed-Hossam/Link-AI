import {
  type CallHandler,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpCode,
  Inject,
  Injectable,
  type NestInterceptor,
  RequestMapping,
  RequestMethod,
  SetMetadata,
  UseGuards,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { catchError, from, mergeMap, type Observable } from 'rxjs';
import { z } from 'zod';
import type { RouteDef } from '../contract/routes';
import { CONFIG } from './di';
import type { Config } from '../config';
import { Tokens } from '../identity/tokens';
import { Database, isStaffOf } from './db';
import { Problem, forbidden, notFound, unauthenticated } from './problem';
import { Redises } from './redis';

/** Who is calling (set by the AuthGuard). The rest of the RLS context is loaded per transaction. */
export interface Principal {
  userId: string;
  lang: 'ar' | 'en';
  /** How the token came: a Bearer header (teacher app) or the httpOnly cookie (web). */
  transport: 'bearer' | 'cookie';
}

export const ACCESS_COOKIE = 'link_at';
export const REFRESH_COOKIE = 'link_rt';
export const COOKIE_HEADER = 'x-link-auth';

type Req = Request & { principal?: Principal; route_def?: RouteDef };

export const langOf = (req: Request): 'ar' | 'en' =>
  req.header('accept-language')?.toLowerCase().startsWith('en') ? 'en' : 'ar';

/** The web marks cookie-authenticated calls with `X-Link-Auth: cookie` (07 §1, CSRF guard). */
export const usesCookies = (req: Request) => req.header(COOKIE_HEADER) === 'cookie';

const ROUTE = Symbol('route');
const METHOD: Record<RouteDef['method'], RequestMethod> = {
  get: RequestMethod.GET,
  post: RequestMethod.POST,
  put: RequestMethod.PUT,
  patch: RequestMethod.PATCH,
  delete: RequestMethod.DELETE,
};

/**
 * Reads the token (Bearer header, or the cookie plus the CSRF header). `user` routes need one;
 * `public` routes get the principal when a valid token is present (e.g. feature flags).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(Tokens) private readonly tokens: Tokens,
    @Inject(Database) private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const def = this.reflector.get<RouteDef>(ROUTE, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest<Req>();
    req.route_def = def;
    const bearer = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    let token: string | undefined;
    let transport: Principal['transport'] = 'bearer';
    if (bearer) token = bearer;
    else if (cookie) {
      if (!usesCookies(req)) {
        if (def.auth === 'user')
          throw forbidden(
            'This request needs the X-Link-Auth header (cross-site requests are refused).',
          );
      } else {
        token = cookie;
        transport = 'cookie';
      }
    }
    if (!token) {
      if (def.auth === 'user') throw unauthenticated();
      return true;
    }
    try {
      const claims = await this.tokens.verifyAccess(token);
      req.principal = {
        userId: claims.sub,
        lang: req.header('accept-language') ? langOf(req) : claims.lang,
        transport,
      };
    } catch (e) {
      if (def.auth === 'user') throw e;
    }
    // Tenant routes (07 §2c, 10 §2): anyone who is not staff of that centre gets 404 — before
    // the body is even read, so nothing about the centre leaks through validation errors.
    if (def.path.startsWith('/v1/centres/{id}') && req.principal) {
      const centreId = String(req.params.id ?? '');
      const ok = await this.db.asUser(req.principal.userId, async (_tx, c) =>
        isStaffOf(c, centreId),
      );
      if (!ok) throw notFound('centre');
    }
    return true;
  }
}

/** Parsed and validated `{params, query, body}` for the current route (422 on failure). */
export const Input = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Req>();
  const def = req.route_def!;
  return {
    params: def.params ? def.params.parse(req.params) : {},
    query: def.query ? def.query.parse(req.query) : {},
    body: def.body ? def.body.parse(req.body ?? {}) : undefined,
  };
});

/** The signed-in caller (throws 401 on public routes when nobody is signed in). */
export const Caller = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const p = ctx.switchToHttp().getRequest<Req>().principal;
  if (!p) throw unauthenticated();
  return p;
});

/** The response language: the Accept-Language header, else the signed-in user's saved one. */
export const CallerLang = createParamDecorator((_: unknown, ctx: ExecutionContext): 'ar' | 'en' => {
  const req = ctx.switchToHttp().getRequest<Req>();
  return req.principal?.lang ?? langOf(req);
});

/** The caller if signed in, else null. */
export const MaybeCaller = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal | null =>
    ctx.switchToHttp().getRequest<Req>().principal ?? null,
);

/**
 * Idempotency (07 §1): the first response to a key is stored for 24 h and replayed for a retry
 * with the same body (`Idempotent-Replayed: true`); the same key with a different body is 422.
 * Money routes also keep a durable copy in platform.idempotency_keys.
 */
const IDEM_TTL = 86_400;
const IN_FLIGHT = 'in-flight';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(Redises) private readonly redis: Redises,
    @Inject(Database) private readonly db: Database,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<Req>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const def = req.route_def!;
    if (!def.idempotent) return next.handle();
    const key = req.header('idempotency-key');
    if (!key || key.length < 8 || key.length > 255)
      throw new Problem(422, 'idempotency_key_required', 'Send an Idempotency-Key header (07 §1).');
    const scope = req.principal?.userId ?? 'anon';
    const methodPath = `${def.method.toUpperCase()} ${req.originalUrl.split('?')[0]}`;
    const hash = createHash('sha256')
      .update(methodPath)
      .update(JSON.stringify(req.body ?? null))
      .digest('hex');
    const rkey = this.redis.key('idem', scope, key);
    const r = this.redis.state;
    const stored = await r.get(rkey);
    if (stored === null) {
      if (
        (await r.set(rkey, JSON.stringify({ hash, state: IN_FLIGHT }), 'EX', IDEM_TTL, 'NX')) !==
        'OK'
      )
        throw new Problem(409, 'idempotency_in_progress', 'The same request is still running.');
    } else {
      const s = JSON.parse(stored) as {
        hash: string;
        state: string;
        status?: number;
        body?: unknown;
      };
      if (s.hash !== hash)
        throw new Problem(
          422,
          'idempotency_key_reused',
          'This Idempotency-Key was used for a different request.',
        );
      if (s.state === IN_FLIGHT)
        throw new Problem(409, 'idempotency_in_progress', 'The same request is still running.');
      res.setHeader('idempotent-replayed', 'true');
      res.status(s.status ?? 200);
      return from([s.body ?? null]);
    }
    return next.handle().pipe(
      mergeMap(async (body) => {
        const status = res.statusCode;
        await r.set(rkey, JSON.stringify({ hash, state: 'done', status, body }), 'EX', IDEM_TTL);
        if (def.money && req.principal)
          await this.db.asUser(req.principal.userId, (tx) =>
            tx
              .insertInto('platform.idempotency_keys')
              .values({
                user_id: req.principal!.userId,
                key,
                method_path: methodPath,
                request_hash: hash,
                response_code: status,
                response_body: JSON.stringify(body ?? null),
                expires_at: new Date(Date.now() + IDEM_TTL * 1000),
              })
              .onConflict((oc) => oc.doNothing())
              .execute(),
          );
        return body;
      }),
      // A failed request frees its key, so the client may retry with the same key.
      catchError(async (e: unknown) => {
        await r.del(rkey);
        throw e;
      }),
    );
  }
}

/**
 * Outside prod, every response is checked against its contract schema: a handler that drifts from
 * the OpenAPI document fails loudly in tests instead of surprising an app.
 */
@Injectable()
export class ContractCheckInterceptor implements NestInterceptor {
  constructor(@Inject(CONFIG) private readonly c: Config) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const def = ctx.switchToHttp().getRequest<Req>().route_def;
    if (this.c.APP_ENV === 'prod' || !def?.response) return next.handle();
    const schema = def.response;
    return next.handle().pipe(
      mergeMap(async (body) => {
        const r = (schema as z.ZodType).safeParse(body);
        if (!r.success)
          throw new Error(`Response of ${def.name} breaks its contract: ${r.error.message}`);
        return body;
      }),
    );
  }
}

/** Mount a contract route: method, path, status, auth, input parsing and idempotency. */
export function Endpoint(def: RouteDef) {
  return applyDecorators(
    RequestMapping({ path: def.path.replace(/\{(\w+)\}/g, ':$1'), method: METHOD[def.method] }),
    HttpCode(def.status ?? (def.response === null ? 204 : 200)),
    SetMetadata(ROUTE, def),
    UseGuards(AuthGuard),
    UseInterceptors(ContractCheckInterceptor, IdempotencyInterceptor),
  );
}

type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined;
/** The typed result of `@Input()` for a route: `@Input() i: In<typeof routes.addChild>`. */
export type In<R extends RouteDef> = {
  params: Parsed<R['params']>;
  query: Parsed<R['query']>;
  body: Parsed<R['body']>;
};
