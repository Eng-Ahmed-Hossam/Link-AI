// ANL-STU-01 (docs/03): stars and level are calculated in code, never stored (decided 2026-10-16).
import { describe, expect, it } from 'vitest';
import { levelOf, STARS, starsOf, subjectProgress } from '../../src/students/progress';

describe('ANL-STU-01 stars and level', () => {
  it('stars per topic: mastered 3, improving 2, needs practice 1; not taught yet or under 2 quizzes 0', () => {
    expect(starsOf('mastered')).toBe(3);
    expect(starsOf('improving')).toBe(2);
    expect(starsOf('needs_practice')).toBe(1);
    expect(starsOf('not_enough_data')).toBe(0);
    expect(starsOf('not_taught_yet')).toBe(0);
    expect(Object.keys(STARS)).toHaveLength(5);
  });

  it('level per subject: 1 + floor(stars ÷ 10)', () => {
    expect([0, 9, 10, 19, 20, 27].map(levelOf)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('a subject with 1 quiz on a topic gets 0 stars for it; the sum makes the level', () => {
    expect(subjectProgress(['not_enough_data'])).toEqual({ stars: 0, level: 1 });
    expect(
      subjectProgress([
        'mastered',
        'mastered',
        'mastered',
        'improving',
        'needs_practice',
        'not_taught_yet',
      ]),
    ).toEqual({ stars: 12, level: 2 });
  });
});
