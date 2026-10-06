/**
 * `pnpm pilot:metrics [--out <folder>]` — writes `metrics-<date>.md` and `.csv` (default folder:
 * docs/pilot). Reads the append-only activity log and the group schedule; counts only, no names.
 * Safe to run while the server is running.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../config';
import { computeMetrics, metricsCsv, metricsMarkdown } from '../metrics';
import { isPractice } from '../practice';
import { PilotStore, readLog } from '../store';
import { args, config, fail, userPath } from './common';

const { opts } = args();
const cfg = config();
const store = new PilotStore(cfg.dataDir);
if (!store.exists) fail(`No pilot data in ${cfg.dataDir}.`);
// The practice centre is training only: it is never measured (4.3).
if (isPractice(cfg.dataDir)) fail(`${cfg.dataDir} is the practice centre: it is never measured.`);
const snap = store.open();
store.close();
const m = computeMetrics(readLog(cfg.dataDir), snap.fu.world!);
const out = typeof opts.out === 'string' ? userPath(opts.out) : join(REPO_ROOT, 'docs', 'pilot');
mkdirSync(out, { recursive: true });
const day = m.to;
writeFileSync(join(out, `metrics-${day}.md`), metricsMarkdown(m, snap.meta.centreName));
writeFileSync(join(out, `metrics-${day}.csv`), metricsCsv(m));
const c = m.completion;
console.log(`✔ ${join(out, `metrics-${day}.md`)}
  Follow-ups: ${c.casesOpened} opened • contacted by due date ${c.contactedByDue.n}/${c.contactedByDue.of} • outcome logged ${c.outcomeLogged.n}/${c.outcomeLogged.of}`);
