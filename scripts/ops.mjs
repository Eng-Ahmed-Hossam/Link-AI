// pnpm ops:verify-centre <centreId|phone> · pnpm ops:refunds list|approve|deny · pnpm ops:access — local
// helpers next to
// the ops console (APP_ENV=local only; never part of the public demo or the pilot builds).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ROOT, fail, loadEnv, run } from './lib/env.mjs';

loadEnv();
if (process.env.APP_ENV !== 'local') fail('The ops stand-ins run only with APP_ENV=local.');
const [cmd, ...args] = process.argv.slice(2);
const scripts = {
  'verify-centre': 'scripts/ops-verify-centre.ts',
  refunds: 'scripts/ops-refunds.ts',
  // Who may use the ops console (S2); on a server: `node dist/main.mjs ops-access …` in the api container.
  access: 'src/main.ts',
};
if (!scripts[cmd])
  fail(
    'Usage: node scripts/ops.mjs verify-centre <centreId|phone> | refunds list|approve|deny | access list|grant|revoke',
  );
const coreApi = join(ROOT, 'apps', 'core-api');
const tsx = join(
  dirname(createRequire(join(coreApi, 'package.json')).resolve('tsx/package.json')),
  'dist',
  'cli.mjs',
);
run(process.execPath, [tsx, scripts[cmd], ...(cmd === 'access' ? ['ops-access'] : []), ...args], {
  cwd: coreApi,
});
