import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareEnvNames,
  parseMajorVersion,
  parseUnixPorts,
  parseWindowsPorts,
  pnpmVersionMatches,
} from './checks.mjs';

test('parses tool major versions from common output', () => {
  assert.equal(parseMajorVersion('v24.10.0'), 24);
  assert.equal(parseMajorVersion('Python 3.12.8'), 3);
  assert.equal(parseMajorVersion('not installed'), null);
});

test('matches pnpm output against packageManager exactly', () => {
  assert.equal(pnpmVersionMatches('12.8.1\n', 'pnpm@12.8.1'), true);
  assert.equal(pnpmVersionMatches('12.8.0', 'pnpm@12.8.1'), false);
});

test('parses listening ports and pids from Windows netstat output', () => {
  const output = [
    '  TCP    0.0.0.0:3000     0.0.0.0:0     LISTENING       1234',
    '  TCP    [::]:8093        [::]:0        LISTENING       99',
    '  TCP    127.0.0.1:4000   127.0.0.1:50  ESTABLISHED     22',
  ].join('\n');
  assert.deepEqual(
    parseWindowsPorts(output),
    new Map([
      [3000, new Set([1234])],
      [8093, new Set([99])],
    ]),
  );
});

test('parses listening ports and pids from Unix lsof output', () => {
  const output = [
    'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME',
    'node 321 dev 20u IPv6 0t0 TCP *:3000 (LISTEN)',
    'redis 44 dev 9u IPv4 0t0 TCP 127.0.0.1:6379 (LISTEN)',
  ].join('\n');
  assert.deepEqual(
    parseUnixPorts(output),
    new Map([
      [3000, new Set([321])],
      [6379, new Set([44])],
    ]),
  );
});

test('compares environment names without exposing values', () => {
  const example = '# comment\nA=example\nB=\nC=value=with=equals\n';
  const local = 'A=secret\nC=another-secret\nEXTRA=ignored\n';
  assert.deepEqual(compareEnvNames(example, local), { expected: ['A', 'B', 'C'], missing: ['B'] });
});
