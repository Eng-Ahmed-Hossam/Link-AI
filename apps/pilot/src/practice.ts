/**
 * The practice centre for day-one training (4.3): a separate folder next to the real pilot data,
 * marked as practice, with the synthetic sample roster. It never shares a file with the real data,
 * it is never measured (`pilot:metrics` refuses it), it never records voice (staff voices would be
 * real audio), and `pilot:practice-wipe` deletes only a folder that carries the practice mark.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const PRACTICE_MARKER = 'PRACTICE-CENTRE.txt';

/** `<real data folder>-practice`, unless PILOT_PRACTICE_DIR says otherwise. */
export function practiceDirFor(realDir: string, override?: string): string {
  return resolve(override?.trim() ? override : `${resolve(realDir)}-practice`);
}

/** The practice folder may not be, contain, or sit inside the real data folder. */
export function assertSeparate(realDir: string, practiceDir: string): void {
  const r = resolve(realDir);
  const p = resolve(practiceDir);
  if (p === r || p.startsWith(r + sep) || r.startsWith(p + sep))
    throw new Error(
      `The practice folder (${p}) must be separate from the real pilot data (${r}). Nothing was changed.`,
    );
}

export const isPractice = (dir: string) => existsSync(join(dir, PRACTICE_MARKER));

export function markPractice(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, PRACTICE_MARKER),
    'Practice centre for staff training (Link pilot). Synthetic sample data only.\n' +
      'Delete with: pnpm pilot:practice-wipe\n',
  );
}

/** Deletes the practice folder; refuses any folder without the practice mark. */
export function wipePractice(dir: string): boolean {
  if (!existsSync(dir)) return false;
  if (!isPractice(dir))
    throw new Error(
      `${dir} is not a practice centre (no ${PRACTICE_MARKER}). Nothing was deleted.`,
    );
  rmSync(dir, { recursive: true, force: true });
  return true;
}
