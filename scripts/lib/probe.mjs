// The real machine behind the `Probe` that scripts/lib/checks.mjs reads. Read-only.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statfsSync } from 'node:fs';
import { createServer } from 'node:net';
import { totalmem } from 'node:os';
import { ROOT } from './env.mjs';

const WIN = process.platform === 'win32';
// On Windows pnpm, uv and ollama may be .cmd/.ps1 shims: resolve them through the shell there.
const SHIM = new Set(['pnpm']);

/** @returns {import('./checks.mjs').Probe} */
export function realProbe() {
  return {
    platform: process.platform,
    nodeVersion: process.version,
    root: ROOT,
    exec(cmd, args) {
      const r = spawnSync(cmd, args, {
        encoding: 'utf8',
        cwd: ROOT,
        shell: WIN && SHIM.has(cmd),
        timeout: 20_000,
        windowsHide: true,
      });
      return { status: r.error ? null : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
    portFree: (port) =>
      new Promise((resolve) => {
        const s = createServer();
        s.once('error', () => resolve(false));
        s.once('listening', () => s.close(() => resolve(true)));
        s.listen(port, '0.0.0.0');
      }),
    readFile: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
    freeDiskBytes() {
      try {
        const s = statfsSync(ROOT);
        return s.bavail * s.bsize;
      } catch {
        return null;
      }
    },
    totalMemBytes: () => totalmem(),
  };
}

/** The pnpm version package.json pins ("packageManager": "pnpm@x.y.z"). */
export function wantedPnpm() {
  const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8'));
  return /pnpm@([\d.]+)/.exec(pkg.packageManager ?? '')?.[1] ?? '12';
}

/** .env.local values, for port overrides only (never printed). */
export function localEnv() {
  const p = `${ROOT}/.env.local`;
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/\s+#.*$/, '').trim()]),
  );
}
