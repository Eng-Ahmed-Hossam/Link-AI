// pnpm ai:eval — predictions from ai-service, then the eval kit's report (B4).
//
//   pnpm ai:eval [--mode text|audio] [--gold evals/gold/synthetic] [--audio-dir <dir>]
//                [--models large-v3-turbo,egy-turbo-ft] [--llm qwen3:8b | --no-llm] [--force]
//                [-- <extra arguments for link_eval run>]
//
// 1. For each STT model (audio mode) or once (text mode), `python -m ai_service.predict` writes one
//    <id>.pred.json per note into evals-runs/<date>-<mode>-<model>/ (resumable, git-ignored).
// 2. Then `uv run python -m link_eval run` (the eval kit, evals/, Codex track) scores them and
//    writes the Markdown report. Until that kit is merged, step 2 is skipped with a note.
// Long runs: start this in your own terminal; re-running continues where it stopped.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash >= 0 ? argv.slice(0, dash) : argv;
const passthrough = dash >= 0 ? argv.slice(dash + 1) : [];
const opt = (name, def) => {
  const i = own.indexOf(`--${name}`);
  return i >= 0 ? own[i + 1] : def;
};
const flag = (name) => own.includes(`--${name}`);

const mode = opt('mode', 'text');
const gold = opt('gold', join('evals', 'gold', 'synthetic'));
const audioDir = opt('audio-dir', join('evals', 'gold', 'audio'));
const models = mode === 'audio' ? opt('models', 'large-v3-turbo').split(',') : ['reference'];
const llm = flag('no-llm') ? null : opt('llm', 'qwen3:8b');
const day = new Date().toISOString().slice(0, 10);

if (!existsSync(join(ROOT, gold))) {
  console.error(`✖ No gold set at ${gold}. It arrives with the eval kit (branch codex/nlp-eval).`);
  process.exit(1);
}
const run = (cmd, args, extraEnv = {}) =>
  spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PYTHONUTF8: '1', ...extraEnv },
  }).status ?? 1;

const preds = [];
for (const m of models) {
  const out = join('evals-runs', `${day}-${mode}-${m}${llm ? '' : '-nollm'}`);
  mkdirSync(join(ROOT, out), { recursive: true });
  console.log(`\n▶ predictions: ${mode} mode, ${m}, LLM ${llm ?? 'off'} → ${out}`);
  const args = [
    '--directory',
    'apps/ai-service',
    'run',
    'python',
    '-m',
    'ai_service.predict',
    '--gold',
    join(ROOT, gold),
    '--out',
    join(ROOT, out),
    '--mode',
    mode,
    ...(mode === 'audio' ? ['--audio-dir', join(ROOT, audioDir), '--stt-model', m] : []),
    ...(llm ? ['--llm', llm] : ['--no-llm']),
    ...(flag('force') ? ['--force'] : []),
  ];
  if (run('uv', args) !== 0) process.exit(1);
  preds.push(out);
}

const kit = ['evals/link_eval', 'evals/src/link_eval', 'py/link_eval'].find((p) =>
  existsSync(join(ROOT, p)),
);
if (!kit) {
  console.log(
    `\nℹ The eval kit (link_eval) is not merged yet — predictions are ready in:\n  ${preds.join('\n  ')}`,
  );
  process.exit(0);
}
for (const p of preds) {
  console.log(`\n▶ link_eval run on ${p}`);
  const status = run('uv', [
    '--directory',
    'evals',
    'run',
    'python',
    '-m',
    'link_eval',
    'run',
    '--gold',
    join(ROOT, gold),
    '--pred',
    join(ROOT, p),
    ...passthrough,
  ]);
  if (status !== 0) process.exit(status);
}
