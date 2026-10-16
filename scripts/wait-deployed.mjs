// node scripts/wait-deployed.mjs <commit-sha> [--timeout-min 20]
// Waits until every deployed app (deploy/deployed-urls.json) reports <commit-sha> on its health
// endpoint — Vercel and Railway deploy main on every push — then exits 0. Exits 1 on timeout,
// naming the apps still on an older commit. Used by .github/workflows/deployed.yml.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const sha = process.argv[2];
if (!sha) {
  console.error('Usage: node scripts/wait-deployed.mjs <commit-sha>');
  process.exit(2);
}
const i = process.argv.indexOf('--timeout-min');
const until = Date.now() + (i > 0 ? Number(process.argv[i + 1]) : 20) * 60_000;
const u = JSON.parse(readFileSync(join(ROOT, 'deploy', 'deployed-urls.json'), 'utf8'));
const apps = {
  'trial web': `${u.publicTrial.web}/health`,
  'trial teacher': `${u.publicTrial.teacher}/health.json`,
  'demo API': `${u.publicTrial.demoApi}/health`,
  'staging web': `${u.staging.web}/health`,
  'staging teacher': `${u.staging.teacher}/health.json`,
  'staging ops': `${u.staging.ops}/health`,
  'core-api': `${u.staging.api}/health`,
};

async function commitOf(url) {
  try {
    const r = await fetch(`${url}?t=${Date.now()}`, { signal: AbortSignal.timeout(10_000) });
    return r.ok ? ((await r.json()).commit ?? 'none') : `HTTP ${r.status}`;
  } catch (e) {
    return `down (${e.message})`;
  }
}

const pending = new Set(Object.keys(apps));
for (;;) {
  for (const name of [...pending]) if ((await commitOf(apps[name])) === sha) pending.delete(name);
  if (!pending.size) {
    console.log(`✓ every app runs ${sha.slice(0, 7)}`);
    process.exit(0);
  }
  if (Date.now() > until) {
    for (const name of pending) console.error(`✗ ${name}: ${await commitOf(apps[name])}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
