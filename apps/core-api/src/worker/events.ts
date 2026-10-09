import { CreateTopicCommand, PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { sql } from 'kysely';
import type { Config } from '../config';
import type { Database, Tx } from '../platform/db';
import type { Logger } from '../platform/logger';
import type { EventEnvelope } from '../platform/outbox';

/**
 * ADR-0003: outbox → relay → topic (SNS) → one queue per consumer group (SQS, DLQ after 5 tries)
 * → consumer with inbox dedupe. Locally SNS/SQS are aws-local (Moto).
 *
 * One-server deployments (QUEUE_PROVIDER=postgres, ship job S1) skip SNS/SQS: each consumer reads
 * the outbox itself (`PgConsumer`), with the same inbox dedupe and a failure table for retries and
 * the dead-letter state (migration 0016). Handlers are the same in both modes.
 */
export function awsClients(c: Config) {
  const opts = {
    region: c.S3_REGION,
    ...(c.AWS_ENDPOINT_URL ? { endpoint: c.AWS_ENDPOINT_URL } : {}),
  };
  return { sns: new SNSClient(opts), sqs: new SQSClient(opts) };
}

export class OutboxRelay {
  private topicArn?: string;

  constructor(
    private readonly c: Config,
    private readonly db: Database,
    private readonly sns: SNSClient,
    private readonly log: Logger,
  ) {}

  private async topic() {
    // CreateTopic is idempotent and returns the ARN of an existing topic.
    return (this.topicArn ??= (
      await this.sns.send(new CreateTopicCommand({ Name: this.c.EVENTS_TOPIC }))
    ).TopicArn!);
  }

  /** Publish a batch of unpublished events in order. SKIP LOCKED lets several workers share it. */
  async tick(batch = 50): Promise<number> {
    const arn = await this.topic();
    return this.db.asSystem(async (tx) => {
      const rows = await tx
        .selectFrom('platform.outbox_events')
        .select(['id', 'type', 'payload', 'attempts'])
        .where('published_at', 'is', null)
        .orderBy('created_at')
        .limit(batch)
        .forUpdate()
        .skipLocked()
        .execute();
      for (const r of rows) {
        try {
          await this.sns.send(
            new PublishCommand({
              TopicArn: arn,
              Message: JSON.stringify(r.payload),
              MessageAttributes: { type: { DataType: 'String', StringValue: r.type } },
            }),
          );
          await tx
            .updateTable('platform.outbox_events')
            .set({ published_at: new Date(), attempts: r.attempts + 1, last_error: null })
            .where('id', '=', r.id)
            .execute();
        } catch (e) {
          await tx
            .updateTable('platform.outbox_events')
            .set({ attempts: r.attempts + 1, last_error: String(e).slice(0, 500) })
            .where('id', '=', r.id)
            .execute();
          this.log.warn({ eventId: r.id, type: r.type }, 'outbox publish failed; will retry');
          break; // keep order: later events wait for this one
        }
      }
      return rows.length;
    });
  }

  /**
   * Local only: aws-local keeps queues in memory, so a restart loses messages in flight. Events
   * published more than `graceMs` ago that a running consumer never recorded are published again;
   * consumers dedupe on the inbox, so a second copy is harmless.
   */
  async requeueUnconsumed(consumers: string[], graceMs = 120_000) {
    const res = await this.db.asSystem((tx) =>
      sql`UPDATE platform.outbox_events o SET published_at = NULL
          WHERE o.published_at < now() - make_interval(secs => ${graceMs / 1000})
            AND o.created_at > now() - interval '1 day'
            AND EXISTS (SELECT 1 FROM unnest(${consumers}::text[]) AS c(name)
                        WHERE NOT EXISTS (SELECT 1 FROM platform.inbox_events i
                                          WHERE i.consumer = c.name AND i.event_id = o.id))`.execute(
        tx,
      ),
    );
    return Number(res.numAffectedRows ?? 0);
  }
}

export type Handler = (tx: Tx, e: EventEnvelope) => Promise<void>;

/** One consumer group: receive, dedupe on the inbox, handle, delete. A throw leaves it for a retry. */
export class Consumer implements QueueConsumer {
  private url?: string;

  constructor(
    readonly name: string,
    private readonly queueName: string,
    private readonly db: Database,
    private readonly sqs: SQSClient,
    private readonly handle: Handler,
    private readonly log: Logger,
  ) {}

  async poll(waitSeconds = 5): Promise<number> {
    this.url ??= (
      await this.sqs.send(new GetQueueUrlCommand({ QueueName: this.queueName }))
    ).QueueUrl!;
    const { Messages = [] } = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.url,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: waitSeconds,
      }),
    );
    for (const m of Messages) {
      try {
        const e = JSON.parse(m.Body ?? '{}') as EventEnvelope;
        await this.db.asSystem(async (tx) => {
          const fresh = await tx
            .insertInto('platform.inbox_events')
            .values({ consumer: this.name, event_id: e.id })
            .onConflict((oc) => oc.doNothing())
            .returning('event_id')
            .executeTakeFirst();
          if (fresh) await this.handle(tx, e);
        });
        await this.sqs.send(
          new DeleteMessageCommand({ QueueUrl: this.url, ReceiptHandle: m.ReceiptHandle! }),
        );
      } catch (err) {
        // Not deleted: SQS redelivers after the visibility timeout, then the DLQ takes it (5 tries).
        this.log.error(
          { err, consumer: this.name, messageId: m.MessageId },
          'event handling failed',
        );
      }
    }
    return Messages.length;
  }
}

