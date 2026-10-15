// pnpm test:scripts — deploy configs may only point at main.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEPLOY_CONFIG, deployBranchProblems } from '../lib/deploy-branch.mjs';

describe('deploy branch check', () => {
  it('finds the Vercel and Railway config files', () => {
    for (const f of [
      'apps/teacher-app/vercel.json',
      'railway.json',
      'apps/web/railway.toml',
      'deploy/railway.ai-service.json',
    ])
      assert.ok(DEPLOY_CONFIG.test(f), f);
    for (const f of ['deploy/railway-postgres.Dockerfile', 'package.json', 'apps/web/vercel.ts'])
      assert.ok(!DEPLOY_CONFIG.test(f), f);
  });

  it('accepts configs on main or with no branch', () => {
    assert.deepEqual(
      deployBranchProblems(
        'vercel.json',
        '{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}',
      ),
      [],
    );
    assert.deepEqual(
      deployBranchProblems(
        'vercel.json',
        '{"git":{"deploymentEnabled":{"main":true,"codex-x":false}}}',
      ),
      [],
    );
    assert.deepEqual(
      deployBranchProblems('railway.toml', '[build]\nbuilder = "DOCKERFILE"\nbranch = "main"\n'),
      [],
    );
  });

  it('refuses another branch', () => {
    assert.equal(
      deployBranchProblems('railway.json', '{"deploy":{"branch":"codex/deploy-voice-demo"}}')
        .length,
      2,
    );
    assert.match(
      deployBranchProblems('vercel.json', '{"git":{"deploymentEnabled":{"dev":true}}}')[0],
      /deploymentEnabled\["dev"\]/,
    );
    assert.match(
      deployBranchProblems('railway.toml', 'branch = "staging"\n')[0],
      /branch = "staging"/,
    );
    assert.match(deployBranchProblems('vercel.json', '{"x":"claude/serene"}')[0], /working branch/);
  });
});
