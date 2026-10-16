// Vercel "Ignored Build Step": `ignoreCommand` in apps/web, apps/ops and apps/teacher-app vercel.json.
// Vercel runs it in the app's folder before building: exit 0 = skip this build, exit 1 = build.
// The rule is in scripts/lib/vercel-ignore.mjs.
import { basename } from 'node:path';
import { changedFiles } from './lib/deployed-apps.mjs';
import { decide } from './lib/vercel-ignore.mjs';

const ref = process.env.VERCEL_GIT_COMMIT_REF;
const prev = process.env.VERCEL_GIT_PREVIOUS_SHA;
const sha = process.env.VERCEL_GIT_COMMIT_SHA;
const changed = prev && sha ? changedFiles(prev, sha, '../..') : null;
const d = decide({ ref, appDir: basename(process.cwd()), changed });
console.log(`vercel-ignore: ${ref ?? '(no branch)'} → ${d}`);
process.exit(d === 'skip' ? 0 : 1);