/** What the worker and gateway loops call, whichever queue is behind it. */
export interface QueueConsumer {
  readonly name: string;
  poll(): Promise<number>;
}

const PG_MAX_ATTEMPTS = 5;
const PG_WINDOW = '7 days';

/**
 * QUEUE_PROVIDER=postgres: a consumer group reading `platform.outbox_events` directly. An event is
 * taken when this consumer has no inbox row for it and it is not waiting for a retry or dead. The
 * inbox insert and the handler share one transaction, so two workers never both handle it (the
 * second one's insert waits, then conflicts). A throw records a failure with exponential back-off;
 * after 5 tries the event is dead for this consumer (the DLQ), kept in `platform.queue_failures`.
 */
export class PgConsumer implements QueueConsumer {
  constructor(
    readonly name: string,
    private readonly db: Database,
    private readonly handle: Handler,
    private readonly log: Logger,
    private readonly opts: { idleMs?: number; window?: string } = {},
  ) {}

  async poll(): Promise<number> {
    const rows = await this.db.asSystem(
      async (tx) =>
        (
          await sql<{ id: string; payload: EventEnvelope | string }>`
            SELECT o.id, o.payload FROM platform.outbox_events o
            WHERE o.created_at > now() - ${this.opts.window ?? PG_WINDOW}::interval
              AND NOT EXISTS (SELECT 1 FROM platform.inbox_events i
                              WHERE i.consumer = ${this.name} AND i.event_id = o.id)
              AND NOT EXISTS (SELECT 1 FROM platform.queue_failures f
                              WHERE f.consumer = ${this.name} AND f.event_id = o.id
                                AND (f.dead_at IS NOT NULL OR f.next_attempt_at > now()))
            ORDER BY o.created_at
            LIMIT 10`.execute(tx)
        ).rows,
    );
    for (const r of rows) {
      const e = (
        typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
      ) as EventEnvelope;
      try {
        await this.db.asSystem(async (tx) => {
          const fresh = await tx
            .insertInto('platform.inbox_events')
            .values({ consumer: this.name, event_id: r.id })
            .onConflict((oc) => oc.doNothing())
            .returning('event_id')
            .executeTakeFirst();
          if (fresh) await this.handle(tx, e);
          await tx
            .deleteFrom('platform.queue_failures')
            .where('consumer', '=', this.name)
            .where('event_id', '=', r.id)
            .execute();
        });
      } catch (err) {
        await this.fail(r.id, err);
      }
    }
    if (!rows.length) await new Promise((res) => setTimeout(res, this.opts.idleMs ?? 1000));
    return rows.length;
  }

  private async fail(eventId: string, err: unknown) {
    const msg = String(err).slice(0, 500);
    const row = await this.db.asSystem(
      async (tx) =>
        (
          await sql<{ attempts: number }>`
          INSERT INTO platform.queue_failures (consumer, event_id, attempts, last_error, next_attempt_at)
          VALUES (${this.name}, ${eventId}, 1, ${msg}, now() + interval '2 seconds')
          ON CONFLICT (consumer, event_id) DO UPDATE SET
            attempts = platform.queue_failures.attempts + 1,
            last_error = EXCLUDED.last_error,
            next_attempt_at = now() + make_interval(secs => power(2, platform.queue_failures.attempts + 1)),
            dead_at = CASE WHEN platform.queue_failures.attempts + 1 >= ${PG_MAX_ATTEMPTS} THEN now() END,
            updated_at = now()
          RETURNING attempts`.execute(tx)
        ).rows[0],
    );
    const dead = (row?.attempts ?? 1) >= PG_MAX_ATTEMPTS;
    this.log.error(
      { err, consumer: this.name, eventId, attempts: row?.attempts, dead },
      dead
        ? 'event dead after 5 tries (see platform.queue_failures)'
        : 'event handling failed; will retry',
    );
  }
}

/** QUEUE_PROVIDER=postgres: nothing to publish; mark events as handed to the queue. */
export class PgRelay {
  constructor(private readonly db: Database) {}
  async tick(): Promise<number> {
    const r = await this.db.asSystem((tx) =>
      sql`UPDATE platform.outbox_events SET published_at = now(), attempts = attempts + 1
          WHERE published_at IS NULL`.execute(tx),
    );
    return Number(r.numAffectedRows ?? 0);
  }
}
