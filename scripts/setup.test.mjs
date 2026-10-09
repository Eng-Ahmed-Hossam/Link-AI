import assert from 'node:assert/strict';
import test from 'node:test';

import { runSetup } from './setup.mjs';

test('--dry-run runs only doctor and prints setup commands in order', async () => {
  const lines = [];
  const commands = [];
  const code = await runSetup({
    args: ['--dry-run'],
    log: (line) => lines.push(line),
    runDoctor: async () => 0,
    runCommand: async (command, args) => commands.push([command, ...args]),
    envExists: () => false,
  });

  assert.equal(code, 0);
  assert.deepEqual(commands, []);
  const output = lines.join('\n');
  const expected = [
    'doctor',
    'pnpm install',
    'node scripts/env-local.mjs',
    'pnpm dev:infra',
    'pnpm db:migrate',
    'pnpm seed:demo',
    'uv sync --directory apps/ai-service',
  ];
  let cursor = -1;
  for (const text of expected) {
    const next = output.indexOf(text);
    assert.ok(next > cursor, `${text} should appear in order`);
    cursor = next;
  }
});
