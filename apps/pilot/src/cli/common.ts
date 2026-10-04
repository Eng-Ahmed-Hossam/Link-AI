/** Shared helpers for the `pnpm pilot:*` commands. */
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { configureFollowupStore } from '@link/mocks/followup';
import { pilotConfig, type PilotConfig } from '../config';
import { PilotStore, runningServer } from '../store';

/** `--name value` and `--flag` options plus positional arguments. */
export function args(argv = process.argv.slice(2)) {
  const opts: Record<string, string | true> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opts[a.slice(2)] = next;
        i++;
      } else opts[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { opts, pos };
}

/** Paths typed by the user are relative to where they ran `pnpm` (pnpm sets INIT_CWD). */
export const userPath = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

export function config(): PilotConfig {
  try {
    return pilotConfig();
  } catch (e) {
    fail((e as Error).message);
  }
}

export function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** Commands that change the data need the server stopped (one writer at a time). */
export function requireStopped(cfg: PilotConfig) {
  const pid = runningServer(cfg.dataDir);
  if (pid) fail(`The pilot server is running (pid ${pid}). Stop it first (Ctrl+C in its window).`);
}

export function openStore(cfg: PilotConfig): PilotStore {
  const store = new PilotStore(cfg.dataDir);
  if (!store.exists) fail(`No pilot data in ${cfg.dataDir}. Run pnpm pilot:init first.`);
  store.open();
  configureFollowupStore(store.followupStore());
  return store;
}

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}
