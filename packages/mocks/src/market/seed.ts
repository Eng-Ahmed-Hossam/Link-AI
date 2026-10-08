/**
 * The marketplace part of the mock database (kept in `../db.ts` State, so it is saved and reset
 * with everything else). This file only builds the starting state from fixtures: no db import.
 */
import type {
  AutoApproveRules,
  CentreApplicationBody,
  GroupPatch,
  RequestStage,
  TeacherSelfPatch,
} from '@link/api-client';
import * as fx from '../data';
import { addDays, cairoToUtc } from '../time';
import * as mfx from './data';

export interface HallRow {
  id: string;
  centreId: string;
  name: fx.L;
  roomLabel: string;
  capacity: number;
  facilities: mfx.HallFx['facilities'];
  rule: mfx.HallFx['rule'];
  listed: boolean;
  closed: string[];
  photo: number;
}
export interface RequestRow {
  id: string;
  hallId: string;
  teacherKey: string;
  subjectId: string;
  schoolYearId: string;
  weekdays: number[];
  start: string;
  end: string;
  expectedStudents: number;
  startsOn: string;
  stage: RequestStage;
  stageAt: string | null;
  createdAt: string;
  declinedReason: string | null;
  bookingId: string | null;
}
export interface BookingRow {
  id: string;
  hallId: string;
  teacherKey: string;
  weekdays: number[];
  start: string;
  end: string;
  startsOn: string;
  groupId: string | null;
  requestId: string | null;
}
export interface MarketState {
  halls: HallRow[];
  requests: RequestRow[];
  bookings: BookingRow[];
  autoApprove: Record<string, AutoApproveRules>;
  /** Paid extras per centre (OD-58: Follow-up on in the demo for Al Nour). */
  features: Record<string, { followupExtra: boolean }>;
  groupEdits: Record<string, GroupPatch & { listed?: boolean }>;
  newGroups: fx.GroupFx[];
  replies: Record<string, { body: string; at: string }>;
  reports: Record<string, { reason: string; at: string }>;
  centreEdits: Record<
    string,
    {
      about?: string;
      photos?: number;
      /** CF-44: a moved pin, under review until Link ops verify it. */
      location?: { lat: number; lng: number; address: string; underReview: boolean };
    }
  >;
  teacherEdits: Record<string, TeacherSelfPatch>;
  decisions: Record<string, 'accepted' | 'declined'>;
  applications: (CentreApplicationBody & { id: string; at: string })[];
  seq: number;
}

/** Auto-approve is off by default (MKT-HAL-05); the rules are Figma C05's. */
export const AUTO_APPROVE_DEFAULT: AutoApproveRules = {
  enabled: false,
  verifiedId: true,
  minRating: 4.5,
  fitsCapacity: true,
};

/** A fixture group's hall: same centre, same room label. */
export const hallOfGroup = (halls: HallRow[], g: fx.GroupFx) =>
  halls.find((h) => h.centreId === g.centreId && h.roomLabel === g.room.en) ?? null;

export function seedMarket(today: string): MarketState {
  const halls: HallRow[] = mfx.halls.map((h) => ({ ...h, closed: [...h.closed] }));
  const bookings: BookingRow[] = [];
  for (const g of fx.groups) {
    const h = hallOfGroup(halls, g);
    if (!h) continue;
    bookings.push({
      id: `bk-${g.id}`,
      hallId: h.id,
      teacherKey: g.teacherId,
      weekdays: [...g.weekdays],
      start: g.startTime,
      end: g.endTime,
      startsOn: addDays(today, -35),
      groupId: g.id,
      requestId: null,
    });
  }
  const requests: RequestRow[] = mfx.requests.map((r) => {
    const startsOn = addDays(today, r.startsInDays);
    let bookingId: string | null = null;
    if (r.stage === 'approved') {
      bookingId = `bk-${r.id}`;
      bookings.push({
        id: bookingId,
        hallId: r.hallId,
        teacherKey: r.teacherKey,
        weekdays: [...r.weekdays],
        start: r.start,
        end: r.end,
        startsOn,
        groupId: null,
        requestId: r.id,
      });
    }
    return {
      id: r.id,
      hallId: r.hallId,
      teacherKey: r.teacherKey,
      subjectId: r.subjectId,
      schoolYearId: r.schoolYearId,
      weekdays: [...r.weekdays],
      start: r.start,
      end: r.end,
      expectedStudents: r.expectedStudents,
      startsOn,
      stage: r.stage,
      stageAt: r.stageAt ? cairoToUtc(addDays(today, r.stageAt.inDays), r.stageAt.time) : null,
      createdAt: cairoToUtc(addDays(today, -r.createdDaysAgo), '10:00'),
      declinedReason: null,
      bookingId,
    };
  });
  return {
    halls,
    requests,
    bookings,
    autoApprove: Object.fromEntries(fx.centres.map((c) => [c.id, { ...AUTO_APPROVE_DEFAULT }])),
    features: Object.fromEntries(
      fx.centres.map((c) => [c.id, { followupExtra: c.id === 'cen-nour' }]),
    ),
    groupEdits: {},
    newGroups: [],
    replies: {},
    reports: {},
    centreEdits: {},
    teacherEdits: {},
    decisions: {},
    applications: [],
    seq: 100,
  };
}
