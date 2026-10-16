// pnpm smoke:deployed [--full] [--only trial|staging] [--report <file.md>]
// Playwright against every deployed app (deploy/deployed-urls.json), then a markdown report:
// per page — console errors, failed requests, map tiles, the page's main action. Read-mostly.
// Staging sign-in needs SMOKE_SMS_TOKEN (GitHub secret STAGING_SMS_SINK_TOKEN); without it the
// staging sign-in tests fail and say so. Exit code = the suite's.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const args = process.argv.slice(2);
const val = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const out = join(ROOT, 'apps', 'web', 'test-results', 'deployed-results.jsonl');
rmSync(out, { force: true });
const only = val('--only');
const t0 = Date.now();
const r = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  [
    'exec',
    'playwright',
    'test',
    '-c',
    'playwright.deployed.config.ts',
    ...(only ? [`${only}.spec.ts`] : []),
  ],
  {
    cwd: join(ROOT, 'apps', 'web'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      SMOKE_OUT: out,
      SMOKE_MATRIX: args.includes('--full') ? 'full' : 'quick',
    },
  },
);
const secs = Math.round((Date.now() - t0) / 1000);
const rows = existsSync(out)
  ? readFileSync(out, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  : [];
const bad = rows.filter((x) => !x.ok);
const esc = (s) => String(s ?? '').replace(/\|/g, '\|');
const map = (m) => (m ? `${m.tiles} tiles${m.blank ? ', **blank**' : ''}` : '—');
const md = `# Deployed check — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC

\`pnpm smoke:deployed${args.includes('--full') ? ' --full' : ''}\` against [deploy/deployed-urls.json](../../deploy/deployed-urls.json): ${rows.length} page checks, **${rows.length - bad.length} clean, ${bad.length} with problems**, ${secs} s.

| Env | App | Role | Page | Lang @ width | Main action | Result | Map | Console errors | Failed requests |
|---|---|---|---|---|---|---|---|---|---|
${rows
  .map(
    (x) =>
      `| ${x.env} | ${x.app} | ${x.role} | ${x.page} | ${x.lang} @ ${x.width} | ${esc(x.action)}${x.actionOk ? ' ✓' : ` ✗ ${esc(x.error)}`} | ${x.ok ? 'clean' : '**problem**'} | ${map(x.map)} | ${esc(x.consoleErrors.join('; ')) || '—'} | ${esc(x.failedRequests.join('; ')) || '—'} |`,
  )
  .join('\n')}
`;
writeFileSync(join(ROOT, 'apps', 'web', 'test-results', 'deployed-report.md'), md);
if (val('--report')) writeFileSync(join(ROOT, val('--report')), md);
console.log(
  `smoke:deployed: ${rows.length} checks, ${rows.length - bad.length} clean, ${bad.length} with problems (${secs} s).`,
);
process.exit(r.status ?? 1);
