// pnpm run doctor [--json] — is this machine ready to run Link? Read-only: it changes nothing.
// Prints a ✓ / ⚠ / ✗ table (or JSON with --json) and exits 1 when anything is ✗.
// The checks themselves live in scripts/lib/checks.mjs (unit-tested with recorded output).
import { failed, formatTable, runChecks } from './lib/checks.mjs';
import { localEnv, realProbe, wantedPnpm } from './lib/probe.mjs';

const results = await runChecks(realProbe(), { wantedPnpm: wantedPnpm(), env: localEnv() });
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: !failed(results), checks: results }, null, 2));
} else {
  console.log('\nLink doctor — is this machine ready? (read-only)\n');
  console.log(formatTable(results));
  console.log(
    failed(results)
      ? '\n✗ Fix the ✗ lines first (docs/setup-windows.md has the common fixes).\n'
      : '\n✓ Ready. Next: pnpm run setup (first time) or pnpm dev.\n',
  );
}
process.exit(failed(results) ? 1 : 0);
