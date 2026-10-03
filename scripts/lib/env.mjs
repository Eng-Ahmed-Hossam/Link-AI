// Shared helpers for repo scripts. Cross-platform (PowerShell, cmd, bash): no shell syntax.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_FILE = join(ROOT, '.env.local');
export const COMPOSE_FILE = join(ROOT, 'infra', 'local', 'docker-compose.yml');

/** Load .env.local into process.env (existing variables win). */
export function loadEnv() {
  if (!existsSync(ENV_FILE)) {
    fail(
      `Missing .env.local. Copy .env.example to .env.local and fill in local values (docs/14 §3).`,
    );
  }
  process.loadEnvFile(ENV_FILE);
}

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) fail(`Missing in .env.local: ${missing.join(', ')}`);
  return Object.fromEntries(names.map((n) => [n, process.env[n]]));
}

/** Hide credentials in URLs (scheme://user:secret@host) before anything is printed. */
export const redact = (text) => String(text).replace(/(\w+:\/\/[^:/\s]+:)[^@\s]+@/g, '$1***@');

export function fail(message) {
  console.error(`\n✖ ${redact(message)}\n`);
  process.exit(1);
}

/** Run a command, streaming output. Exits on failure unless `allowFail`. */
export function run(cmd, args, { allowFail = false, ...opts } = {}) {
  // A shell is needed only for Windows .cmd shims; it would mangle quoted args for real executables.
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: /\.cmd$/i.test(cmd),
    ...opts,
  });
  if (r.status !== 0 && !allowFail) fail(`${cmd} ${args.join(' ')} failed (exit ${r.status})`);
  return r.status ?? 1;
}

export const compose = (...args) => [
  'compose',
  '-f',
  COMPOSE_FILE,
  '--env-file',
  ENV_FILE,
  ...args,
];
