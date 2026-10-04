/**
 * `pnpm pilot:restore` — list backups; `pnpm pilot:restore <name>` restores one (server stopped).
 * The current data is backed up first, so a restore can itself be undone.
 */
import { listBackups, restore } from '../store';
import { args, ask, config, fail, requireStopped } from './common';

const { pos } = args();
const cfg = config();
const all = listBackups(cfg.backupDir);
if (!pos[0]) {
  console.log(
    all.length
      ? `Backups (oldest first):\n${all.map((b) => `  ${b}`).join('\n')}`
      : 'No backups yet.',
  );
  console.log('\nRestore one with: pnpm pilot:restore <name>');
  process.exit(0);
}
requireStopped(cfg);
if (!all.includes(pos[0])) fail(`No backup named ${pos[0]}.`);
const typed = await ask(
  `Restore ${pos[0]}? Changes made after it are set aside (backed up). Type RESTORE: `,
);
if (typed !== 'RESTORE') fail('Not confirmed. Nothing changed.');
restore(cfg.dataDir, cfg.backupDir, pos[0]);
console.log(`✔ Restored ${pos[0]}. The data before the restore is in a "before-restore" backup.`);
