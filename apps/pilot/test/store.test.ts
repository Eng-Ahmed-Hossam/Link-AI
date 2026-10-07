// A2 durable state: atomic snapshot + append-only log, backups and restore, and a hard kill of the
// real server process in the middle of a session.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { addDays, cairoToday } from '@link/mocks/time';
import { REPO_ROOT } from '../src/config';
import {
  KEEP_BACKUPS,
  PilotStore,
  backup,
  files,
  listBackups,
  readLog,
  restore,
} from '../src/store';
import { seedPilot, tempDir } from './helpers';

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });

let child: ChildProcess | null = null;
afterEach(() => {
  child?.kill('SIGKILL');
  child = null;
});

function startServer(dir: string, web: number, teacher: number): Promise<ChildProcess> {
  // The tsx loader in this process, not the tsx CLI: the CLI runs the script in a child process,
  // so a SIGKILL would hit only the wrapper and leave the real server (and its lock) running.
  const tsx = pathToFileURL(
    join(REPO_ROOT, 'apps', 'pilot', 'node_modules', 'tsx', 'dist', 'loader.mjs'),
  );
  const server = join(REPO_ROOT, 'apps', 'pilot', 'src', 'server.ts');
  const c = spawn(process.execPath, ['--import', tsx.href, server], {
    env: {
      ...process.env,
      LINK_MODE: 'pilot',
      PILOT_DATA_DIR: dir,
      PILOT_BIND: '127.0.0.1',
      PILOT_WEB_PORT: String(web),
      PILOT_TEACHER_PORT: String(teacher),
      PILOT_SKIP_BUNDLE_CHECK: '1',
      DEMO_DEFAULT_FLAGS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = c;
  return new Promise((ok, fail) => {
    let out = '';
    c.stdout!.on('data', (d) => {
      out += String(d);
      if (out.includes('teacher app (this laptop)')) ok(c);
    });
    c.stderr!.on('data', (d) => (out += String(d)));
    c.on('exit', (code) => fail(new Error(`server exited ${code}: ${out}`)));
  });
}

describe('A2 durable state', () => {
  it('a hard kill mid-session loses no acknowledged write', async () => {
    const dir = tempDir();
    const pins = seedPilot(dir);
    const [web, teacherPort] = [await freePort(), await freePort()];
    const base = `http://127.0.0.1:${web}`;
    await startServer(dir, web, teacherPort);
    const post = (
      path: string,
      cookie: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, ...headers },
        body: JSON.stringify(body),
      });
    const signIn = await post('/v1/pilot/sessions', '', {
      userId: 'usr-p002',
      pin: pins['usr-p002'],
    });
    const cookie = signIn.headers.get('set-cookie')!.split(';')[0]!;
    const sid = `grp-p-G1~${addDays(cairoToday(), -1)}`;
    const rec = await (
      await post('/v1/groups/grp-p-G1/session-records', cookie, { groupSessionId: sid })
    ).json();
    const conf = await post(
      `/v1/session-records/${rec.id}/confirm`,
      cookie,
      {},
      { 'idempotency-key': 'kill-test' },
    );
    expect(conf.status).toBe(200);

    // A burst of notes; kill the process while they are in flight.
    const acked: string[] = [];
    const burst = Array.from({ length: 40 }, (_, i) =>
      post(`/v1/students/stu-p-S2/notes`, cookie, {
        groupId: 'grp-p-G1',
        tag: 'positive',
        body: `note ${i}`,
      })
        .then(async (r) => {
          if (r.status === 201 || r.status === 200) acked.push((await r.json()).body);
        })
        .catch(() => undefined),
    );
    await new Promise((r) => setTimeout(r, 40));
    child!.kill('SIGKILL');
    await Promise.all(burst);
    await new Promise((r) => setTimeout(r, 300));

    // The state file is whole, and every acknowledged write is in it.
    const raw = readFileSync(files(dir).state, 'utf8');
    const snap = JSON.parse(raw);
    expect(snap.fu.records.find((r: { id: string }) => r.id === rec.id).status).toBe('confirmed');
    const saved = snap.fu.notes.map((n: { body: string }) => n.body);
    for (const b of acked) expect(saved).toContain(b);
    // After a restart the log holds every event of the snapshot (reconciled on open).
    const store = new PilotStore(dir);
    store.open();
    store.close();
    const logged = new Set(readLog(dir).map((e) => e.id));
    for (const e of snap.fu.audit) expect(logged.has(e.id)).toBe(true);
    expect(readLog(dir).some((e) => e.kind === 'record.confirmed')).toBe(true);

    // The server starts again on the same data and the teacher's record is there.
    await startServer(dir, web, teacherPort);
    const again = await post('/v1/pilot/sessions', '', {
      userId: 'usr-p002',
      pin: pins['usr-p002'],
    });
    const c2 = again.headers.get('set-cookie')!.split(';')[0]!;
    const list = await (
      await fetch(`${base}/v1/groups/grp-p-G1/session-records`, { headers: { cookie: c2 } })
    ).json();
    expect(list.find((r: { id: string }) => r.id === rec.id).status).toBe('confirmed');
  }, 60_000);

  it('refuses a second server on the same data', async () => {
    const dir = tempDir();
    seedPilot(dir);
    const [a, b] = [await freePort(), await freePort()];
    await startServer(dir, a, b);
    const first = child;
    const [c, d] = [await freePort(), await freePort()];
    await expect(startServer(dir, c, d)).rejects.toThrow(/already running/);
    child = first;
  }, 60_000);

  it(`backups keep the newest ${KEEP_BACKUPS}; restore puts a backup back and keeps the current data aside`, () => {
    const dir = tempDir();
    seedPilot(dir);
    const bdir = join(dir, 'backups');
    const first = backup(dir, bdir, 'first')!;
    const store = new PilotStore(dir);
    store.open();
    store.snap!.meta.centreName = 'changed';
    store.write();
    store.close();
    for (let i = 0; i < KEEP_BACKUPS + 3; i++) backup(dir, bdir, `n${String(i).padStart(2, '0')}`);
    expect(listBackups(bdir)).toHaveLength(KEEP_BACKUPS);
    expect(existsSync(first)).toBe(false); // the oldest went first
    const keep = listBackups(bdir)[0]!;
    restore(dir, bdir, keep);
    expect(listBackups(bdir).some((n) => n.endsWith('before-restore'))).toBe(true);
    expect(JSON.parse(readFileSync(files(dir).state, 'utf8')).meta.centreName).toBe('changed');
  });

  it('restore refuses a damaged backup and changes nothing', () => {
    const dir = tempDir();
    seedPilot(dir);
    const bdir = join(dir, 'backups');
    const b = backup(dir, bdir, 'x')!;
    writeFileSync(join(b, 'state.json'), '{ not json');
    const before = readFileSync(files(dir).state, 'utf8');
    expect(() => restore(dir, bdir, b.split(/[\\/]/).at(-1)!)).toThrow();
    expect(readFileSync(files(dir).state, 'utf8')).toBe(before);
  });
});

describe('single writer lock', () => {
  it('a lock from a killed server (or a reused pid) is stale after 90 s', async () => {
    const { refreshLock, runningServer, LOCK_REFRESH_MS } = await import('../src/store');
    const dir = tempDir();
    refreshLock(dir); // this test process holds it
    expect(runningServer(dir)).toBe(process.pid);
    expect(runningServer(dir, Date.now() + 3 * LOCK_REFRESH_MS + 1)).toBeNull();
  });
});
