// The decision behind scripts/vercel-ignore.mjs (Vercel's Ignored Build Step).
import { SHARED, untouched } from './deployed-apps.mjs';

/**
 * - Branches `db/*` never build: the database work has no screens yet, so previews only cost minutes.
 * - Other branches build when the commit touches a file the app is built from (the app's folder,
 *   the shared packages, the root config), as Vercel's own "skip unaffected projects" does; when
 *   git can't tell (`changed` is null: shallow clone, first deploy), they build.
 * @param {{ ref?: string, appDir: string, changed: string[] | null }} p
 * @returns {'skip' | 'build'}
 */
export function decide({ ref, appDir, changed }) {
  if (/^db\//.test(ref ?? '')) return 'skip';
  if (!changed) return 'build';
  return untouched(changed, [`apps/${appDir}/`, ...SHARED]) ? 'skip' : 'build';
}
