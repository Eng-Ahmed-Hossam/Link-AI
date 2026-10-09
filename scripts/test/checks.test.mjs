// pnpm test:scripts — pnpm doctor's checks and pnpm setup's plan, on recorded command output
// (Linux and Windows). Nothing here touches the machine.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkAutocrlf,
  checkContainers,
  checkDocker,
  checkDockerWsl,
  checkEnvFile,
  checkLongPaths,
  checkNode,
  checkOllama,
  checkPnpm,
  checkPorts,
  checkPython,
  envNames,
  failed,
  formatTable,
  runChecks,
} from '../lib/checks.mjs';
import { bin, formatPlan, setupPlan } from '../lib/setup-plan.mjs';

const GB = 1024 ** 3;
/** A fake machine: `cmds` maps "cmd arg1 arg2" (prefix) to { status, stdout }. */
function fake({
  platform = 'linux',
  node = 'v24.4.0',
  cmds = {},
  busy = [],
  files = {},
  disk = 100,
  ram = 32,
} = {}) {
  return {
    platform,
    nodeVersion: node,
    root: '/repo',
    exec(cmd, args) {
      const key = [cmd, ...args].join(' ');
      const hit = Object.keys(cmds)
        .filter((k) => key.startsWith(k))
        .sort((a, b) => b.length - a.length)[0];
      return hit ? { stdout: '', ...cmds[hit] } : { status: null, stdout: '' };
    },
    portFree: async (port) => !busy.includes(port),
    readFile: (p) => files[p] ?? null,
    freeDiskBytes: () => (disk == null ? null : disk * GB),
    totalMemBytes: () => ram * GB,
  };
}
const OK = (stdout) => ({ status: 0, stdout });
const EXAMPLE = 'APP_ENV=  # x\nDATABASE_URL=\nSENTRY_DSN=   # optional\n';
const FULL_LOCAL = [
  'APP_ENV=local',
  'DATABASE_URL=postgres://u:p@localhost/link',
  'DATABASE_URL_WORKER=x',
  'DATABASE_URL_MIGRATOR=x',
  'REDIS_CACHE_URL=x',
  'REDIS_STATE_URL=x',
  'JWT_SIGNING_KEY=x',
  'FIELD_KEY_LOCAL=x',
  'HMAC_KEY_LOOKUP=x',
  '# SENTRY_DSN=',
].join('\n');

