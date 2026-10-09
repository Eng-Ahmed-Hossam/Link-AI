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
import { formatProblems, linkEnv, productionProblems, sampleWorldProblems } from './platform/guard';
import { createLogger } from './platform/logger';
import { Redises } from './platform/redis';
import { createApi } from './server';
import { EnrolmentJobs } from './enrolment/jobs';
import { RentInvoices } from './ledger/rent-invoices';
import { Money } from './payments/money';
import {
  awsClients,
  Consumer,
  type Handler,
  OutboxRelay,
  PgConsumer,
  PgRelay,
  type QueueConsumer,
} from './worker/events';
import { moneyJobs, Scheduler } from './worker/jobs';
import { notificationsHandler } from './worker/notifications';
import { Messages } from './followup/messages';
import { Voice } from './followup/voice';
import { followupHandler, followupJobs, messagingHandler, voiceHandler } from './worker/followup';

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
  const pg = config.QUEUE_PROVIDER === 'postgres';
  const { sns } = awsClients(config);
  const relay = pg ? new PgRelay(db) : new OutboxRelay(config, db, sns, log);
  // Calls outside the database (ai-service) run after the consumer's transaction, never inside it.
  const later = (fn: () => Promise<unknown>) =>
    void fn().catch((err: unknown) => log.error({ err }, 'after-commit work failed'));
  const consumers = [
    consumer(
      'notifications',
      config.QUEUE_NOTIFICATIONS,
      db,
      notificationsHandler(app.get<SmsSender>(SMS_SENDER), app.get(Phones)),
    ),
    // R3: the rules on confirmed records and saved notes, and voice notes → ai-service.
    consumer('followup', config.QUEUE_FOLLOWUP, db, followupHandler()),
    consumer('voice', config.QUEUE_VOICE, db, voiceHandler(app.get(Voice), later)),
  ];
  let stopping = false;
  const stop = async () => {
    stopping = true;
    healthServer.close();
    await app.close();
    await Promise.allSettled([db.close(), app.get(Redises).close()]);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  log.info({ consumers: consumers.map((c) => c.name) }, 'worker started');
  // /health for the deployment: 200 while the loops keep turning (the relay ticks every 0.5 s).
  let lastTick = Date.now();
  const health = express();
  health.get('/health', (_req, res) => {
    const age = Math.round((Date.now() - lastTick) / 1000);
    res
      .status(age < 60 ? 200 : 503)
      .json({ status: age < 60 ? 'ok' : 'stalled', lastTickSecondsAgo: age });
  });
  const healthServer = health.listen(config.WORKER_HEALTH_PORT);
  const loop = async (name: string, every: number, fn: () => Promise<unknown>) => {
    while (!stopping) {
      try {
        await fn();
      } catch (err) {
        log.error({ err, job: name }, 'job failed');
      }
      lastTick = Date.now();
      await new Promise((r) => setTimeout(r, every));
    }
  };
  const scheduler = new Scheduler(app.get(Redises), log, [
    ...moneyJobs({
      jobs: app.get(EnrolmentJobs),
      money: app.get(Money),
      rent: app.get(RentInvoices),
    }),
    ...followupJobs({ voice: app.get(Voice), messages: app.get(Messages) }),
  ]);
  void loop('outbox-relay', 500, () => relay.tick());
  void loop('scheduler', 5_000, () => scheduler.tick());
  for (const c of consumers) void loop(`consumer:${c.name}`, 100, () => c.poll());
  if (isLocal(config) && relay instanceof OutboxRelay)
    void loop('outbox-requeue', 60_000, () =>
      relay.requeueUnconsumed([...consumers.map((c) => c.name), 'messaging']),
    );
}

/** A consumer group on the configured queue (SQS, or the outbox itself with QUEUE_PROVIDER=postgres). */
function consumer(name: string, queueName: string, db: Database, handle: Handler): QueueConsumer {
  if (config.QUEUE_PROVIDER === 'postgres') return new PgConsumer(name, db, handle, log);
  return new Consumer(name, queueName, db, awsClients(config).sqs, handle, log);
}

async function gateway() {
  // The messaging-gateway (R3): approved messages → WhatsAppSender (whatsapp-fake locally). The
  // provider's signed webhooks arrive at the API (`/v1/webhooks/messaging/{provider}`); delivery
  // status moves only on them (BR-APR-11).
  const app = await NestFactory.createApplicationContext(
    { module: class GatewayModule {}, providers: coreProviders(config, log), global: true },
    { logger: ['error', 'warn'] },
  );
  const db = app.get(Database);
  const messages = app.get(Messages);
  const later = (fn: () => Promise<unknown>) =>
    void fn().catch((err: unknown) => log.error({ err }, 'message not handed over'));
  const messaging = consumer(
    'messaging',
    config.QUEUE_MESSAGING,
    db,
    messagingHandler(messages, later),
  );
  let stopping = false;
  const http = express();
  http.get('/health', (_req, res) =>
    res.json({ status: 'ok', channels: [config.WHATSAPP_PROVIDER] }),
  );
  const server = http.listen(config.GATEWAY_PORT, () =>
    log.info(
      { port: config.GATEWAY_PORT, provider: config.WHATSAPP_PROVIDER },
      'messaging-gateway listening',
    ),
  );
  const stop = async () => {
    stopping = true;
    server.close();
    await app.close();
    await Promise.allSettled([db.close(), app.get(Redises).close()]);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  while (!stopping) {
    try {
      await messaging.poll();
    } catch (err) {
      log.error({ err }, 'messaging consumer failed');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/**
 * The production guard (docs/security-checklist.md): with LINK_ENV=production, refuse to start
 * while a fake provider, a demo route, a local key or the sample world is configured. Every wrong
 * setting is printed by name, never its value.
 */
async function guard() {
  const kind = linkEnv();
  const problems = productionProblems(config);
  // The database is checked only once the settings are right (it may not even be reachable).
  if (kind === 'production' && !problems.length) {
    const db = new Database(config.DATABASE_URL, config.DATABASE_URL_WORKER);
    try {
      problems.push(...(await sampleWorldProblems(db)));
    } finally {
      await db.close();
    }
  }
  if (problems.length) {
    const msg = formatProblems(kind, problems);
    console.error(msg);
    log.fatal({ linkEnv: kind, problems }, 'production guard refused to start');
    process.exit(1);
  }
}

const run = { api, worker, gateway }[entry];
if (!run) {
  log.error({ entry }, 'unknown entrypoint: use api, worker or gateway');
  process.exit(1);
}
guard()
  .then(run)
  .catch((err: unknown) => {
    log.fatal({ err }, 'start-up failed');
    process.exit(1);
  });
