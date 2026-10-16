// MapLibre's browser files, served from our own origins (docs/plan/map-provider.md):
//   apps/web/public/maplibre/        the worker (its URL is computed at run time, which the
//                                    bundler can't follow) and the Arabic text plugin;
//   apps/teacher-app/public/maplibre/ all of it: the Expo web build (J01 map) loads MapLibre as a
//                                    module script, so Metro never bundles it.
// Run after changing the maplibre-gl version in packages/ui:  node scripts/vendor-maplibre.mjs
// pnpm test:scripts fails while a copy and the installed version differ (vendor-maplibre.test.mjs).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ROOT } from './lib/env.mjs';

export const MAPLIBRE_DIST = join(
  dirname(
    createRequire(join(ROOT, 'packages', 'ui', 'package.json')).resolve('maplibre-gl/package.json'),
  ),
  'dist',
);
export const RTL = ['mapbox-gl-rtl-text.js', 'mapbox-gl-rtl-text.LICENSE.md'];
export const TARGETS = {
  'apps/web/public/maplibre': ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'],
  'apps/teacher-app/public/maplibre': [
    'maplibre-gl.mjs',
    'maplibre-gl-shared.mjs',
    'maplibre-gl-worker.mjs',
    'maplibre-gl.css',
  ],
};

if (process.argv[1]?.endsWith('vendor-maplibre.mjs')) {
  for (const [dir, files] of Object.entries(TARGETS)) {
    mkdirSync(join(ROOT, dir), { recursive: true });
    for (const f of files) copyFileSync(join(MAPLIBRE_DIST, f), join(ROOT, dir, f));
  }
  // The Arabic text plugin is vendored once in apps/web (version in its README line there).
  for (const f of RTL)
    copyFileSync(
      join(ROOT, 'apps/web/public/maplibre', f),
      join(ROOT, 'apps/teacher-app/public/maplibre', f),
    );
  console.log('vendor-maplibre: copied into apps/web and apps/teacher-app public/maplibre/');
}
