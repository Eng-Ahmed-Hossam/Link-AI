// pnpm pilot:start — the owner web's pilot build (Next.js on 127.0.0.1:3100, not reachable from the
// LAN) and the pilot server in front of it. Ctrl+C stops both; the pilot server saves and takes a
// backup on the way out. A crashed process is restarted (up to 5 times).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// The laptop's settings (PILOT_VOICE, MODEL_ROUTING_CONFIG…) are needed here too, not only by the
// pilot server: they decide whether ai-service starts and how. Real env vars win (as in config.ts).
const ENV_FILE = join(ROOT, 'apps', 'pilot', '.env.pilot');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const clean = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/DEMO|^NEXT_PUBLIC_|^EXPO_PUBLIC_/.test(k)),
);
const procs = new Map();
const restarts = {};
let stopping = false;

function start(name, args, cwd, env, cmd = 'pnpm') {
  const p = spawn(cmd, args, { cwd, env: { ...clean, ...env }, shell: true });
  const tag = `[${name}]`.padEnd(9);
  const out = (stream) => (d) =>
    String(d)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => stream.write(`${tag}${l}\n`));
  p.stdout.on('data', out(process.stdout));
  p.stderr.on('data', out(process.stderr));
  p.on('exit', (code) => {
    procs.delete(name);
    if (stopping) return;
    restarts[name] = (restarts[name] ?? 0) + 1;
    if (code === 1 && name === 'pilot' && restarts[name] === 1) {
      // The pilot server refused to start (start-up check, missing data or certificate): stop.
      console.log(`${tag}did not start. Fix the message above, then run pnpm pilot:start again.`);
      return stop(1);
    }
    if (restarts[name] <= 5) {
      console.log(`${tag}stopped (${code ?? 'signal'}); restarting (${restarts[name]}/5)…`);
      setTimeout(() => start(name, args, cwd, env, cmd), 2000);
    } else {
      console.log(`${tag}stopped too often. Check the messages above.`);
      stop(1);
    }
  });
  procs.set(name, p);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  // Ctrl+C reaches every process in the window: give the pilot server time to save and back up.
  const until = Date.now() + 10_000;
  const wait = () => {
    if (!procs.size || Date.now() > until) {
      for (const p of procs.values())
        if (process.platform === 'win32')
          spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']);
        else p.kill('SIGTERM');
      process.exit(code);
    }
    setTimeout(wait, 200);
  };
  wait();
}
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(s, () => stop(0));

const upstream = new URL(process.env.PILOT_WEB_UPSTREAM ?? 'http://127.0.0.1:3100');
start(
  'web',
  ['exec', 'next', 'start', '-H', '127.0.0.1', '-p', upstream.port],
  join(ROOT, 'apps', 'web'),
  {
    NEXT_DIST_DIR: '.next-pilot',
    NEXT_TELEMETRY_DISABLED: '1',
  },
);
// Part B: voice notes. ai-service (local Whisper + Ollama) on 127.0.0.1 only, sharing a fresh
// random token with the pilot server for this run.
const voice = process.env.PILOT_VOICE === '1';
const token = randomBytes(24).toString('base64url');
if (voice) {
  const dataDir = process.env.PILOT_DATA_DIR ?? '';
  start(
    'ai',
    ['--directory', join(ROOT, 'apps', 'ai-service'), 'run', 'python', '-m', 'ai_service'],
    ROOT,
    {
      AI_SERVICE_TOKEN: token,
      AI_SERVICE_HOST: '127.0.0.1',
      AI_USAGE_LOG: dataDir ? join(dataDir, 'ai-usage.jsonl') : '',
      PYTHONUTF8: '1',
    },
    'uv',
  );
}
start('pilot', ['--filter', '@link/pilot', 'run', 'start'], ROOT, {
  LINK_MODE: 'pilot',
  ...(voice ? { AI_SERVICE_TOKEN: token } : {}),
});
