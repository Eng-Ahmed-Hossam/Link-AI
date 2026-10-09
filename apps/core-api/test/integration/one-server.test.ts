// Ship job S1: what lets Link run on one server with no cloud account — the outbox as the queue
// (QUEUE_PROVIDER=postgres), the encrypted file store (STORAGE_PROVIDER=file) and the server key
// (FIELD_KEY). Sample data only.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileAudioStore } from '../../src/adapters/storage';
import { loadConfig } from '../../src/config';
import { Database } from '../../src/platform/db';
import { uuidv7 } from '../../src/platform/ids';
import { createLogger } from '../../src/platform/logger';
import { enqueue, type EventEnvelope } from '../../src/platform/outbox';
import { PgConsumer, PgRelay } from '../../src/worker/events';

const RUN = Date.now().toString(36);
const log = createLogger('silent', 'test');
let db: Database;

beforeAll(() => {
  if (!/link_test/.test(process.env.DATABASE_URL ?? ''))
    throw new Error('Run with pnpm test:api (link_test database).');
  db = new Database(process.env.DATABASE_URL!, process.env.DATABASE_URL_WORKER!);
});
afterAll(() => db.close());

const publish = (type: string, data: Record<string, unknown> = {}) =>
  db.asSystem((tx) =>
    enqueue(tx, {
      type,
      aggregateType: 'test',
      aggregateId: uuidv7(),
      data: { run: RUN, ...data },
    }),
  );

describe('QUEUE_PROVIDER=postgres: the outbox is the queue (one server)', () => {
  it('each consumer gets each event once, even with two workers polling at the same time', async () => {
    const seen: string[] = [];
    const handler = async (_tx: unknown, e: EventEnvelope) => {
      if ((e.data as { run?: string }).run === RUN) seen.push(e.id);
    };
    const a = new PgConsumer(`test-a-${RUN}`, db, handler, log, { idleMs: 0, window: '1 minute' });
    const a2 = new PgConsumer(`test-a-${RUN}`, db, handler, log, { idleMs: 0, window: '1 minute' });
    const e1 = await publish('test.happened');
    const e2 = await publish('test.happened');
    for (let i = 0; i < 20 && seen.length < 2; i++) await Promise.all([a.poll(), a2.poll()]);
    expect(seen.sort()).toEqual([e1.id, e2.id].sort());
    // Polling again changes nothing (inbox dedupe).
    await Promise.all([a.poll(), a2.poll()]);
    expect(seen).toHaveLength(2);
    // A second consumer group gets its own copy.
    const other: string[] = [];
    const b = new PgConsumer(
      `test-b-${RUN}`,
      db,
      async (_tx, e) => {
        if (e.id === e1.id) other.push(e.id);
      },
      log,
      { idleMs: 0, window: '1 minute' },
    );
    for (let i = 0; i < 20 && !other.length; i++) await b.poll();
    expect(other).toEqual([e1.id]);
    // The relay just marks the events handed over.
    expect(await new PgRelay(db).tick()).toBeGreaterThanOrEqual(0);
  });

  it('a failing handler is retried with back-off, then dead after 5 tries (the DLQ), and the handler work rolls back', async () => {
    const name = `test-fail-${RUN}`;
    const e = await publish('test.failing');
    let calls = 0;
    const c = new PgConsumer(
      name,
      db,
      async (tx, ev) => {
        if (ev.id !== e.id) return;
        calls++;
        await (tx as Parameters<Parameters<Database['asSystem']>[0]>[0])
          .insertInto('platform.inbox_events')
          .values({ consumer: `${name}-side-effect`, event_id: uuidv7() })
          .execute();
        throw new Error('handler failed (sample)');
      },
      log,
      { idleMs: 0, window: '1 minute' },
    );
    const failure = () =>
      db.asSystem((tx) =>
        tx
          .selectFrom('platform.queue_failures')
          .selectAll()
          .where('consumer', '=', name)
          .where('event_id', '=', e.id)
          .executeTakeFirst(),
      );
    for (let attempt = 1; attempt <= 5; attempt++) {
      await c.poll();
      expect(calls).toBe(attempt);
      const f = await failure();
      expect(f?.attempts).toBe(attempt);
      // Waiting for its retry: the next poll skips it.
      await c.poll();
      expect(calls).toBe(attempt);
      // Make it due now (instead of waiting 2^n seconds).
      await db.asSystem((tx) =>
        tx
          .updateTable('platform.queue_failures')
          .set({ next_attempt_at: new Date(Date.now() - 1000) })
          .where('consumer', '=', name)
          .execute(),
      );
    }
    expect((await failure())?.dead_at).not.toBeNull();
    await c.poll();
    expect(calls).toBe(5); // dead: never handled again
    // No inbox row (not handled), and the handler's side effect rolled back each time.
    const rows = await db.asSystem((tx) =>
      tx
        .selectFrom('platform.inbox_events')
        .select(['consumer', 'event_id'])
        .where((w) =>
          w.or([
            w.and([w('consumer', '=', name), w('event_id', '=', e.id)]),
            w('consumer', '=', `${name}-side-effect`),
          ]),
        )
        .execute(),
    );
    expect(rows).toEqual([]);
  });
});

