// The deployed apps, their health endpoints, and which files each one is built from. Vercel's
// "skip unaffected projects" does not rebuild an app when a commit changes none of its files, so
// that app keeps reporting an older commit: it is still current when nothing it is built from
// changed in between. Used by scripts/wait-deployed.mjs.
import { execFileSync } from 'node:child_process';

/** Files every app is built from: the shared packages and the workspace's root config. */
export const SHARED = [
  'packages/',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
];

/** @param {any} u deploy/deployed-urls.json */
export function deployedApps(u) {
  return {
    'trial web': { health: `${u.publicTrial.web}/health`, paths: ['apps/web/', ...SHARED] },
    'trial teacher': {
      health: `${u.publicTrial.teacher}/health.json`,
      paths: ['apps/teacher-app/', ...SHARED],
    },
    'demo API': {
      health: `${u.publicTrial.demoApi}/health`,
      paths: ['apps/ai-service/', 'deploy/', 'railway.json', ...SHARED],
    },
    'staging web': { health: `${u.staging.web}/health`, paths: ['apps/web/', ...SHARED] },
    'staging teacher': {
      health: `${u.staging.teacher}/health.json`,
      paths: ['apps/teacher-app/', ...SHARED],
    },
    'staging ops': { health: `${u.staging.ops}/health`, paths: ['apps/ops/', ...SHARED] },
    'core-api': {
      health: `${u.staging.api}/health`,
      paths: ['apps/core-api/', 'deploy/', 'railway.json', ...SHARED],
    },
  };
}

/** True when none of `changed` is under `paths` (a directory ends in '/'; otherwise exact). */
export function untouched(changed, paths) {
  return !changed.some((f) => paths.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
}

/** Files changed from `from` to `to`, or null when git can't tell (unknown commit, shallow clone). */
export function changedFiles(from, to, cwd) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', from, to], { cwd, stdio: 'ignore' });
    return execFileSync('git', ['diff', '--name-only', from, to], { cwd, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Is an app reporting `running` current for `sha`? Yes when it runs `sha`, or runs an ancestor
 * of `sha` and nothing it is built from changed since.
 */
export function isCurrent(running, sha, paths, cwd) {
  if (running === sha) return true;
  if (!/^[0-9a-f]{40}$/.test(running)) return false;
  const changed = changedFiles(running, sha, cwd);
  return changed !== null && untouched(changed, paths);
}
