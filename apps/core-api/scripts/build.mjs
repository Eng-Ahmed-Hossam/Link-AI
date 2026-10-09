// node scripts/build.mjs — the production build of core-api (ship job S1). One esbuild bundle per
// entry: dist/main.mjs (api | worker | gateway) and dist/migrate.mjs (migrations + role passwords).
// npm packages stay external (the image installs the production dependencies); workspace
// packages (@link/*, TypeScript source) are bundled in. Code splitting keeps the demo routes and
// the sample seed in their own chunk, loaded only where demo routes are allowed — never with
// LINK_ENV=production (src/platform/guard.ts).
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@link/'));

rmSync(join(root, 'dist'), { recursive: true, force: true });
const r = await build({
  entryPoints: { main: join(root, 'src/main.ts'), migrate: join(root, 'src/migrate.ts') },
  outdir: join(root, 'dist'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  external,
  // CommonJS packages bundled into ESM still call require(): give them one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'warning',
  metafile: true,
});
const out = Object.entries(r.metafile.outputs)
  .filter(([f]) => f.endsWith('.mjs'))
  .map(([f, o]) => `${f.replace(/^.*dist\//, 'dist/')} ${(o.bytes / 1024).toFixed(0)} kB`);
console.log(`✔ core-api built:\n  ${out.join('\n  ')}`);