describe('STORAGE_PROVIDER=file: an encrypted folder (one server)', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'link-files-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('stores bytes encrypted (AES-256-GCM), reads them back, deletes; paths reveal nothing', async () => {
    const config = {
      ...loadConfig(),
      STORAGE_PROVIDER: 'file' as const,
      FILE_STORAGE_DIR: dir,
      STORAGE_KEY: randomBytes(32).toString('base64'),
    };
    const store = new FileAudioStore(config);
    const key = 'voice/cen-nour/salma/note-1.webm';
    const audio = new TextEncoder().encode('RIFF sample audio bytes (synthetic)');
    await store.put(key, audio, 'audio/webm');
    const files = await readdir(dir, { recursive: true });
    const stored = files.find((f) => /[0-9a-f]{64}$/.test(f))!;
    expect(stored).toBeTruthy();
    expect(stored).not.toMatch(/salma|nour|voice/);
    const raw = await readFile(join(dir, stored));
    expect(raw.includes(Buffer.from('sample audio'))).toBe(false);
    const back = await store.get(key);
    expect(back?.contentType).toBe('audio/webm');
    expect(Buffer.from(back!.bytes).toString()).toBe('RIFF sample audio bytes (synthetic)');
    // A different key cannot read it (GCM authentication).
    const other = new FileAudioStore({
      ...config,
      STORAGE_KEY: randomBytes(32).toString('base64'),
    });
    await expect(other.get(key)).rejects.toThrow();
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
  });
});

describe('Configuration for a server (APP_ENV other than local)', () => {
  const base = () => {
    const env = { ...process.env } as NodeJS.ProcessEnv;
    env.APP_ENV = 'staging';
    delete env.FIELD_KEY_LOCAL;
    return env;
  };
  it('needs FIELD_KEY; refuses FIELD_KEY_LOCAL; STORAGE_PROVIDER=file needs STORAGE_KEY', () => {
    expect(() => loadConfig(base())).toThrow(/FIELD_KEY: required outside APP_ENV=local/);
    const key = randomBytes(32).toString('base64');
    expect(loadConfig({ ...base(), FIELD_KEY: key }).FIELD_KEY).toBe(key);
    expect(() => loadConfig({ ...base(), FIELD_KEY: key, FIELD_KEY_LOCAL: key })).toThrow(
      /FIELD_KEY_LOCAL: local only/,
    );
    expect(() => loadConfig({ ...base(), FIELD_KEY: key, STORAGE_PROVIDER: 'file' })).toThrow(
      /STORAGE_KEY/,
    );
  });
});
