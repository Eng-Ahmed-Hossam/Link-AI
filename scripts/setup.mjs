import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import { runDoctor as doctor } from './doctor.mjs';

const isWindows = process.platform === 'win32';

function pnpmInvocation(args) {
  if (process.env.npm_execpath) return [process.env.npm_execpath, args];
  if (isWindows) {
    return [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd', ...args]];
  }
  return ['pnpm', args];
}

export const SETUP_STEPS = [
  ['doctor', []],
  ['pnpm install', []],
  ['node scripts/env-local.mjs', []],
  ['pnpm dev:infra', []],
  ['pnpm db:migrate', []],
  ['pnpm seed:demo', []],
  ['uv sync --directory apps/ai-service', []],
];

function execute(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function confirmReset() {
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('This wipes local sample data. Type RESET to continue: ');
  prompt.close();
  return answer === 'RESET';
}

export async function runSetup({
  args = process.argv.slice(2),
  log = console.log,
  runDoctor = () => doctor({ skipAi: args.includes('--skip-ai'), setupMode: true }),
  runCommand = execute,
  envExists = () => existsSync('.env.local'),
} = {}) {
  const dryRun = args.includes('--dry-run');
  const skipAi = args.includes('--skip-ai');
  const resetData = args.includes('--reset-data');
  const unknown = args.filter((arg) => !['--dry-run', '--skip-ai', '--reset-data'].includes(arg));
  if (unknown.length) {
    log(`Unknown option: ${unknown.join(', ')}`);
    return 1;
  }

  const plan = SETUP_STEPS.filter(([label]) => !(skipAi && label.startsWith('uv sync'))).map(
    ([label]) => (label === 'pnpm seed:demo' && resetData ? `${label} --reset` : label),
  );
  log('Link setup plan:');
  plan.forEach((label, index) => log(`  ${index + 1}. ${label}`));

  const doctorStart = Date.now();
  const doctorCode = await runDoctor();
  log(`doctor finished in ${((Date.now() - doctorStart) / 1000).toFixed(1)}s`);
  if (doctorCode !== 0) return doctorCode;
  if (dryRun) {
    log('Dry run complete; no setup commands were executed.');
    return 0;
  }
  if (resetData && !(await confirmReset())) {
    log('Reset cancelled; type RESET exactly to authorize it.');
    return 1;
  }

  const commands = [
    [...pnpmInvocation(['install']), 'pnpm install'],
    ...(envExists()
      ? []
      : [[process.execPath, ['scripts/env-local.mjs'], 'node scripts/env-local.mjs']]),
    [...pnpmInvocation(['dev:infra']), 'pnpm dev:infra'],
    [...pnpmInvocation(['db:migrate']), 'pnpm db:migrate'],
    [
      ...pnpmInvocation(['seed:demo', ...(resetData ? ['--reset'] : [])]),
      `pnpm seed:demo${resetData ? ' --reset' : ''}`,
    ],
    ...(skipAi
      ? []
      : [
          ['uv', ['sync', '--directory', 'apps/ai-service'], 'uv sync --directory apps/ai-service'],
        ]),
  ];
  if (envExists()) log('✓ .env.local already exists; kept unchanged.');
  for (const [command, commandArgs, label] of commands) {
    const started = Date.now();
    log(`\n→ ${label}`);
    const code = await runCommand(command, commandArgs);
    log(`${code === 0 ? '✓' : '✗'} ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    if (code !== 0) return code;
  }
  log('\nReady. Run: pnpm dev');
  log('Parent/centre web: http://localhost:3000 · Teacher app: http://localhost:8081');
  log('Sign-in codes: http://localhost:8093 (sms-sink)');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await runSetup();
}
