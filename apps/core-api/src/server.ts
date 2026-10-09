import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { type Overrides, apiModule } from './app.module';
import type { Config } from './config';
import { Database } from './platform/db';
import type { Logger } from './platform/logger';
import { ProblemFilter } from './platform/problem';
import { Redises } from './platform/redis';
import { requestIdMiddleware, requestIdOf } from './platform/request-context';

/** The HTTP API, configured the same way for `main` and for the integration tests. */
export async function createApi(config: Config, log: Logger, overrides: Overrides = {}) {
  const mod = await apiModule(config, log, overrides);
  const app = await NestFactory.create<NestExpressApplication>(mod, {
    logger: ['error', 'warn'],
    bodyParser: false,
  });
  app.disable('x-powered-by');
  app.set(
    'trust proxy',
    config.TRUST_PROXY.split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );
  // docs/security-checklist.md: API answers are never framed, sniffed or cached by a browser, and
  // carry personal data only to the caller (no shared caches). HSTS comes from the reverse proxy.
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('cross-origin-resource-policy', 'same-site');
    res.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('cache-control', 'no-store');
    next();
  });
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger: log,
      genReqId: (req) => requestIdOf(req as express.Request) ?? 'unknown',
      customProps: (req) => ({ requestId: requestIdOf(req as express.Request) }),
      // Paths only: no query strings (search terms) and no bodies in the logs.
      serializers: {
        req: (r: { method: string; url: string }) => ({
          method: r.method,
          path: r.url.split('?')[0],
        }),
        res: (r: { statusCode: number }) => ({ status: r.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    }),
  );
  // The signed voice upload (PUT /v1/voice-notes/{id}/audio) carries raw audio bytes, ≤ 15 MB.
  app.use(
    express.raw({
      type: (req) =>
        (req.method === 'PUT' && /^\/v1\/voice-notes\/[^/]+\/audio/.test(req.url ?? '')) ||
        (req.method === 'POST' && /^\/v1\/assistant\/transcribe/.test(req.url ?? '')),
      limit: '15mb',
    }),
  );
  app.use(
    express.json({
      limit: '100kb',
      // Provider webhooks are verified on the exact bytes that were signed (docs/05 §7).
      verify: (req, _res, buf) => {
        if (req.url?.startsWith('/v1/webhooks/'))
          (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(cookieParser());
  const origins = config.CORS_ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // Bearer-token callers on another origin (the teacher app on Expo web). The web is same-origin.
  if (origins.length)
    app.enableCors({
      origin: origins,
      credentials: false,
      allowedHeaders: [
        'authorization',
        'content-type',
        'idempotency-key',
        'accept-language',
        'x-request-id',
      ],
      exposedHeaders: ['x-request-id', 'idempotent-replayed', 'retry-after'],
    });
  app.useGlobalFilters(new ProblemFilter(log));
  app.enableShutdownHooks();
  const close = async () => {
    await app.close();
    await Promise.allSettled([app.get(Database).close(), app.get(Redises).close()]);
  };
  return { app, close };
}
