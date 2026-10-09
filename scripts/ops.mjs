// pnpm ops:verify-centre <centreId|phone> — local stand-ins for the ops console (APP_ENV=local).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ROOT, fail, loadEnv, run } from './lib/env.mjs';

loadEnv();
if (process.env.APP_ENV !== 'local') fail('The ops stand-ins run only with APP_ENV=local.');
const [cmd, ...args] = process.argv.slice(2);
const scripts = { 'verify-centre': 'ops-verify-centre.ts' };
if (!scripts[cmd]) fail('Usage: node scripts/ops.mjs verify-centre <centreId|phone>');
const coreApi = join(ROOT, 'apps', 'core-api');
const tsx = join(
  dirname(createRequire(join(coreApi, 'package.json')).resolve('tsx/package.json')),
  'dist',
  'cli.mjs',
);
run(process.execPath, [tsx, join('scripts', scripts[cmd]), ...args], { cwd: coreApi });
