// 4.3 the practice centre: separate from the real pilot data, never measured, never voice, and
// pilot:practice-wipe deletes only a folder marked as practice.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pilotConfig } from '../src/config';
import { computeMetrics } from '../src/metrics';
import {
  assertSeparate,
  isPractice,
  markPractice,
  practiceDirFor,
  wipePractice,
} from '../src/practice';
import { readLog } from '../src/store';
import { openApp, seedPilot, tempDir } from './helpers';

describe('4.3 practice centre', () => {
  it('lives next to the real data, never inside it or the same folder', () => {
    const real = join(tempDir(), 'LinkPilot', 'data');
    expect(practiceDirFor(real)).toBe(`${real}-practice`);
    expect(() => assertSeparate(real, real)).toThrow(/separate/);
    expect(() => assertSeparate(real, join(real, 'practice'))).toThrow(/separate/);
    expect(() => assertSeparate(join(real, 'x'), real)).toThrow(/separate/);
    expect(() => assertSeparate(real, `${real}-practice`)).not.toThrow();
  });

  it('pilot:practice-wipe refuses the real data and deletes only a marked practice folder', () => {
    const real = tempDir();
    seedPilot(real);
    expect(() => wipePractice(real)).toThrow(/not a practice centre/);
    expect(existsSync(join(real, 'state.json'))).toBe(true); // untouched
    const practice = `${real}-practice`;
    markPractice(practice);
    seedPilot(practice);
    expect(isPractice(practice)).toBe(true);
    expect(wipePractice(practice)).toBe(true);
    expect(existsSync(practice)).toBe(false);
    expect(wipePractice(practice)).toBe(false); // already gone: nothing to do
  });

  it('practice activity never reaches the real data or its metrics; voice is never on', async () => {
    const real = tempDir();
    const pins = seedPilot(real);
    const log = () =>
      existsSync(join(real, 'activity.jsonl'))
        ? readFileSync(join(real, 'activity.jsonl'), 'utf8')
        : '';
    const before = log();
    const realApp = openApp(real);
    const metricsBefore = computeMetrics(readLog(real), realApp.store.snap!.fu.world!);
    realApp.store.close();

    const practice = `${real}-practice`;
    markPractice(practice);
    const ppins = seedPilot(practice);
    const p = openApp(practice, { PILOT_VOICE: '1', AI_SERVICE_TOKEN: 't' });
    expect(p.cfg.voice).toBe(false); // staff voices would be real audio: never in practice
    const owner = await p.signIn('usr-p001', ppins['usr-p001']!);
    const add = await p.call('POST', '/v1/pilot/users', {
      cookie: owner,
      body: { name: 'متدرّب', role: 'reception' },
    });
    expect(add.status).toBe(201);
    p.store.close();

    expect(log()).toBe(before);
    const again = openApp(real);
    const after = {
      ...computeMetrics(readLog(real), again.store.snap!.fu.world!),
      generatedAt: '',
    };
    const baseline = { ...metricsBefore, generatedAt: '' };
    expect(after).toEqual(baseline); // identical apart from when it was computed
    expect(again.store.snap!.fu.world!.users.some((u) => u.name.ar === 'متدرّب')).toBe(false);
    again.store.close();
    expect(pins['usr-p001']).toBeTruthy();
    // The real configuration still allows voice when asked; only the practice folder blocks it.
    expect(pilotConfig({ PILOT_DATA_DIR: real, PILOT_VOICE: '1' } as NodeJS.ProcessEnv).voice).toBe(
      true,
    );
  });
});
