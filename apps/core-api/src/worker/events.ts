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
export class Consumer {
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