describe('pnpm doctor checks', () => {
  it('Node: 24 passes, 22 fails with the download page', () => {
    assert.equal(checkNode(fake()).status, 'ok');
    const r = checkNode(fake({ node: 'v22.11.0' }));
    assert.equal(r.status, 'fail');
    assert.match(r.fix, /nodejs\.org/);
  });

  it('pnpm: pinned version ✓, other patch ⚠, other major ✗, missing ✗', () => {
    assert.equal(
      checkPnpm(fake({ cmds: { 'pnpm --version': OK('12.8.1\n') } }), '12.8.1').status,
      'ok',
    );
    assert.equal(
      checkPnpm(fake({ cmds: { 'pnpm --version': OK('12.9.0\r\n') } }), '12.8.1').status,
      'warn',
    );
    assert.equal(
      checkPnpm(fake({ cmds: { 'pnpm --version': OK('10.2.0\n') } }), '12.8.1').status,
      'fail',
    );
    assert.equal(checkPnpm(fake(), '12.8.1').status, 'fail');
  });

  it('Docker: running ✓; installed but stopped ✗ says "start Docker Desktop"; missing ✗ links the install page', () => {
    const up = checkDocker(
      fake({
        cmds: { 'docker info': OK('28.3.2|Docker Desktop|6.6.87.2-microsoft-standard-WSL2\n') },
      }),
    );
    assert.equal(up.status, 'ok');
    assert.match(up.detail, /28\.3\.2/);
    const stopped = checkDocker(
      fake({
        cmds: { 'docker info': { status: 1 }, 'docker --version': OK('Docker version 28.3.2') },
      }),
    );
    assert.equal(stopped.status, 'fail');
    assert.match(stopped.fix, /Start Docker Desktop/);
    assert.match(checkDocker(fake()).fix, /docs\.docker\.com/);
  });

  it('Windows: Docker Desktop on WSL 2 ✓, Hyper-V engine ✗', () => {
    const wsl = fake({
      platform: 'win32',
      cmds: { 'docker info': OK('Docker Desktop|6.6.87.2-microsoft-standard-WSL2\r\n') },
    });
    assert.equal(checkDockerWsl(wsl).status, 'ok');
    const hyperv = fake({
      platform: 'win32',
      cmds: { 'docker info': OK('Docker Desktop|5.15.49-linuxkit\r\n') },
    });
    assert.equal(checkDockerWsl(hyperv).status, 'fail');
    assert.match(checkDockerWsl(hyperv).fix, /WSL 2 based engine/);
  });

  it('Windows: long paths from `reg query` output (enabled ✓, 0x0 ✗)', () => {
    const on = `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\FileSystem\r\n    LongPathsEnabled    REG_DWORD    0x1\r\n\r\n`;
    const off = on.replace('0x1', '0x0');
    assert.equal(
      checkLongPaths(fake({ platform: 'win32', cmds: { 'reg query': OK(on) } })).status,
      'ok',
    );
    const r = checkLongPaths(fake({ platform: 'win32', cmds: { 'reg query': OK(off) } }));
    assert.equal(r.status, 'fail');
    assert.match(r.fix, /LongPathsEnabled/);
  });

  it('Windows: core.autocrlf=true ⚠ (CRLF scripts in containers); input or unset ✓', () => {
    assert.equal(checkAutocrlf(fake({ cmds: { 'git config': OK('true\r\n') } })).status, 'warn');
    assert.equal(checkAutocrlf(fake({ cmds: { 'git config': OK('input\n') } })).status, 'ok');
    assert.equal(checkAutocrlf(fake({ cmds: { 'git config': { status: 1 } } })).status, 'ok');
  });

  it('Python 3.12 + uv and Ollama are ⚠ only when missing (never ✗)', () => {
    assert.equal(
      checkPython(
        fake({
          cmds: {
            'uv --version': OK('uv 0.8.4\n'),
            'uv python find': OK(
              'C:\\Users\\a\\AppData\\Roaming\\uv\\python\\cpython-3.12.11\\python.exe\r\n',
            ),
          },
        }),
      ).status,
      'ok',
    );
    assert.equal(checkPython(fake()).status, 'warn');
    assert.equal(
      checkPython(
        fake({ cmds: { 'uv --version': OK('uv 0.8.4'), 'uv python find': { status: 2 } } }),
      ).status,
      'warn',
    );
    assert.equal(checkOllama(fake()).status, 'warn');
    assert.equal(
      checkOllama(fake({ cmds: { 'ollama --version': OK('ollama version is 0.11.4\n') } })).detail,
      '0.11.4',
    );
  });

  it('Ports: a Link container holding its port is fine; another program on 5432 ✗ names POSTGRES_HOST_PORT', async () => {
    const ps = OK(
      'link-postgres-1|0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp\nlink-sms-sink-1|0.0.0.0:8093->8093/tcp\n',
    );
    assert.equal(
      (await checkPorts(fake({ busy: [5432, 8093], cmds: { 'docker ps': ps } }))).status,
      'ok',
    );
    const other = await checkPorts(fake({ busy: [5432], cmds: { 'docker ps': OK('') } }));
    assert.equal(other.status, 'fail');
    assert.match(other.detail, /POSTGRES_HOST_PORT/);
    // A moved port is checked where it now is.
    assert.equal(
      (
        await checkPorts(fake({ busy: [5432], cmds: { 'docker ps': OK('') } }), {
          POSTGRES_HOST_PORT: '5433',
        })
      ).status,
      'ok',
    );
    // The app ports (pnpm dev / demo) only warn.
    assert.equal(
      (await checkPorts(fake({ busy: [3000], cmds: { 'docker ps': OK('') } }))).status,
      'warn',
    );
  });

  it('.env.local: names only, never values; placeholders count; a required name missing is ✗', () => {
    assert.deepEqual([...envNames('A=1\n# B=\n  C=x # c\nlower=1\n').set], ['A', 'C']);
    assert.deepEqual([...envNames('# B=\n').listed], ['B']);
    const complete = checkEnvFile(
      fake({ files: { '/repo/.env.example': EXAMPLE, '/repo/.env.local': FULL_LOCAL } }),
    );
    assert.equal(complete.status, 'ok');
    const behind = checkEnvFile(
      fake({
        files: { '/repo/.env.example': EXAMPLE + 'NEW_THING=\n', '/repo/.env.local': FULL_LOCAL },
      }),
    );
    assert.equal(behind.status, 'warn');
    assert.match(behind.detail, /NEW_THING/);
    const broken = checkEnvFile(
      fake({ files: { '/repo/.env.example': EXAMPLE, '/repo/.env.local': 'APP_ENV=local\n' } }),
    );
    assert.equal(broken.status, 'fail');
    assert.doesNotMatch(JSON.stringify([complete, behind, broken]), /postgres:\/\/u:p/); // no values
    assert.equal(checkEnvFile(fake({ files: { '/repo/.env.example': EXAMPLE } })).status, 'warn');
  });

  it('Containers: all healthy ✓, one unhealthy ✗, stopped or none yet ⚠', () => {
    const healthy = OK(
      'link-postgres-1|Up 3 minutes (healthy)\nlink-redis-state-1|Up 3 minutes (healthy)\n',
    );
    assert.equal(checkContainers(fake({ cmds: { 'docker ps': healthy } })).status, 'ok');
    const sick = OK(
      'link-postgres-1|Up 3 minutes (unhealthy)\nlink-aws-local-1|Up 2 minutes (healthy)\n',
    );
    const r = checkContainers(fake({ cmds: { 'docker ps': sick } }));
    assert.equal(r.status, 'fail');
    assert.match(r.detail, /link-postgres-1/);
    // Stopped after a Docker restart: setup and dev start them again, so only ⚠.
    const stopped = OK(
      'link-postgres-1|Exited (255) 2 seconds ago\nlink-redis-state-1|Exited (0) 1 hour ago\n',
    );
    assert.equal(checkContainers(fake({ cmds: { 'docker ps': stopped } })).status, 'warn');
    assert.equal(checkContainers(fake({ cmds: { 'docker ps': OK('') } })).status, 'warn');
  });

  it('a full run on a ready Windows PC: Windows-only rows appear, nothing ✗, table and JSON shape', async () => {
    const p = fake({
      platform: 'win32',
      cmds: {
        'pnpm --version': OK('12.8.1\r\n'),
        'git --version': OK('git version 2.50.1.windows.1\r\n'),
        'git config': OK('input\r\n'),
        'docker info': OK('28.3.2|Docker Desktop|6.6.87.2-microsoft-standard-WSL2\r\n'),
        'docker ps': OK('link-postgres-1|Up 5 minutes (healthy)|\r\n'),
        'reg query': OK('    LongPathsEnabled    REG_DWORD    0x1\r\n'),
        'uv --version': OK('uv 0.8.4 (Windows)\r\n'),
        'uv python find': OK('C:\\py312\\python.exe\r\n'),
      },
      files: { '/repo/.env.example': EXAMPLE, '/repo/.env.local': FULL_LOCAL },
      disk: 120,
      ram: 32,
    });
    const results = await runChecks(p, { wantedPnpm: '12.8.1' });
    const ids = results.map((r) => r.id);
    for (const id of ['docker-wsl', 'longpaths', 'autocrlf']) assert.ok(ids.includes(id), id);
    assert.equal(failed(results), false);
    assert.match(formatTable(results), /✓ {2}Node\.js/);
    assert.match(formatTable(results), /⚠ {2}Ollama/);
    const json = JSON.parse(JSON.stringify(results));
    assert.ok(json.every((r) => ['ok', 'warn', 'fail'].includes(r.status) && r.name && r.detail));
  });

  it('low disk ✗ and low RAM ⚠ on Linux; Windows-only rows absent', async () => {
    const results = await runChecks(
      fake({ disk: 9, ram: 8, cmds: { 'docker info': OK('28|Ubuntu|6.8') } }),
    );
    assert.equal(results.find((r) => r.id === 'disk').status, 'fail');
    assert.equal(results.find((r) => r.id === 'ram').status, 'warn');
    assert.ok(!results.some((r) => r.id === 'longpaths'));
  });
});

