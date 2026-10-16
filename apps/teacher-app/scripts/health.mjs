// After `expo export`: dist/health.json names the commit the web build came from (Vercel sets
// VERCEL_GIT_COMMIT_SHA), so pnpm smoke:deployed can confirm the new version is live.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist';
writeFileSync(
  join(out, 'health.json'),
  JSON.stringify({
    status: 'ok',
    app: 'teacher',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? 'unknown',
    env: process.env.EXPO_PUBLIC_APP_ENV ?? 'unset',
  }) + '\n',
);
console.log(`health: ${out}/health.json`);
