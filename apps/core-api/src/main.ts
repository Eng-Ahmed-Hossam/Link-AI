import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { type SmsSender, SMS_SENDER } from './adapters/sms';
import { coreProviders } from './app.module';
import { loadConfig, isLocal } from './config';
import { Phones } from './identity/phone';
import { FieldCipher } from './platform/crypto';
import { currentKeyIds, KEY_MISMATCH_HELP, keyMismatches } from './platform/data-keys';
import { Database } from './platform/db';
import { createLogger } from './platform/logger';
import { Redises } from './platform/redis';
import { createApi } from './server';
import { awsClients, Consumer, OutboxRelay } from './worker/events';
import { notificationsHandler } from './worker/notifications';

/**
 * core-api entrypoints (ADR-0001): `api` (HTTP), `worker` (outbox relay, consumers, jobs) and
 * `gateway` (messaging-gateway; its WhatsApp channel arrives in R3). One codebase, three processes.
 */
const entry = process.argv[2] ?? 'api';
const config = loadConfig();
const log = createLogger(config.LOG_LEVEL, `core-api:${entry}`);

async function api() {
  const { app } = await createApi(config, log);
  await warnOnKeyMismatch(app.get(Database), app.get(FieldCipher));
  await app.listen(config.CORE_API_PORT);
  log.info({ port: config.CORE_API_PORT, env: config.APP_ENV }, 'core-api listening');
}

/** docs/10 §5: data written with other keys cannot be read; say so loudly at start-up. */
async function warnOnKeyMismatch(db: Database, cipher: FieldCipher) {
  const bad = await keyMismatches(db, currentKeyIds(cipher.keyId, config.HMAC_KEY_LOOKUP));
  if (bad.length) log.error({ mismatches: bad }, KEY_MISMATCH_HELP);
}

async function worker() {
  const app = await NestFactory.createApplicationContext(
    { module: class WorkerModule {}, providers: coreProviders(config, log), global: true },
    { logger: ['error', 'warn'] },
  );
  const db = app.get(Database);
  const { sns, sqs } = awsClients(config);
  const relay = new OutboxRelay(config, db, sns, log);
  const consumers = [
    new Consumer(
      'notifications',
      config.QUEUE_NOTIFICATIONS,
      db,
      sqs,
      notificationsHandler(app.get<SmsSender>(SMS_SENDER), app.get(Phones)),
      log,
    ),
  ];
  let stopping = false;
  const stop = async () => {
    stopping = true;
    await app.close();
    await Promise.allSettled([db.close(), app.get(Redises).close()]);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  log.info({ consumers: consumers.map((c) => c.name) }, 'worker started');
  const loop = async (name: string, every: number, fn: () => Promise<unknown>) => {
    while (!stopping) {
      try {
        await fn();
      } catch (err) {
        log.error({ err, job: name }, 'job failed');
      }
      await new Promise((r) => setTimeout(r, every));
    }
  };
  void loop('outbox-relay', 500, () => relay.tick());
  for (const c of consumers) void loop(`consumer:${c.name}`, 100, () => c.poll());
  if (isLocal(config))
    void loop('outbox-requeue', 60_000, () =>
      relay.requeueUnconsumed(consumers.map((c) => c.name)),
    );
}

async function gateway() {
  // R3 adds the WhatsAppSender fake, its webhooks and the send loop. Until then the process starts,
  // answers its health check and waits, so `pnpm dev` already runs all three entrypoints.
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok', channels: [] }));
  const port = Number(process.env.GATEWAY_PORT ?? 4002);
  app.listen(port, () => log.info({ port }, 'messaging-gateway listening (no channels until R3)'));
}

const run = { api, worker, gateway }[entry];
if (!run) {
  log.error({ entry }, 'unknown entrypoint: use api, worker or gateway');
  process.exit(1);
}
run().catch((err: unknown) => {
  log.fatal({ err }, 'start-up failed');
  process.exit(1);
});
