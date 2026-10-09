// The checks behind `pnpm run doctor` (and the first step of `pnpm run setup`). READ-ONLY: nothing here
// changes the machine. Every check takes a `probe` — the only way it touches the system — so the
// unit tests (scripts/test/checks.test.mjs) feed recorded Linux and Windows output instead.
//
// A check returns { id, name, status: 'ok' | 'warn' | 'fail', detail, fix? }.
// 'fail' = Link cannot run until it is fixed; 'warn' = something optional is missing or odd.

/**
 * @typedef {{ status: number | null, stdout: string, stderr?: string }} ExecResult
 * @typedef {{
 *   platform: string,                      // process.platform
 *   nodeVersion: string,                   // process.version, e.g. 'v24.1.0'
 *   exec: (cmd: string, args: string[]) => ExecResult,
 *   portFree: (port: number) => Promise<boolean>,
 *   readFile: (path: string) => string | null,   // null when missing
 *   freeDiskBytes: () => number | null,
 *   totalMemBytes: () => number,
 *   root: string,
 * }} Probe
 */

export const ICON = { ok: '✓', warn: '⚠', fail: '✗' };
const GB = 1024 ** 3;
export const MIN_DISK_GB = 15;
export const MIN_RAM_GB = 16;

/** Host ports Link uses (docs/14 §2 and §5). `docker`: a Link container publishes it. */
export const PORTS = [
  { port: 3000, what: 'web', docker: false },
  { port: 8081, what: 'teacher app', docker: false },
  { port: 4000, what: 'core-api', docker: false },
  { port: 4002, what: 'messaging-gateway', docker: false },
  { port: 4010, what: 'mock server (pnpm demo)', docker: false },
  { port: 8090, what: 'ai-service', docker: false },
  { port: 5432, what: 'Postgres', docker: true, env: 'POSTGRES_HOST_PORT' },
  { port: 6379, what: 'Redis cache', docker: true, env: 'REDIS_CACHE_HOST_PORT' },
  { port: 6380, what: 'Redis state', docker: true, env: 'REDIS_STATE_HOST_PORT' },
  { port: 4566, what: 'aws-local', docker: true, env: 'AWS_LOCAL_HOST_PORT' },
  { port: 8091, what: 'fake-pay', docker: true, env: 'FAKE_PAY_HOST_PORT' },
  { port: 8093, what: 'sms-sink', docker: true, env: 'SMS_SINK_HOST_PORT' },
  { port: 8094, what: 'whatsapp-fake', docker: true, env: 'WHATSAPP_FAKE_HOST_PORT' },
  { port: 8025, what: 'mail-sink', docker: true, env: 'MAIL_SINK_HOST_PORT' },
  { port: 1025, what: 'mail-sink SMTP', docker: true, env: 'MAIL_SINK_SMTP_HOST_PORT' },
];

/** Names core-api cannot start without; the rest of .env.example is optional locally. */
export const REQUIRED_ENV = [
  'APP_ENV',
  'DATABASE_URL',
  'DATABASE_URL_WORKER',
  'DATABASE_URL_MIGRATOR',
  'REDIS_CACHE_URL',
  'REDIS_STATE_URL',
  'JWT_SIGNING_KEY',
  'FIELD_KEY_LOCAL',
  'HMAC_KEY_LOOKUP',
];

const ok = (id, name, detail) => ({ id, name, status: 'ok', detail });
const warn = (id, name, detail, fix) => ({ id, name, status: 'warn', detail, fix });
const bad = (id, name, detail, fix) => ({ id, name, status: 'fail', detail, fix });
const firstLine = (s) =>
  String(s ?? '')
    .trim()
    .split(/\r?\n/)[0] ?? '';
