/** `pnpm pilot:backup` — take a backup now (the server also takes one every hour and on shutdown). */
import { backup, listBackups } from '../store';
import { config, fail } from './common';

const cfg = config();
const to = backup(cfg.dataDir, cfg.backupDir, 'manual');
if (!to) fail(`No pilot data in ${cfg.dataDir}.`);
console.log(`✔ Backup: ${to}\n  ${listBackups(cfg.backupDir).length} backups kept (newest 48).`);
