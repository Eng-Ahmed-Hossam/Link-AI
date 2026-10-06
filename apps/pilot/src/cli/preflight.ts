/**
 * `pnpm pilot:preflight` (4.1) — run on the pilot laptop before day one and every morning.
 * Prints ✅/❌ per item with a one-line fix in Arabic and English; exits non-zero on any ❌.
 *
 *   pnpm pilot:preflight            all checks (with voice: a 5-second synthetic clip is transcribed)
 *   pnpm pilot:preflight --quick    skip the voice trial
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { startupProblems } from '../check';
import { REPO_ROOT } from '../config';
import * as pf from '../preflight';
import { listBackups, PilotStore, runningServer } from '../store';
import { args, config } from './common';

const { opts } = args();
process.env.LINK_MODE ||= 'pilot';
const cfg = config();
const voice = cfg.voice;
const checks: pf.Check[] = [];
const AI = join(REPO_ROOT, 'apps', 'ai-service');

function run(cmd: string, argv: string[], cwd = REPO_ROOT): string | null {
  try {
    return execFileSync(cmd, argv, { cwd, encoding: 'utf8', shell: true, timeout: 120_000 })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// 1. Versions
const uv = voice ? run('uv', ['--version']) : null;
const python = voice
  ? run('uv', [
      '--directory',
      AI,
      'run',
      'python',
      '-c',
      '"import platform;print(platform.python_version())"',
    ])
  : null;
checks.push(
  ...pf.versions({ node: process.version, pnpm: run('pnpm', ['--version']), uv, python, voice }),
);

// 2. Disk, 3. encryption, 4. time zone
mkdirSync(cfg.dataDir, { recursive: true });
const fs = statfsSync(cfg.dataDir);
checks.push(pf.disk(fs.bavail * fs.bsize));
const drive = resolve(cfg.dataDir).slice(0, 2);
let encState: number | null = null;
if (process.platform === 'win32') {
  const out = run('powershell', [
    '-NoProfile',
    '-Command',
    `"(New-Object -ComObject Shell.Application).NameSpace('${drive}').Self.ExtendedProperty('System.Volume.BitLockerProtection')"`,
  ]);
  encState = out && /^\d+$/.test(out) ? Number(out) : null;
}
checks.push(pf.encryption(encState, drive));
checks.push(pf.timeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));

// 5. Certificate
const pem = existsSync(cfg.tlsCert)
  ? (/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(
      readFileSync(cfg.tlsCert, 'utf8'),
    )?.[0] ?? null)
  : null;
checks.push(pf.certificate(pem, cfg.bind));

// 6. Ports (the pilot itself may already be running: that is fine)
const running = runningServer(cfg.dataDir) !== null;
const free = (port: number, host: string) =>
  new Promise<boolean>((done) => {
    const s = createServer()
      .once('error', () => done(false))
      .once('listening', () => s.close(() => done(true)))
      .listen(port, host);
  });
const upstream = Number(new URL(process.env.PILOT_WEB_UPSTREAM ?? 'http://127.0.0.1:3100').port);
const wanted: [number, string][] = [
  [cfg.webPort, cfg.bind],
  [cfg.teacherPort, cfg.bind],
  [upstream, '127.0.0.1'],
  ...(voice
    ? ([[Number(new URL(cfg.aiUrl).port || 8090), '127.0.0.1']] as [number, string][])
    : []),
];
const busy: number[] = [];
if (!running) for (const [port, host] of wanted) if (!(await free(port, host))) busy.push(port);
checks.push(pf.ports({ running, busy }));

// 7. LAN address
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a!.address);
checks.push(pf.lan(cfg.bind, addresses));

// 8. Backups
function canWrite(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.preflight-${process.pid}`);
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}
const writable = canWrite(cfg.backupDir);
const newest = listBackups(cfg.backupDir)
  .map((n) => statSync(join(cfg.backupDir, n)).mtime)
  .sort((a, b) => b.getTime() - a.getTime())[0];
checks.push(pf.backups({ writable, newest: newest ?? null }));

// 9. No demo data, routes or users (the start-up check)
const store = new PilotStore(cfg.dataDir);
const world = store.exists ? (store.open().fu.world ?? null) : null;
store.close();
const problems = startupProblems({
  world,
  env: process.env,
  bundleDirs: [join(REPO_ROOT, 'apps', 'web', '.next-pilot', 'static'), cfg.teacherDist],
});
if (!store.exists) problems.unshift(`No pilot data in ${cfg.dataDir} (run pnpm pilot:init).`);
checks.push(pf.noDemo(problems));

// 10. Voice (only when PILOT_VOICE=1)
if (voice) {
  let routing: {
    stt?: { model?: string; device?: string };
    llm?: { provider?: string; model?: string; device?: string };
  } = {};
  try {
    const raw = process.env.MODEL_ROUTING_CONFIG;
    if (raw) routing = JSON.parse(raw.trim().endsWith('.json') ? readFileSync(raw, 'utf8') : raw);
  } catch {
    routing = {};
  }
  const whisper = routing.stt?.model ?? 'large-v3-turbo';
  const modelsDir = process.env.AI_MODELS_DIR ?? join(AI, '.models');
  const llm = routing.llm?.provider === 'none' ? null : (routing.llm?.model ?? 'qwen3:8b');
  let llmOk = false;
  if (llm) {
    try {
      const r = await fetch(`${process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      const tags = ((await r.json()) as { models?: { name: string }[] }).models ?? [];
      llmOk = tags.some((m) => m.name === llm || m.name.startsWith(`${llm}:`));
    } catch {
      llmOk = false;
    }
  }
  const whisperOk = existsSync(join(modelsDir, whisper, 'model.bin'));
  checks.push(...pf.voiceModels({ whisper, whisperOk, llm, llmOk }));
  if (!opts.quick && whisperOk) {
    const clip = join(AI, 'bench', 'audio', 'preflight-5s.wav');
    const r = spawnSync(
      'uv',
      [
        '--directory',
        AI,
        'run',
        'python',
        'bench/time_note.py',
        '--audio',
        clip,
        '--stt-model',
        whisper,
        '--stt-device',
        routing.stt?.device ?? 'auto',
        '--runs',
        '2',
        ...(llm && llmOk
          ? ['--llm', llm, '--llm-device', routing.llm?.device ?? 'auto']
          : ['--no-llm']),
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        shell: true,
        timeout: 600_000,
        env: { ...process.env, PYTHONUTF8: '1' },
      },
    );
    const last = (r.stdout ?? '')
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .at(-1);
    if (last) {
      const t = JSON.parse(last) as {
        audio_s: number;
        stt_s: number;
        total_s: number;
        chars: number;
        model_version: string;
      };
      const profile = t.model_version.includes('/cuda') ? 'gpu' : llm ? 'cpu_llm' : 'cpu_rules';
      checks.push(
        pf.voiceTrial({
          profile,
          audioS: t.audio_s,
          sttS: t.stt_s,
          totalS: t.total_s,
          chars: t.chars,
        }),
      );
    } else {
      checks.push(pf.voiceTrial({ profile: 'cpu_rules', audioS: 5, sttS: 0, totalS: 0, chars: 0 }));
    }
  }
}

console.log(pf.render(checks));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
