/**
 * `pnpm pilot:wipe` — end of the pilot (A5): delete all pilot data and every backup, then print a
 * deletion receipt (counts and file names only, no personal data). Asks for typed confirmation.
 */
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { files, listBackups, PilotStore } from '../store';
import { ask, config, fail, requireStopped, userPath } from './common';

const cfg = config();
requireStopped(cfg);
const store = new PilotStore(cfg.dataDir);
if (!store.exists) fail(`No pilot data in ${cfg.dataDir}. Nothing to delete.`);
const snap = store.open();
store.close();
const fu = snap.fu;
const w = fu.world!;
const counts = {
  groups: w.groups.length,
  students: w.students.length,
  staff: w.users.length,
  records: fu.records.length,
  cases: fu.cases.length,
  messages: fu.messages.length,
  notes: fu.notes.length,
  activityEvents: fu.audit.length,
  voiceRecordings: Object.keys(snap.voice?.audio ?? {}).length,
  backups: listBackups(cfg.backupDir).length,
};

console.log(`
This deletes ALL pilot data for "${snap.meta.centreName}":
  ${counts.students} students, ${counts.records} session records, ${counts.cases} follow-ups,
  ${counts.messages} messages, ${counts.activityEvents} activity events, ${counts.backups} backups,
  and the pilot certificate keys.
  Folder: ${cfg.dataDir}
  Backups: ${cfg.backupDir}

It cannot be undone. Run pnpm pilot:metrics first if you still need the results.
`);
const phrase = 'DELETE PILOT DATA';
const typed = await ask(`Type ${phrase} to continue: `);
if (typed !== phrase) fail('Not confirmed. Nothing was deleted.');

const removed: { path: string; bytes: number }[] = [];
const rm = (p: string) => {
  if (!existsSync(p)) return;
  const walk = (x: string): number =>
    statSync(x).isDirectory()
      ? readdirSync(x).reduce((n, c) => n + walk(join(x, c)), 0)
      : statSync(x).size;
  removed.push({ path: p, bytes: walk(p) });
  rmSync(p, { recursive: true, force: true });
};
const f = files(cfg.dataDir);
rm(f.state);
rm(f.log);
rm(join(cfg.dataDir, 'tls'));
rm(join(cfg.dataDir, 'audio')); // encrypted voice recordings
rm(join(cfg.dataDir, 'keys')); // the audio key
rm(join(cfg.dataDir, 'ai-usage.jsonl'));
for (const n of readdirSync(cfg.dataDir))
  if (n.startsWith('state.json.tmp')) rm(join(cfg.dataDir, n));
rm(cfg.backupDir);
const left = existsSync(cfg.dataDir) ? readdirSync(cfg.dataDir) : [];

const at = new Date().toISOString();
const receipt = `LINK PILOT — DELETION RECEIPT
Centre: ${snap.meta.centreName}
Pilot: ${snap.meta.startDate} to ${snap.meta.endDate ?? '(no end date set)'}
Deleted at: ${at} (UTC)

Deleted (counts only; no personal data in this receipt):
${Object.entries(counts)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join('\n')}

Files and folders removed:
${removed.map((r) => `  ${r.path} (${r.bytes} bytes)`).join('\n')}

Left in the data folder: ${left.length ? left.join(', ') : 'nothing'}

Still to do by hand (docs/pilot/runbook.md, "End of pilot"):
  - On each teacher phone: remove the home-screen app and clear the site data for the pilot address.
  - Remove the pilot certificate (Link Pilot CA) from each teacher phone.
  - The drive stays BitLocker-encrypted; deleted files are not readable without its key.
`;
const out = userPath(`pilot-deletion-receipt-${at.slice(0, 10)}.txt`);
writeFileSync(out, receipt);
console.log(`\n${receipt}\nReceipt saved: ${out}\n`);
