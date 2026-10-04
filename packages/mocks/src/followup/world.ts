/**
 * The "world" the follow-up module works on: the centre, its follow-up groups (with their weekly
 * schedule), students, guardians and staff.
 *
 * - Demo mode builds it from the `demo-followup` fixtures (one group, Al Nour, sample names).
 * - Pilot mode (`LINK_MODE=pilot`, docs/13 pilot decision) stores it in the persisted state: groups,
 *   pseudonymised students and guardian labels come from `pnpm pilot:import roster.csv`, and staff
 *   are created by the owner (A16). No phone numbers or national IDs are ever part of it.
 */
import type { L } from '../data';
import * as mfx from '../data';
import { sessionsOf as marketplaceSessions } from '../db';
import { addDays, cairoToUtc, cairoToday, isoWeekday } from '../time';
import * as fx from './data';

export type StaffRole = 'owner' | 'reception' | 'teacher';

export interface WorldGroup {
  id: string;
  name: L;
  /** Subject word used in the demo message templates ("رياضيات"); null in pilot mode. */
  subject: L | null;
  teacherUserId: string;
  /** ISO weekdays (1 = Monday … 7 = Sunday) and Cairo wall-clock times. */
  weekdays: number[];
  startTime: string;
  endTime: string;
}
export interface WorldStudent {
  id: string;
  name: L;
  /** Only for Arabic grammar in demo drafts; null when unknown (pilot), so copy stays gender-neutral. */
  gender: 'f' | 'm' | null;
  guardianId: string;
}
export interface WorldGuardian {
  id: string;
  /** A name in the demo; a label such as "ولي أمر ١" in the pilot. */
  name: L;
  /** E.164, or null (always null in the pilot: the centre keeps the phone numbers). */
  phone: string | null;
  whatsappOptIn: boolean;
  smsConsent: boolean;
  stopped: boolean;
  /** Parent user id (demo P09 feed). */
  userId?: string;
  /** The demo's shared "guardian on file". */
  generic?: boolean;
}
export interface WorldUser {
  id: string;
  name: L;
  role: StaffRole;
  /** Role label shown next to the name (A03 assignee, A16). */
  title: L;
  active: boolean;
}
export interface WorldData {
  kind: 'demo' | 'pilot';
  centre: { id: string; name: L };
  groups: WorldGroup[];
  members: { groupId: string; studentId: string }[];
  students: WorldStudent[];
  guardians: WorldGuardian[];
  users: WorldUser[];
  /** First day a session counts as scheduled (pilot start); null = no lower bound (demo). */
  startDate: string | null;
}

export interface Session {
  id: string;
  groupId: string;
  date: string;
  startsAt: string;
  endsAt: string;
}

const roleOf = (r: (typeof mfx.staff)[number]['role']): StaffRole =>
  r === 'centre_owner' ? 'owner' : r === 'centre_staff' ? 'reception' : 'teacher';

/** The demo scenario as a world (docs/14 §5.1). */
export function demoWorld(): WorldData {
  const mg = mfx.groups.find((g) => g.id === fx.DEMO_GROUP_ID)!;
  return {
    kind: 'demo',
    centre: { id: fx.DEMO_CENTRE_ID, name: { en: 'Al Nour Centre', ar: 'مركز النور' } },
    groups: [
      {
        id: fx.DEMO_GROUP_ID,
        name: fx.groupName,
        subject: { en: 'Maths', ar: 'رياضيات' },
        teacherUserId: fx.DEMO_TEACHER_USER,
        weekdays: mg.weekdays,
        startTime: mg.startTime,
        endTime: mg.endTime,
      },
    ],
    members: fx.roster.map((s) => ({ groupId: fx.DEMO_GROUP_ID, studentId: s.id })),
    students: fx.roster.map((s) => ({
      id: s.id,
      name: s.name,
      gender: s.gender,
      guardianId: s.guardianId,
    })),
    guardians: [...fx.guardians, { ...fx.genericGuardian, generic: true }],
    users: mfx.staff.map((u) => ({
      id: u.id,
      name: u.name,
      role: roleOf(u.role),
      title: u.title,
      active: true,
    })),
    startDate: null,
  };
}

/** Pilot groups: the weekly schedule from the import, from the pilot's first day to 9 weeks ahead. */
function scheduledSessions(w: WorldData, g: WorldGroup): Session[] {
  const today = cairoToday();
  const from = w.startDate ?? addDays(today, -35);
  const out: Session[] = [];
  for (let date = from; date <= addDays(today, 63); date = addDays(date, 1))
    if (g.weekdays.includes(isoWeekday(date)))
      out.push({
        id: `${g.id}~${date}`,
        groupId: g.id,
        date,
        startsAt: cairoToUtc(date, g.startTime),
        endsAt: cairoToUtc(date, g.endTime),
      });
  return out;
}

/** Every scheduled session of a follow-up group (past and upcoming), oldest first. */
export function sessionsOfGroup(w: WorldData, groupId: string): Session[] {
  const g = w.groups.find((x) => x.id === groupId);
  if (!g) return [];
  if (w.kind === 'demo')
    // The demo group shares its calendar with the marketplace fixtures (same ids as Batch 1–5).
    return marketplaceSessions(groupId).map((s) => ({ ...s, groupId }));
  return scheduledSessions(w, g);
}
