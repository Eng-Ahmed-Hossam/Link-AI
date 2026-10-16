/**
 * ANL-STU-01 (docs/03; decided 2026-10-16): stars and level, calculated in code from the live topic
 * bands, never stored. The band itself comes from analytics.student_topic_scores — the one view
 * every role reads (CF-58).
 *   stars per topic: mastered 3 · improving 2 · needs practice 1 · not enough data / not taught yet 0
 *   level (per subject): 1 + floor(stars ÷ 10)
 * A 0-star topic is "not taught yet" or "not scored yet", never a failure. Only the student's own
 * topics count; nothing compares a student with classmates.
 */
export type Band =
  'mastered' | 'improving' | 'needs_practice' | 'not_enough_data' | 'not_taught_yet';

export const STARS: Record<Band, number> = {
  mastered: 3,
  improving: 2,
  needs_practice: 1,
  not_enough_data: 0,
  not_taught_yet: 0,
};

export const starsOf = (band: Band) => STARS[band];

/** Level of one subject from the stars of its topics. */
export const levelOf = (stars: number) => 1 + Math.floor(stars / 10);

export function subjectProgress(bands: Band[]) {
  const stars = bands.reduce((n, b) => n + starsOf(b), 0);
  return { stars, level: levelOf(stars) };
}
