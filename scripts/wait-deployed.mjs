// node scripts/wait-deployed.mjs <commit-sha> [--timeout-min 20]
// Waits until every deployed app (deploy/deployed-urls.json) is current for <commit-sha>, then
// exits 0. Current = its health endpoint reports <commit-sha>, or an older commit when nothing
// that app is built from changed since (Vercel skips unaffected projects; scripts/lib/deployed-apps.mjs).
// Exits 1 on timeout, naming the apps still behind. Needs the git history (fetch-depth: 0).
// Used by .github/workflows/deployed.yml.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';
import { deployedApps, isCurrent } from './lib/deployed-apps.mjs';

const sha = process.argv[2];
if (!sha) {
  console.error('Usage: node scripts/wait-deployed.mjs <commit-sha>');
  process.exit(2);
}
const i = process.argv.indexOf('--timeout-min');
const until = Date.now() + (i > 0 ? Number(process.argv[i + 1]) : 20) * 60_000;
const apps = deployedApps(
  JSON.parse(readFileSync(join(ROOT, 'deploy', 'deployed-urls.json'), 'utf8')),
);

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
  for (const name of [...pending]) {
    const running = await commitOf(apps[name].health);
    if (isCurrent(running, sha, apps[name].paths, ROOT)) {
      pending.delete(name);
      if (running !== sha) console.log(`· ${name}: ${running.slice(0, 7)}, unchanged since`);
    }
  }
  if (!pending.size) {
    console.log(`✓ every app is current for ${sha.slice(0, 7)}`);
    process.exit(0);
  }
  if (Date.now() > until) {
    for (const name of pending) console.error(`✗ ${name}: ${await commitOf(apps[name].health)}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