const semver = (s) => {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(s ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
};

/** Env names in a dotenv text: set (`NAME=…`) and listed as a commented placeholder (`# NAME=`). */
export function envNames(text) {
  const set = new Set();
  const listed = new Set();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*(#\s*)?([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!m) continue;
    (m[1] ? listed : set).add(m[2]);
  }
  return { set, listed };
}

export function checkNode(p) {
  const v = semver(p.nodeVersion);
  if (v && v[0] >= 24) return ok('node', 'Node.js', p.nodeVersion);
  return bad(
    'node',
    'Node.js',
    `${p.nodeVersion} (needs 24 or newer)`,
    'Install Node.js 24 LTS from https://nodejs.org/en/download',
  );
}

export function checkPnpm(p, wanted) {
  const r = p.exec('pnpm', ['--version']);
  const have = semver(r.stdout);
  if (r.status !== 0 || !have)
    return bad(
      'pnpm',
      'pnpm',
      'not found',
      `corepack enable, then corepack prepare pnpm@${wanted} --activate`,
    );
  const want = semver(wanted);
  const v = firstLine(r.stdout);
  if (want && have[0] !== want[0])
    return bad(
      'pnpm',
      'pnpm',
      `${v} (this repo uses ${wanted})`,
      `corepack prepare pnpm@${wanted} --activate`,
    );
  if (want && (have[1] !== want[1] || have[2] !== want[2]))
    return warn('pnpm', 'pnpm', `${v} (this repo pins ${wanted})`, 'corepack enable uses the pin');
  return ok('pnpm', 'pnpm', v);
}

export function checkGit(p) {
  const r = p.exec('git', ['--version']);
  if (r.status !== 0)
    return bad('git', 'git', 'not found', 'Install Git: https://git-scm.com/downloads');
  return ok('git', 'git', firstLine(r.stdout).replace(/^git version /, ''));
}

export function checkDocker(p) {
  const r = p.exec('docker', [
    'info',
    '--format',
    '{{.ServerVersion}}|{{.OperatingSystem}}|{{.KernelVersion}}',
  ]);
  if (r.status !== 0) {
    const cli = p.exec('docker', ['--version']);
    return bad(
      'docker',
      'Docker',
      cli.status === 0 ? 'installed but not running' : 'not found',
      cli.status === 0
        ? 'Start Docker Desktop and wait until it says "Engine running"'
        : 'Install Docker Desktop: https://docs.docker.com/desktop/',
    );
  }
  const [version, os] = firstLine(r.stdout).split('|');
  return ok('docker', 'Docker', `${version}${os ? ` (${os})` : ''}`);
}

/** Windows only: Docker Desktop must use the WSL 2 engine (bind mounts, speed, health checks). */
export function checkDockerWsl(p) {
  const r = p.exec('docker', ['info', '--format', '{{.OperatingSystem}}|{{.KernelVersion}}']);
  if (r.status !== 0)
    return warn('docker-wsl', 'Docker on WSL 2', 'Docker is not running; cannot tell');
  const out = firstLine(r.stdout).toLowerCase();
  if (/wsl2|microsoft/.test(out)) return ok('docker-wsl', 'Docker on WSL 2', 'yes');
  return bad(
    'docker-wsl',
    'Docker on WSL 2',
    `engine reports "${firstLine(r.stdout)}"`,
    'Docker Desktop → Settings → General → "Use the WSL 2 based engine"',
  );
}

export function checkPython(p) {
  const uv = p.exec('uv', ['--version']);
  if (uv.status !== 0)
    return warn(
      'python',
      'Python 3.12 + uv',
      'uv not found (only voice notes need it)',
      'Install uv: https://docs.astral.sh/uv/getting-started/installation/ — or run pnpm run setup --skip-ai',
    );
  const py = p.exec('uv', ['python', 'find', '3.12']);
  if (py.status !== 0)
    return warn(
      'python',
      'Python 3.12 + uv',
      `${firstLine(uv.stdout)}; Python 3.12 not installed yet`,
      'uv python install 3.12 (pnpm run setup does it through uv sync)',
    );
  return ok('python', 'Python 3.12 + uv', `${firstLine(uv.stdout)}; ${firstLine(py.stdout)}`);
}

export function checkOllama(p) {
  const r = p.exec('ollama', ['--version']);
  if (r.status !== 0)
    return warn(
      'ollama',
      'Ollama (optional)',
      'not installed: extraction runs on rules only and Ask Link stays off',
      'https://ollama.com/download, then ollama pull qwen3:8b',
    );
  return ok('ollama', 'Ollama (optional)', firstLine(r.stdout).replace(/^ollama version is /, ''));
}

/** Published host ports of running Link containers (compose project `link`). */
export function linkContainerPorts(p) {
  const r = p.exec('docker', [
    'ps',
    '--filter',
    'label=com.docker.compose.project=link',
    '--format',
    '{{.Names}}|{{.Ports}}',
  ]);
  const ports = new Map();
  if (r.status !== 0) return ports;
  for (const line of String(r.stdout).split(/\r?\n/).filter(Boolean)) {
    const [name, spec = ''] = line.split('|');
    for (const m of spec.matchAll(/:(\d+)->/g)) ports.set(Number(m[1]), name);
  }
  return ports;
}

export async function checkPorts(p, env = {}) {
  const ours = linkContainerPorts(p);
  const busy = [];
  const appBusy = [];
  for (const def of PORTS) {
    const port = Number((def.env && env[def.env]) || def.port);
    if (await p.portFree(port)) continue;
    if (ours.has(port)) continue; // a Link container already holds it: fine
    if (def.docker) busy.push(`${port} (${def.what}; set ${def.env} in .env.local)`);
    else appBusy.push(`${port} (${def.what})`);
  }
  if (busy.length)
    return bad(
      'ports',
      'Ports',
      `taken by another program: ${busy.join(', ')}`,
      'Stop that program, or move Link to a free port with the *_HOST_PORT setting named',
    );
  if (appBusy.length)
    return warn(
      'ports',
      'Ports',
      `in use: ${appBusy.join(', ')} — fine if pnpm dev or pnpm demo is running`,
      'Otherwise stop the program holding it (docs/setup-windows.md, problem 3)',
    );
  return ok('ports', 'Ports', `${PORTS.length} free or held by Link containers`);
}

export function checkEnvFile(p) {
  const local = p.readFile(`${p.root}/.env.local`);
  const example = p.readFile(`${p.root}/.env.example`);
  if (local == null)
    return warn(
      'env',
      '.env.local',
      'not created yet',
      'pnpm run setup writes it (fresh local secrets)',
    );
  const want = envNames(example).set;
  const have = envNames(local);
  const missingRequired = REQUIRED_ENV.filter((n) => !have.set.has(n));
  if (missingRequired.length)
    return bad(
      'env',
      '.env.local',
      `missing required names: ${missingRequired.join(', ')}`,
      'Move .env.local aside and run pnpm run setup (keep FIELD_KEY_LOCAL and HMAC_KEY_LOOKUP)',
    );
  const missing = [...want].filter((n) => !have.set.has(n) && !have.listed.has(n));
  if (missing.length)
    return warn(
      'env',
      '.env.local',
      `${missing.length} name(s) from .env.example not listed (newer than your file): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`,
      'pnpm run setup adds them as commented placeholders; values are never changed',
    );
  return ok('env', '.env.local', `all ${want.size} names from .env.example listed`);
}

export function checkContainers(p) {
  const r = p.exec('docker', [
    'ps',
    '-a',
    '--filter',
    'label=com.docker.compose.project=link',
    '--format',
    '{{.Names}}|{{.Status}}',
  ]);
  if (r.status !== 0) return warn('containers', 'Containers', 'Docker is not running; cannot tell');
  const rows = String(r.stdout)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split('|'));
  if (!rows.length)
    return warn('containers', 'Containers', 'none yet', 'pnpm run setup (or pnpm dev) starts them');
  const unhealthy = rows.filter(([, s]) => /unhealthy|dead|restarting/i.test(s));
  const stopped = rows.filter(([, s]) => /^(exited|created)/i.test(s.trim()));
  const starting = rows.filter(([, s]) => /health: starting/i.test(s));
  if (unhealthy.length)
    return bad(
      'containers',
      'Containers',
      `not healthy: ${unhealthy.map(([n, s]) => `${n} (${s})`).join(', ')}`,
      'docker compose -f infra/local/docker-compose.yml logs <name>; then pnpm dev:infra',
    );
  if (stopped.length)
    return warn(
      'containers',
      'Containers',
      `stopped: ${stopped.map(([n]) => n).join(', ')}`,
      'pnpm run setup or pnpm dev starts them again',
    );
  if (starting.length)
    return warn(
      'containers',
      'Containers',
      `still starting: ${starting.map(([n]) => n).join(', ')}`,
    );
  return ok('containers', 'Containers', `${rows.length} healthy`);
}

