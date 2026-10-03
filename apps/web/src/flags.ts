/** Local feature flags (no backend yet). Phase 2–3 items stay off (OD-48, 11 inventory). */
export const flags = {
  /** Owner navigation for follow-up: Today, Follow-ups, Students, Sessions, Parent communication, Rules, Activity history. */
  followUpNav: false,
  /** P09 "Updates from the centre" feed. */
  parentUpdatesFeed: false,
  /** P05 "% recorded" badge. */
  teacherRecordedBadge: false,
  /** Teacher setting `reviewEachEnrolment` (OD-08): off by default. */
  reviewEachEnrolment: false,
} as const;

export type Flags = typeof flags;
