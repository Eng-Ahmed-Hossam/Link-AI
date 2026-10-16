// pnpm db:backup / db:restore <file> — the local database (docs/plan/database-v2.md §7).
// pg_dump and pg_restore run inside the local Postgres container; the dump is streamed through
// Node into backups/, never through shell redirection, so the binary file survives PowerShell.
import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';

export const BACKUP_DIR = join(ROOT, 'backups');
const DB = 'link';

/** `link-20261016-142233-bb1bc5e.dump` (local time, then the commit the schema came from). */
export function backupName(date, sha) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${DB}-${stamp}-${(sha || 'nogit').slice(0, 7)}.dump`;
}

/** Only the local database: APP_ENV=local and a migrator URL on this machine. */
export function backupProblems(env) {
  const problems = [];
  if (env.APP_ENV !== 'local') problems.push(`APP_ENV is ${env.APP_ENV ?? 'unset'}, not local`);
  let host = '';
  try {
    host = new URL(env.DATABASE_URL_MIGRATOR ?? '').hostname;
  } catch {
    /* reported below */
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host))
    problems.push(`DATABASE_URL_MIGRATOR points at "${host || 'nothing'}", not this machine`);
  return problems;
}

function container() {
  const id = execFileSync('docker', ['compose', '-p', 'link', 'ps', '-q', 'postgres'], {
    encoding: 'utf8',
  }).trim();
  if (!id) throw new Error('The local Postgres container is not running (pnpm dev:infra).');
  return id;
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** Runs a command in the container; stdin/stdout optionally streamed from/to files. */
async function inContainer(args, { from, to } = {}) {
  const child = spawn('docker', ['exec', '-i', container(), ...args], {
    stdio: [from ? 'pipe' : 'ignore', to ? 'pipe' : 'inherit', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += d));
  // The file is complete only when the write stream has closed, not when the process exits.
  const written = to
    ? new Promise((res, rej) =>
        child.stdout.pipe(createWriteStream(to)).on('close', res).on('error', rej),
      )
    : Promise.resolve();
  if (from) createReadStream(from).pipe(child.stdin);
  const code = await new Promise((res, rej) => child.on('error', rej).on('close', res));
  await written;
  if (code !== 0) throw new Error(`${args[0]} exited ${code}: ${err.trim()}`);
}

/** Dumps the local database (with CREATE DATABASE) into backups/; returns the file path. */
export async function backup() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, backupName(new Date(), gitSha()));
  await inContainer(['pg_dump', '-U', 'postgres', '-d', DB, '-Fc', '--create'], { to: file });
  const size = statSync(file).size;
  if (size < 1024) throw new Error(`The dump is only ${size} bytes: ${file}`);
  return { file, size };
}

/** Replaces the local database with a dump made by backup(). */
export async function restore(file) {
  statSync(file);
  await inContainer([
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
    '-c',
    `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`,
  ]);
  await inContainer(
    ['pg_restore', '-U', 'postgres', '-d', 'postgres', '--create', '--exit-on-error'],
    {
      from: file,
    },
  );
}

/** Users and the latest migration: a quick look at what a database holds. */
export function summary() {
  const q = (sql) =>
    execFileSync(
      'docker',
      ['exec', container(), 'psql', '-U', 'postgres', '-d', DB, '-At', '-c', sql],
      { encoding: 'utf8' },
    ).trim();
  return {
    users: Number(q('SELECT count(*) FROM identity.users')),
    migration: q('SELECT max(version) FROM schema_migrations'),
  };
}
