// pnpm test:scripts — Vercel's Ignored Build Step: no previews for db/* branches; other branches
// build only when the app's files changed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT } from '../lib/env.mjs';
import { decide } from '../lib/vercel-ignore.mjs';

describe('vercel ignore step', () => {
  it('never builds a db/* branch, whatever it changes', () => {
    for (const appDir of ['web', 'ops', 'teacher-app'])
      assert.equal(
        decide({ ref: 'db/local-v2', appDir, changed: [`apps/${appDir}/x.ts`] }),
        'skip',
      );
  });

  it('builds other branches when the app or a shared package changed, or when git cannot tell', () => {
    assert.equal(decide({ ref: 'main', appDir: 'web', changed: ['apps/web/a.tsx'] }), 'build');
    assert.equal(decide({ ref: 'fix/x', appDir: 'ops', changed: ['packages/ui/b.tsx'] }), 'build');
    assert.equal(decide({ ref: 'main', appDir: 'teacher-app', changed: null }), 'build');
    assert.equal(decide({ ref: 'main', appDir: 'web', changed: ['docs/a.md'] }), 'skip');
    assert.equal(decide({ ref: 'main', appDir: 'web', changed: ['apps/ops/a.ts'] }), 'skip');
  });

  it('every Vercel app folder runs it', () => {
    for (const appDir of ['web', 'ops', 'teacher-app']) {
      const cfg = JSON.parse(readFileSync(join(ROOT, 'apps', appDir, 'vercel.json'), 'utf8'));
      assert.equal(cfg.ignoreCommand, 'node ../../scripts/vercel-ignore.mjs', appDir);
    }
  });
});
