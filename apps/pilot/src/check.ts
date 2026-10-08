/**
 * The pilot start-up check (A1): refuse to start when anything from the demo could reach real
 * users — a demo route, a fixture or demo user in the data, a demo setting, or demo code in the
 * app bundles the pilot serves.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pilotHandlers, pilotStartupProblems } from '@link/mocks/pilot';
import type { WorldData } from '@link/mocks/world';

/** Strings that only demo or mock code contains (`data-dev-index`: the `/{lang}/dev` route index). */
export const BUNDLE_MARKERS = [
  '/__demo/',
  'usr-salma',
  'mock.usr-',
  'link.mock.fu',
  'data-dev-index',
  // The local demo's "Demo tools" link in the demo banner (Step 2B).
  'data-demo-tools',
  'Demo tools',
];

function* walk(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (['.js', '.html', '.mjs'].includes(extname(p))) yield p;
  }
}

/** Demo markers found in the built app bundles (each: file and marker). */
export function bundleProblems(dirs: string[]): string[] {
  const out: string[] = [];
  for (const d of dirs) {
    if (!existsSync(d)) {
      out.push(`App build missing: ${d} (run pnpm pilot:build).`);
      continue;
    }
    for (const f of walk(d)) {
      const text = readFileSync(f, 'utf8');
      for (const m of BUNDLE_MARKERS)
        if (text.includes(m)) out.push(`Demo code in the app bundle: "${m}" in ${f}`);
    }
  }
  return out;
}

export function startupProblems(opts: {
  world: WorldData | null;
  env: NodeJS.ProcessEnv;
  bundleDirs: string[];
}): string[] {
  return [
    ...pilotStartupProblems({
      mode: opts.env.LINK_MODE,
      handlers: pilotHandlers,
      world: opts.world,
      env: opts.env,
    }),
    ...bundleProblems(opts.bundleDirs),
  ];
}
