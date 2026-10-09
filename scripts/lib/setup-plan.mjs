// What `pnpm run setup` does, as data: the ordered steps for the given flags and machine. Pure, so the
// unit tests can check the plan (and --dry-run prints it) without running anything.

/** Executable names: Windows runs pnpm through its .cmd shim. */
export const bin = (name, platform) =>
  platform === 'win32' && name === 'pnpm' ? 'pnpm.cmd' : name;

/**
 * @param {{ dryRun?: boolean, skipAi?: boolean, resetData?: boolean }} flags
 * @param {{ platform: string, node: string, uv: boolean }} machine
 *   node: path of the running Node (process.execPath); uv: is `uv` on PATH?
 * @returns {{ id: string, title: string, cmd?: string, args?: string[], note?: string, confirm?: string }[]}
 */
export function setupPlan(flags, machine) {
  const node = machine.node;
  const pnpm = bin('pnpm', machine.platform);
  const steps = [
    { id: 'doctor', title: 'Check the machine (pnpm run doctor)' },
    { id: 'install', title: 'Install the workspace packages', cmd: pnpm, args: ['install'] },
    {
      id: 'env',
      title: 'Write .env.local, or add the names it lacks (values never change)',
      cmd: node,
      args: ['scripts/env-local.mjs'],
    },
    {
      id: 'services',
      title: 'Start the local services and wait until healthy',
      cmd: node,
      args: ['scripts/dev-infra.mjs'],
    },
    {
      id: 'migrate',
      title: 'Migrate the database',
      cmd: node,
      args: ['scripts/db.mjs', 'migrate'],
    },
  ];
  if (flags.resetData)
    steps.push({
      id: 'seed',
      title: 'Wipe and re-seed the sample data',
      cmd: node,
      args: ['scripts/db.mjs', 'seed', '--reset'],
      confirm: 'reset',
    });
  else
    steps.push({
      id: 'seed',
      title: 'Seed the sample data (only if the database is empty)',
      cmd: node,
      args: ['scripts/db.mjs', 'seed', '--if-empty'],
    });
  if (flags.skipAi)
    steps.push({ id: 'ai', title: 'ai-service packages', note: 'skipped (--skip-ai)' });
  else if (!machine.uv)
    steps.push({
      id: 'ai',
      title: 'ai-service packages',
      note: 'skipped: uv is not installed (voice notes stay off; see pnpm run doctor)',
    });
  else
    steps.push({
      id: 'ai',
      title: 'Install the ai-service packages (Python 3.12)',
      cmd: 'uv',
      args: ['sync', '--directory', 'apps/ai-service', '--locked'],
    });
  return steps;
}

export const NEXT_STEPS = `Next:
  pnpm dev            run Link with the real backend (codes in sms-sink: http://localhost:8093)
  pnpm ai:models      once, for voice notes (about 6 GB of speech models)
  pnpm run doctor     check the machine again at any time
  docs/RUNNING.md     sign-in numbers, the click list, resets and fixes`;

/** The running Node's full path prints as `node`. */
const shown = (cmd) => (/[\\/]node(\.exe)?$/i.test(cmd) ? 'node' : cmd);

/** The dry-run listing. */
export function formatPlan(steps) {
  return steps
    .map(
      (s, i) =>
        `${String(i + 1).padStart(2)}. ${s.title}` +
        (s.cmd ? `\n      $ ${[shown(s.cmd), ...(s.args ?? [])].join(' ')}` : '') +
        (s.note ? `\n      (${s.note})` : '') +
        (s.confirm ? `\n      (asks you to type "${s.confirm}" first)` : ''),
    )
    .join('\n');
}
