// core-api runner: loads .env.local and starts the entrypoints with tsx (TypeScript, no build step
// locally). `dev` restarts on file changes; `start` does not.
//   node scripts/core-api.mjs dev [api|worker|gateway|all]   (default all)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ROOT, loadEnv, fail } from './lib/env.mjs';

loadEnv();
const [mode = 'dev', which = 'all'] = process.argv.slice(2);
if (!['dev', 'start'].includes(mode))
  fail('Usage: node scripts/core-api.mjs dev|start [api|worker|gateway|all]');
const entries = which === 'all' ? ['api', 'worker', 'gateway'] : [which];
const coreApi = join(ROOT, 'apps', 'core-api');
const tsxCli = join(
  dirname(createRequire(join(coreApi, 'package.json')).resolve('tsx/package.json')),
  'dist',
  'cli.mjs',
);

const children = entries.map((entry) => {
  const args = [
    tsxCli,
    ...(mode === 'dev' ? ['watch', '--clear-screen=false'] : []),
    'src/main.ts',
    entry,
  ];
  const child = spawn(process.execPath, args, { cwd: coreApi, stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`core-api ${entry} exited with ${code}`);
  });
  return child;
});

const stop = () => {
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
