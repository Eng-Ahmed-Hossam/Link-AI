import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statfsSync } from 'node:fs';
import { totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';

import {
  compareEnvNames,
  parseMajorVersion,
  parseUnixPorts,
  parseWindowsPorts,
  pnpmVersionMatches,
} from './lib/checks.mjs';

const win = process.platform === 'win32';
const statusIcon = { pass: '✓', warn: '⚠', fail: '✗' };

function command(command, args = []) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

function pnpmCommand(args) {
  if (process.env.npm_execpath) return command(process.env.npm_execpath, args);
  if (win)
    return command(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd', ...args]);
  return command('pnpm', args);
}

function item(results, status, category, name, detail, fix = '') {
  results.push({ status, category, name, detail, fix });
}

function envFile() {
  if (!existsSync('.env.local')) return {};
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

function dockerContainers() {
  const response = command('docker', [
    'ps',
    '-a',
    '--filter',
    'label=com.docker.compose.project=link',
    '--format',
    '{{json .}}',
  ]);
  if (!response.ok) return [];
  return response.output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const container = JSON.parse(line);
      const state = command('docker', ['inspect', '--format', '{{json .State}}', container.ID]);
      return { ...container, InspectedState: state.ok ? JSON.parse(state.output) : null };
    });
}

function dockerPorts(containers) {
  const ports = new Set();
  for (const container of containers) {
    for (const match of String(container.Ports ?? '').matchAll(/(?:0\.0\.0\.0|\[::\]):(\d+)->/g))
      ports.add(Number(match[1]));
  }
  return ports;
}

function processName(pid) {
  if (!win) return `pid ${pid}`;
  const result = command('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
  return result.ok ? (result.output.match(/^"([^"]+)"/)?.[1] ?? `pid ${pid}`) : `pid ${pid}`;
}

function listeningPorts() {
  if (win) return parseWindowsPorts(command('netstat', ['-ano', '-p', 'tcp']).output);
  return parseUnixPorts(command('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']).output);
}

export async function runDoctor({ json = false, skipAi = false, setupMode = false } = {}) {
  const results = [];
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const nodeMajor = parseMajorVersion(process.version);
  item(
    results,
    nodeMajor === 24 ? 'pass' : 'fail',
    'Tools',
    'Node.js',
    `major ${nodeMajor ?? 'unknown'}`,
    'Install Node.js 24.x.',
  );
  const pnpmResult = pnpmCommand(['--version']);
  item(
    results,
    pnpmResult.ok && pnpmVersionMatches(pnpmResult.output, pkg.packageManager) ? 'pass' : 'fail',
    'Tools',
    'pnpm',
    pnpmResult.ok ? `version ${pnpmResult.output}` : 'missing',
    `Run corepack enable, then corepack prepare ${pkg.packageManager} --activate.`,
  );
  for (const [name, executable, args, fix] of [
    ['Git', 'git', ['--version'], 'Install Git for Windows.'],
    ['uv', 'uv', ['--version'], 'Install uv and reopen the terminal.'],
  ]) {
    const result = command(executable, args);
    item(
      results,
      result.ok ? 'pass' : 'fail',
      'Tools',
      name,
      result.ok ? 'installed' : 'missing',
      fix,
    );
  }
  const python = win ? command('py', ['-3.12', '--version']) : command('python3.12', ['--version']);
  item(
    results,
    python.ok && /^Python 3\.12\./.test(python.output) ? 'pass' : 'fail',
    'Tools',
    'Python',
    python.ok ? python.output : '3.12 missing',
    'Install Python 3.12 and enable the launcher/PATH option.',
  );
  const dockerCli = command('docker', ['--version']);
  const dockerInfo = command('docker', ['info', '--format', '{{.ServerVersion}}']);
  item(
    results,
    dockerCli.ok ? 'pass' : 'fail',
    'Tools',
    'Docker CLI',
    dockerCli.ok ? 'installed' : 'missing',
    'Install Docker Desktop.',
  );
  item(
    results,
    dockerInfo.ok ? 'pass' : 'fail',
    'Tools',
    'Docker engine',
    dockerInfo.ok ? 'running' : 'not running',
    'Start Docker Desktop and wait for the engine.',
  );
  if (!skipAi) {
    const ollama = command('ollama', ['--version']);
    item(
      results,
      ollama.ok ? 'pass' : 'warn',
      'Tools',
      'Ollama',
      ollama.ok ? 'installed' : 'missing',
      'Install Ollama for Follow-up AI, or use pnpm setup --skip-ai.',
    );
  }

  const localEnv = envFile();
  const portDefs = [
    ['web', 3000],
    ['core-api', Number(localEnv.CORE_API_PORT || 4000)],
    ['gateway', Number(localEnv.GATEWAY_PORT || 4002)],
    ['mock server', Number(localEnv.MOCK_SERVER_PORT || 4010)],
    ['Postgres', Number(localEnv.POSTGRES_HOST_PORT || 5432)],
    ['Redis cache', Number(localEnv.REDIS_CACHE_HOST_PORT || 6379)],
    ['Redis state', Number(localEnv.REDIS_STATE_HOST_PORT || 6380)],
    ['Moto/AWS', Number(localEnv.AWS_LOCAL_HOST_PORT || 4566)],
    ['Mailpit SMTP', Number(localEnv.MAIL_SINK_SMTP_HOST_PORT || 1025)],
    ['Mailpit UI', Number(localEnv.MAIL_SINK_HOST_PORT || 8025)],
    ['teacher app', 8081],
    ['ai-service', Number(localEnv.AI_SERVICE_PORT || 8090)],
    ['fake-pay', Number(localEnv.FAKE_PAY_HOST_PORT || 8091)],
    ['OIDC stub', 8092],
    ['sms-sink', Number(localEnv.SMS_SINK_HOST_PORT || 8093)],
    ['pilot web', Number(localEnv.PILOT_WEB_PORT || 8443)],
    ['pilot teacher', Number(localEnv.PILOT_TEACHER_PORT || 8444)],
    ['pilot HTTP', Number(localEnv.PILOT_LOCAL_HTTP || 3100)],
    ...(!skipAi ? [['Ollama', 11434, /^ollama(?:\.exe)?$/i]] : []),
  ];
  const containers = dockerInfo.ok ? dockerContainers() : [];
  const linkPorts = dockerPorts(containers);
  const listeners = listeningPorts();
  const definedPorts = new Set(portDefs.map(([, port]) => port));
  for (const [name, port, expectedProcess] of portDefs) {
    const pids = listeners.get(port);
    if (!pids?.size) item(results, 'pass', 'Ports', `${name} :${port}`, 'free');
    else if (linkPorts.has(port))
      item(results, 'pass', 'Ports', `${name} :${port}`, 'Link container');
    else if (expectedProcess) {
      const names = [...pids].map(processName);
      if (names.every((process) => expectedProcess.test(process))) {
        item(results, 'pass', 'Ports', `${name} :${port}`, `${name} service`);
      } else {
        item(
          results,
          'fail',
          'Ports',
          `${name} :${port}`,
          `used by ${names.join(', ')}`,
          'Stop that process or change the matching service port.',
        );
      }
    } else
      item(
        results,
        'fail',
        'Ports',
        `${name} :${port}`,
        `used by ${[...pids].map(processName).join(', ')}`,
        `Stop that process or change the matching *_HOST_PORT setting.`,
      );
  }
  for (const port of [...linkPorts]
    .filter((value) => !definedPorts.has(value))
    .sort((a, b) => a - b)) {
    item(results, 'pass', 'Ports', `Link container :${port}`, 'Link container');
  }

  if (!existsSync('.env.local'))
    item(
      results,
      setupMode ? 'warn' : 'fail',
      'Environment',
      '.env.local',
      'missing',
      'Run node scripts/env-local.mjs.',
    );
  else {
    const compared = compareEnvNames(
      readFileSync('.env.example', 'utf8'),
      readFileSync('.env.local', 'utf8'),
    );
    item(
      results,
      compared.missing.length ? (setupMode ? 'warn' : 'fail') : 'pass',
      'Environment',
      'variable names',
      compared.missing.length
        ? `${compared.missing.length} names missing: ${compared.missing.join(', ')}`
        : `${compared.expected.length} names present`,
      'Add the missing names without printing or sharing their values.',
    );
  }

  const expectedContainers = [
    'postgres',
    'redis-cache',
    'redis-state',
    'aws-local',
    'sms-sink',
    'mail-sink',
    'fake-pay',
  ];
  for (const service of expectedContainers) {
    const container = containers.find((entry) =>
      entry.Labels?.includes(`com.docker.compose.service=${service}`),
    );
    const state = container?.InspectedState;
    const health = state?.Health?.Status;
    const healthy = state?.Running === true && (!health || health === 'healthy');
    item(
      results,
      healthy ? 'pass' : container ? 'fail' : 'warn',
      'Containers',
      service,
      state ? `${state.Status}${health ? `, ${health}` : ''}` : 'not created',
      'Run pnpm dev:infra.',
    );
  }

  const disk = statfsSync(process.cwd());
  const freeGb = Number(disk.bavail * disk.bsize) / 1024 ** 3;
  item(
    results,
    freeGb >= 15 ? 'pass' : 'warn',
    'Machine',
    'free disk',
    `${freeGb.toFixed(1)} GB`,
    'Free at least 15 GB for models and containers.',
  );
  const ramGb = totalmem() / 1024 ** 3;
  item(
    results,
    ramGb >= 16 ? 'pass' : 'warn',
    'Machine',
    'RAM',
    `${ramGb.toFixed(1)} GB`,
    'Use --skip-ai or a machine with at least 16 GB for Ollama.',
  );
  if (win) {
    const longPaths = command('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
      '/v',
      'LongPathsEnabled',
    ]);
    item(
      results,
      /LongPathsEnabled\s+REG_DWORD\s+0x1/i.test(longPaths.output) ? 'pass' : 'fail',
      'Windows',
      'long paths',
      /0x1/i.test(longPaths.output) ? 'enabled' : 'disabled',
      'Enable Win32 long paths, then restart Windows.',
    );
    const autocrlf = command('git', ['config', '--get', 'core.autocrlf']).output.toLowerCase();
    item(
      results,
      autocrlf === 'true' ? 'warn' : 'pass',
      'Windows',
      'git core.autocrlf',
      autocrlf || 'unset',
      'Run git config --global core.autocrlf input.',
    );
    const backend = command('docker', [
      'info',
      '--format',
      '{{.OperatingSystem}}|{{.KernelVersion}}',
    ]);
    const wsl = command('wsl.exe', ['--list', '--verbose']);
    const usesWsl2 =
      /docker-desktop[^\r\n]*\s2\s*$/im.test(wsl.output.replaceAll('\0', '')) ||
      /wsl2|microsoft-standard-wsl/i.test(backend.output);
    item(
      results,
      usesWsl2 ? 'pass' : 'fail',
      'Windows',
      'Docker WSL2 backend',
      usesWsl2 ? 'enabled' : 'not detected',
      'Enable “Use the WSL 2 based engine” in Docker Desktop.',
    );
  }

  const exitCode = results.some((entry) => entry.status === 'fail') ? 1 : 0;
  if (json) console.log(JSON.stringify({ ok: exitCode === 0, checks: results }, null, 2));
  else {
    console.log('Status  Category      Check                          Result');
    for (const result of results) {
      console.log(
        `${statusIcon[result.status]}       ${result.category.padEnd(13)} ${result.name.padEnd(30)} ${result.detail}`,
      );
      if (result.status !== 'pass' && result.fix) console.log(`        Fix: ${result.fix}`);
    }
  }
  return exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  process.exitCode = await runDoctor({
    json: args.includes('--json'),
    skipAi: args.includes('--skip-ai'),
    setupMode: args.includes('--setup'),
  });
}
