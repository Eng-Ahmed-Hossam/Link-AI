/**
 * Durable pilot state (ADR-0008): one JSON snapshot written atomically after every change, plus an
 * append-only activity log (JSON Lines) that `pnpm pilot:metrics` reads.
 *
 * - Snapshot: write to a temp file, fsync, rename over `state.json`. A crash leaves either the old or
 *   the new file, never a half-written one.
 * - Log: every activity event is appended (and fsynced) after the snapshot that contains it is on
 *   disk. On open, events in the snapshot that the log lacks are appended, so the log never misses one.
 * - Backups: copies of both files in timestamped folders on the same encrypted drive (48 kept).
 */
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { AuditRow, FollowupState, FollowupStore } from '@link/mocks/followup';

export interface PilotMeta {
  version: 1;
  centreName: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}
export interface AuthState {
  /** userId → scrypt hash of the 6-digit PIN. */
  pins: Record<string, { hash: string; salt: string; setAt: string }>;
  /** userId → wrong PINs in a row and the lock time (5 wrong → 15 minutes). */
  lock: Record<string, { failures: number; lockedUntil: string | null }>;
  /** sha256(session token) → session. The token itself is only ever in the httpOnly cookie. */
  sessions: Record<string, { userId: string; createdAt: string; expiresAt: string }>;
}
export interface Snapshot {
  version: 1;
  meta: PilotMeta;
  auth: AuthState;
  fu: FollowupState;
}

export const files = (dir: string) => ({
  state: join(dir, 'state.json'),
  log: join(dir, 'activity.jsonl'),
  lock: join(dir, 'server.lock'),
});

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Write-temp, fsync, rename (retried: Windows can briefly hold the target, e.g. antivirus). */
export function writeAtomic(file: string, data: string) {
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i < 20 && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')) {
        sleep(50);
        continue;
      }
      throw e;
    }
  }
}

export function readLog(dir: string): AuditRow[] {
  const f = files(dir).log;
  if (!existsSync(f)) return [];
  const out: AuditRow[] = [];
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l) as AuditRow);
    } catch {
      // A line cut short by a power loss or a backup taken mid-write; the snapshot still has it.
    }
  }
  return out;
}

export class PilotStore {
  snap: Snapshot | null = null;
  private logFd: number | null = null;

  constructor(readonly dir: string) {}

  get exists() {
    return existsSync(files(this.dir).state);
  }

  /** Load the snapshot and make sure the log holds every event in it. */
  open(): Snapshot {
    const raw = readFileSync(files(this.dir).state, 'utf8');
    this.snap = JSON.parse(raw) as Snapshot;
    if (this.snap.version !== 1) throw new Error(`Unknown state version ${this.snap.version}`);
    const logged = new Set(readLog(this.dir).map((e) => e.id));
    for (const e of this.snap.fu.audit) if (!logged.has(e.id)) this.appendLog(e);
    return this.snap;
  }

  /** First start only (`pilot:init`): refuses to overwrite existing pilot data. */
  create(snap: Snapshot) {
    if (this.exists) throw new Error(`Pilot data already exists in ${this.dir}.`);
    mkdirSync(this.dir, { recursive: true });
    this.snap = snap;
    this.write();
    for (const e of snap.fu.audit) this.appendLog(e);
  }

  write() {
    if (!this.snap) throw new Error('Store not open.');
    writeAtomic(files(this.dir).state, JSON.stringify(this.snap));
  }

  appendLog(e: AuditRow) {
    this.logFd ??= openSync(files(this.dir).log, 'a');
    writeSync(this.logFd, JSON.stringify(e) + '\n');
    fsyncSync(this.logFd);
  }

  close() {
    if (this.logFd !== null) closeSync(this.logFd);
    this.logFd = null;
  }

  /** The hook the follow-up module saves through (configureFollowupStore). */
  followupStore(): FollowupStore {
    return {
      load: () => this.snap?.fu ?? null,
      save: () => this.write(),
      appendAudit: (e) => this.appendLog(e),
    };
  }
}

// ── backups ──────────────────────────────────────────────────────────────────────
export const KEEP_BACKUPS = 48;
const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');

/** Copy the snapshot and the log into `<backupDir>/<timestamp>/`, then keep the newest 48. */
export function backup(dataDir: string, backupDir: string, reason = 'hourly'): string | null {
  const f = files(dataDir);
  if (!existsSync(f.state)) return null;
  const to = join(backupDir, `${stamp()}-${reason}`);
  mkdirSync(to, { recursive: true });
  copyFileSync(f.state, join(to, 'state.json'));
  if (existsSync(f.log)) copyFileSync(f.log, join(to, 'activity.jsonl'));
  pruneBackups(backupDir);
  return to;
}

export function listBackups(backupDir: string): string[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((n) => existsSync(join(backupDir, n, 'state.json')))
    .sort();
}

export function pruneBackups(backupDir: string, keep = KEEP_BACKUPS) {
  const all = listBackups(backupDir);
  for (const n of all.slice(0, Math.max(0, all.length - keep)))
    rmSync(join(backupDir, n), { recursive: true, force: true });
}

/** Restore one backup (the server must be stopped). The current data is backed up first. */
export function restore(dataDir: string, backupDir: string, name: string) {
  const from = join(backupDir, name);
  if (!existsSync(join(from, 'state.json'))) throw new Error(`No backup named ${name}.`);
  // Read it first: the safety backup below may prune the oldest backup, which can be this one.
  const state = readFileSync(join(from, 'state.json'), 'utf8');
  JSON.parse(state); // refuse a damaged backup
  const log = existsSync(join(from, 'activity.jsonl'))
    ? readFileSync(join(from, 'activity.jsonl'), 'utf8')
    : null;
  backup(dataDir, backupDir, 'before-restore');
  const f = files(dataDir);
  mkdirSync(dataDir, { recursive: true });
  writeAtomic(f.state, state);
  if (log !== null) writeAtomic(f.log, log);
  else rmSync(f.log, { force: true });
}

// ── single running server ────────────────────────────────────────────────────────
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
/**
 * The pid of a running pilot server on this data folder, if any. The server refreshes the lock
 * every 30 s; a lock older than 90 s is stale (a killed server, or Windows reusing the pid).
 */
export const LOCK_REFRESH_MS = 30_000;
export function runningServer(dataDir: string, now = Date.now()): number | null {
  const f = files(dataDir).lock;
  if (!existsSync(f)) return null;
  try {
    const { pid, at } = JSON.parse(readFileSync(f, 'utf8')) as { pid: number; at: number };
    return alive(pid) && now - at < 3 * LOCK_REFRESH_MS ? pid : null;
  } catch {
    return null; // an old or damaged lock file
  }
}
export function takeLock(dataDir: string) {
  const other = runningServer(dataDir);
  if (other && other !== process.pid)
    throw new Error(`A pilot server (pid ${other}) is already running on this data.`);
  refreshLock(dataDir);
}
export function refreshLock(dataDir: string) {
  writeAtomic(files(dataDir).lock, JSON.stringify({ pid: process.pid, at: Date.now() }));
}
export function releaseLock(dataDir: string) {
  rmSync(files(dataDir).lock, { force: true });
}
export const sizeOf = (p: string) => (existsSync(p) ? statSync(p).size : 0);
