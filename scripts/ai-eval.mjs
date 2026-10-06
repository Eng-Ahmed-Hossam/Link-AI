// pnpm ai:eval — predictions from ai-service, then the eval kit's report (B4).
//
//   pnpm ai:eval [--mode text|audio] [--gold evals/gold/synthetic] [--audio-dir <dir>]
//                [--models large-v3-turbo,egy-turbo-ft] [--stt-device auto|cuda|cpu] [--llm-device auto|cpu]
//                [--llm qwen3:8b | --no-llm] [--label <suffix>] [--force] [--calibrate]
//
// 1. For each STT model (audio mode) or once (text mode), `python -m ai_service.predict` writes one
//    <id>.pred.json per note into evals-runs/<date>-<mode>-<model>/ (resumable, git-ignored).
// 2. Then `python -m link_eval run` (evals/, Codex track; run in the py/link_nlp environment as
//    docs/ai/link-nlp.md says) scores them into evals/reports/<date>-<mode>-<model>.md (+ JSON).
// 3. With --calibrate: `link_eval calibrate` (report only: reliability per confidence bucket and
//    suggested thresholds; nothing changes) into evals/reports/<name>.calibration.md.
// Long runs: start this in your own terminal; re-running continues where it stopped.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash >= 0 ? argv.slice(0, dash) : argv;
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
const sttDevice = opt('stt-device', 'auto');
const llmDevice = opt('llm-device', 'auto');
const label = opt('label', '');
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
  const name = `${day}-${mode}-${m}-${llm ? llm.replace(/[:/]/g, '-') : 'rules-only'}${label ? `-${label}` : ''}`;
  const out = join('evals-runs', name);
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
    ...(mode === 'audio'
      ? ['--audio-dir', join(ROOT, audioDir), '--stt-model', m, '--stt-device', sttDevice]
      : []),
    ...(llm ? ['--llm', llm, '--llm-device', llmDevice] : ['--no-llm']),
    ...(flag('force') ? ['--force'] : []),
  ];
  if (run('uv', args) !== 0) process.exit(1);
  preds.push({ out, name });
}

let worst = 0;
for (const { out, name } of preds) {
  const report = join(ROOT, 'evals', 'reports', `${name}.md`);
  console.log(`
▶ link_eval run on ${out} → evals/reports/${name}.md`);
  const status = run('uv', [
    '--directory',
    'py/link_nlp',
    'run',
    'python',
    '-m',
    'link_eval',
    'run',
    '--gold',
    join(ROOT, gold),
    '--predictions',
    join(ROOT, out),
    '--out',
    report,
  ]);
  // 0 PASS; non-zero = FAIL or INCOMPLETE: keep scoring the other models, report the worst.
  worst = Math.max(worst, status);
  if (flag('calibrate')) {
    const r = spawnSync(
      'uv',
      [
        '--directory',
        'py/link_nlp',
        'run',
        'python',
        '-m',
        'link_eval',
        'calibrate',
        '--predictions',
        join(ROOT, out),
        '--gold',
        join(ROOT, gold),
      ],
      { cwd: ROOT, shell: true, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } },
    );
    const file = join(ROOT, 'evals', 'reports', `${name}.calibration.md`);
    writeFileSync(
      file,
      `# Calibration (report only) — ${name}

${r.stdout ?? ''}`,
    );
    console.log(`▶ calibration (report only) → evals/reports/${name}.calibration.md`);
  }
}
process.exit(worst);
