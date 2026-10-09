// Child processes for the local launchers: prefixed output, restart on crash, clean stop.
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from './env.mjs';

const procs = [];
const restarts = {};
let stopping = false;

export function start(name, args, env, cmd = 'pnpm') {
  const p = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '1', ...env },
    shell: true,
  });
  const tag = `[${name}]`.padEnd(8);
  const out = (stream) => (d) =>
    String(d)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => stream.write(`${tag}${l}\n`));
  p.stdout.on('data', out(process.stdout));
  p.stderr.on('data', out(process.stderr));
  p.on('exit', (code) => {
    if (stopping) return;
    restarts[name] = (restarts[name] ?? 0) + 1;
    if (restarts[name] <= 3) {
      console.log(`${tag}exited (${code ?? 'signal'}); restarting (${restarts[name]}/3)…`);
      start(name, args, env, cmd);
    } else {
      console.log(`${tag}exited (${code ?? 'signal'}) too often; stopping.`);
      stopAll(1);
    }
  });
  procs.push(p);
}

export function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']);
    else p.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

export async function waitFor(url, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/** Names of the given `[name, url]` pairs that already answer (a port in use). */
export async function busy(pairs) {
  const out = [];
  for (const [name, url] of pairs) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1500) });
      out.push(`${name} (${new URL(url).port})`);
    } catch {
      /* free */
    }
  }
  return out;
}
