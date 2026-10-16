// pnpm test:scripts — the vendored MapLibre files equal the installed maplibre-gl.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'node:test';
import { ROOT } from '../lib/env.mjs';
import { MAPLIBRE_DIST, TARGETS } from '../vendor-maplibre.mjs';

it('every vendored MapLibre file matches the installed version (node scripts/vendor-maplibre.mjs)', () => {
  for (const [dir, files] of Object.entries(TARGETS))
    for (const f of files)
      assert.ok(
        readFileSync(join(ROOT, dir, f)).equals(readFileSync(join(MAPLIBRE_DIST, f))),
        `${dir}/${f} is stale: run node scripts/vendor-maplibre.mjs`,
      );
});