describe('pnpm setup plan', () => {
  const linux = { platform: 'linux', node: '/usr/bin/node', uv: true };
  it('default: doctor, install, env (never --force), services, migrate, seed only if empty, uv sync', () => {
    const plan = setupPlan({}, linux);
    assert.deepEqual(
      plan.map((s) => s.id),
      ['doctor', 'install', 'env', 'services', 'migrate', 'seed', 'ai'],
    );
    assert.ok(!JSON.stringify(plan).includes('--force'));
    assert.deepEqual(plan.find((s) => s.id === 'seed').args, [
      'scripts/db.mjs',
      'seed',
      '--if-empty',
    ]);
    assert.deepEqual(plan.find((s) => s.id === 'ai').args, [
      'sync',
      '--directory',
      'apps/ai-service',
      '--locked',
    ]);
  });
  it('--skip-ai and a machine without uv skip the Python step with a reason', () => {
    assert.match(setupPlan({ skipAi: true }, linux).at(-1).note, /--skip-ai/);
    assert.match(setupPlan({}, { ...linux, uv: false }).at(-1).note, /uv is not installed/);
  });
  it('--reset-data asks for "reset" before wiping', () => {
    const seed = setupPlan({ resetData: true }, linux).find((s) => s.id === 'seed');
    assert.equal(seed.confirm, 'reset');
    assert.ok(seed.args.includes('--reset'));
  });
  it('Windows runs pnpm through pnpm.cmd; the dry-run listing shows every command', () => {
    assert.equal(bin('pnpm', 'win32'), 'pnpm.cmd');
    assert.equal(bin('uv', 'win32'), 'uv');
    const plan = setupPlan(
      {},
      { platform: 'win32', node: 'C:\\Program Files\\nodejs\\node.exe', uv: true },
    );
    assert.equal(plan.find((s) => s.id === 'install').cmd, 'pnpm.cmd');
    const text = formatPlan(plan);
    assert.match(text, /\$ pnpm\.cmd install/);
    assert.match(text, /scripts\/env-local\.mjs/);
  });
});