export function checkDisk(p) {
  const free = p.freeDiskBytes();
  if (free == null) return warn('disk', 'Disk space', 'could not read');
  const gb = free / GB;
  if (gb < MIN_DISK_GB)
    return bad(
      'disk',
      'Disk space',
      `${gb.toFixed(1)} GB free (needs ${MIN_DISK_GB} GB: images, databases, speech models)`,
      'Free space, or docker system prune to drop unused images',
    );
  return ok('disk', 'Disk space', `${gb.toFixed(0)} GB free`);
}

export function checkRam(p) {
  const gb = p.totalMemBytes() / GB;
  if (gb < MIN_RAM_GB - 0.5)
    return warn(
      'ram',
      'Memory',
      `${gb.toFixed(1)} GB (${MIN_RAM_GB} GB recommended: Docker, two dev servers and Whisper)`,
      'Close other apps; give WSL more memory in .wslconfig (docs/setup-windows.md)',
    );
  return ok('ram', 'Memory', `${gb.toFixed(0)} GB`);
}

/** Windows only: paths longer than 260 characters (node_modules) must be allowed. */
export function checkLongPaths(p) {
  const r = p.exec('reg', [
    'query',
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
    '/v',
    'LongPathsEnabled',
  ]);
  if (r.status === 0 && /LongPathsEnabled\s+REG_DWORD\s+0x1\b/i.test(r.stdout))
    return ok('longpaths', 'Windows long paths', 'enabled');
  return bad(
    'longpaths',
    'Windows long paths',
    'disabled',
    'Admin PowerShell: New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force; then git config --global core.longpaths true',
  );
}

