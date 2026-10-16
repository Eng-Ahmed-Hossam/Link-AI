// pnpm test:scripts — wait-deployed: an app Vercel skipped (nothing it is built from changed)
// still counts as current; an app whose files changed must report the new commit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT } from '../lib/env.mjs';
import { deployedApps, isCurrent, untouched } from '../lib/deployed-apps.mjs';

const apps = deployedApps(
  JSON.parse(readFileSync(join(ROOT, 'deploy', 'deployed-urls.json'), 'utf8')),
);

describe('wait-deployed: which apps a commit affects', () => {
  it('lists every deployed app with its health endpoint', () => {
    assert.deepEqual(Object.keys(apps).sort(), [
      'core-api',
      'demo API',
      'staging ops',
      'staging teacher',
      'staging web',
      'trial teacher',
      'trial web',
    ]);
    for (const a of Object.values(apps)) assert.match(a.health, /^https:\/\/.+\/health(\.json)?$/);
  });

  it('a docs-only commit leaves every app current', () => {
    for (const a of Object.values(apps))
      assert.ok(untouched(['docs/plan/x.md', 'CLAUDE.md', 'scripts/wait-deployed.mjs'], a.paths));
  });

  it('a change to an app or a shared package needs that app redeployed', () => {
    assert.ok(!untouched(['apps/web/src/x.tsx'], apps['trial web'].paths));
    assert.ok(untouched(['apps/web/src/x.tsx'], apps['trial teacher'].paths));
    for (const a of Object.values(apps)) {
      assert.ok(!untouched(['packages/ui/src/x.tsx'], a.paths));
      assert.ok(!untouched(['pnpm-lock.yaml'], a.paths));
    }
  });

  it('the same commit is current; an unknown or non-commit value is not', () => {
    const sha = 'a'.repeat(40);
    assert.ok(isCurrent(sha, sha, [], ROOT));
    assert.ok(!isCurrent('b'.repeat(40), sha, [], ROOT));
    assert.ok(!isCurrent('HTTP 502', sha, [], ROOT));
    assert.ok(!isCurrent('none', sha, [], ROOT));
  });
});
