import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { pinoHttp } from 'pino-http';
import type { SmsSender } from './adapters/sms';
import { apiModule } from './app.module';
import type { Config } from './config';
import { Database } from './platform/db';
import type { Logger } from './platform/logger';
import { ProblemFilter } from './platform/problem';
import { Redises } from './platform/redis';
import { requestIdMiddleware, requestIdOf } from './platform/request-context';

/** The HTTP API, configured the same way for `main` and for the integration tests. */
export async function createApi(config: Config, log: Logger, overrides: { sms?: SmsSender } = {}) {
  const mod = await apiModule(config, log, overrides);
  const app = await NestFactory.create<NestExpressApplication>(mod, {
    logger: ['error', 'warn'],
    bodyParser: false,
  });
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
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
  app.use(express.json({ limit: '100kb' }));
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