/** Windows only: CRLF checkouts break shell scripts and Dockerfiles inside Linux containers. */
export function checkAutocrlf(p) {
  const r = p.exec('git', ['config', '--get', 'core.autocrlf']);
  const v = firstLine(r.stdout).toLowerCase();
  if (v === 'true')
    return warn(
      'autocrlf',
      'git core.autocrlf',
      'true (scripts copied into containers get Windows line endings)',
      'git config --global core.autocrlf input, then re-clone',
    );
  return ok('autocrlf', 'git core.autocrlf', v || 'not set');
}

/** All checks, in table order. `wantedPnpm` comes from package.json "packageManager". */
export async function runChecks(p, { wantedPnpm = '12.8.1', env = {} } = {}) {
  const docker = checkDocker(p);
  const out = [
    checkNode(p),
    checkPnpm(p, wantedPnpm),
    checkGit(p),
    docker,
    ...(p.platform === 'win32' ? [checkDockerWsl(p), checkLongPaths(p), checkAutocrlf(p)] : []),
    checkPython(p),
    checkOllama(p),
    await checkPorts(p, env),
    checkEnvFile(p),
    docker.status === 'ok'
      ? checkContainers(p)
      : warn('containers', 'Containers', 'skipped: Docker is not running'),
    checkDisk(p),
    checkRam(p),
  ];
  return out;
}

/** The ✓ / ⚠ / ✗ table. */
export function formatTable(results) {
  const w = Math.max(...results.map((r) => r.name.length));
  const lines = results.map(
    (r) =>
      `${ICON[r.status]}  ${r.name.padEnd(w)}  ${r.detail}${r.fix && r.status !== 'ok' ? `\n   ${' '.repeat(w)}  → ${r.fix}` : ''}`,
  );
  const n = (s) => results.filter((r) => r.status === s).length;
  lines.push('', `${n('ok')} ✓  ${n('warn')} ⚠  ${n('fail')} ✗`);
  return lines.join('\n');
}

export const failed = (results) => results.some((r) => r.status === 'fail');
