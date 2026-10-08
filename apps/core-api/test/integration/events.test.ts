// ADR-0003 outbox → relay → topic → queue → consumer, against aws-local (Moto). The test makes its
// own topic and queues, so a dev worker running on the same machine cannot take its messages.
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { CreateTopicCommand, PublishCommand, SubscribeCommand } from '@aws-sdk/client-sns';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { Phones } from '../../src/identity/phone';
import { FieldCipher, LocalKeyWrapper } from '../../src/platform/crypto';
import { Database } from '../../src/platform/db';
import { createLogger } from '../../src/platform/logger';
import type { EventEnvelope } from '../../src/platform/outbox';
import { awsClients, Consumer, OutboxRelay } from '../../src/worker/events';
import { notificationsHandler } from '../../src/worker/notifications';
import { type Api, CapturingSms, Client, PHONES, startApi } from '../helpers';

const RUN = Date.now().toString(36);
let api: Api;
let db: Database;
const config = { ...loadConfig(), EVENTS_TOPIC: `link-test-events-${RUN}` };
const { sns, sqs } = awsClients(config);
const log = createLogger('silent', 'test');
let queueUrl = '';
let dlqUrl = '';
let topicArn = '';

beforeAll(async () => {
  api = await startApi();
  db = new Database(process.env.DATABASE_URL!, process.env.DATABASE_URL_WORKER!);
  topicArn = (await sns.send(new CreateTopicCommand({ Name: config.EVENTS_TOPIC }))).TopicArn!;
  dlqUrl = (await sqs.send(new CreateQueueCommand({ QueueName: `link-test-dlq-${RUN}` })))
    .QueueUrl!;
  const dlqArn = (
    await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['QueueArn'] }),
    )
  ).Attributes!.QueueArn!;
  queueUrl = (
    await sqs.send(new CreateQueueCommand({ QueueName: `link-test-notifications-${RUN}` }))
  ).QueueUrl!;
  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: {
        VisibilityTimeout: '0',
        RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: '5' }),
      },
    }),
  );
  const qArn = (
    await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] }),
    )
  ).Attributes!.QueueArn!;
  await sns.send(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: 'sqs',
      Endpoint: qArn,
      Attributes: { RawMessageDelivery: 'true' },
    }),
  );
});
afterAll(async () => {
  await db.close();
  await api.close();
});

const queueName = () => queueUrl.split('/').pop()!;

describe('ADR-0003 events', () => {
  it('MKT-ACC-06: an invite is written to the outbox with the change, relayed, and the SMS goes out once', async () => {
    const owner = new Client(api);
    const o = await owner.signIn(PHONES.owner);
    await owner.call('POST', `/v1/centres/${o.user.centreIds[0]}/staff`, {
      phone: '01555000888',
      role: 'reception',
    });
    const relay = new OutboxRelay(config, db, sns, log);
    expect(await relay.tick()).toBeGreaterThan(0);
    const sms = new CapturingSms();
    const phones = new Phones(
      config.HMAC_KEY_LOOKUP,
      new FieldCipher(new LocalKeyWrapper(config.FIELD_KEY_LOCAL!)),
    );
    const consumer = new Consumer(
      'notifications',
      queueName(),
      db,
      sqs,
      notificationsHandler(sms, phones),
      log,
    );
    for (let i = 0; i < 10 && !sms.sent.length; i++) await consumer.poll(1);
    expect(sms.sent).toEqual([
      expect.objectContaining({ to: '+201555000888', templateCode: 'staff_invite' }),
    ]);
    // At-least-once: the same event delivered again is dropped by the inbox.
    const event = await api.db
      .selectFrom('platform.outbox_events')
      .select('payload')
      .where('type', '=', 'staff.invited')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    await sns.send(
      new PublishCommand({ TopicArn: topicArn, Message: JSON.stringify(event.payload) }),
    );
    for (let i = 0; i < 3; i++) await consumer.poll(1);
    expect(sms.sent).toHaveLength(1);
    const published = await api.db
      .selectFrom('platform.outbox_events')
      .select('published_at')
      .where('published_at', 'is', null)
      .execute();
    expect(published).toEqual([]);
  });

  it('a handler that keeps failing sends the message to the DLQ after 5 tries', async () => {
    const failing = new Consumer(
      'notifications',
      queueName(),
      db,
      sqs,
      async () => {
        throw new Error('boom');
      },
      log,
    );
    const bad: EventEnvelope = {
      id: crypto.randomUUID(),
      type: 'test.failed',
      version: 1,
      occurredAt: new Date().toISOString(),
      aggregate: { type: 'test', id: crypto.randomUUID() },
      centreId: null,
      data: {},
      requestId: null,
    };
    await sns.send(new PublishCommand({ TopicArn: topicArn, Message: JSON.stringify(bad) }));
    for (let i = 0; i < 8; i++) await failing.poll(1);
    const dead = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: dlqUrl, WaitTimeSeconds: 1 }),
    );
    expect(dead.Messages?.map((m) => (JSON.parse(m.Body!) as EventEnvelope).id)).toEqual([bad.id]);
    // The failed attempts left no inbox row, so a fixed handler can still process it.
    const inbox = await api.db
      .selectFrom('platform.inbox_events')
      .select('event_id')
      .where('event_id', '=', bad.id)
      .execute();
    expect(inbox).toEqual([]);
  });
});
