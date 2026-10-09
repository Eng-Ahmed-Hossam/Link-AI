import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { sql } from 'kysely';
import { formatClock, formatWeekdays } from '@link/i18n';
import { routes } from '../contract/routes';
import { writeAudit } from '../platform/audit';
import { Database, type RlsContext, type Tx } from '../platform/db';
import { Caller, Endpoint, type In, Input, type Principal } from '../platform/http';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { requestIdOf } from '../platform/request-context';
import { type Lang, hhmm, money, ratingOf, sessionTimes, subjectForYear } from './model';
import type { Seats } from '../enrolment/seats';

const teacherOf = (ctx: RlsContext) => {
  if (!ctx.teacherId) throw forbidden('Teachers only.');
  return ctx.teacherId;
};

/** Fees: at least EGP 1 (whole piasters). */
function checkFees(...fees: (number | undefined)[]) {
  for (const v of fees)
    if (v !== undefined && (!Number.isInteger(v) || v < 100 || v > 10_000_000))
      throw new Problem(422, 'invalid_fee', 'Fees must be at least EGP 1.');
}

/**
 * Decided 2026-10-09: a teacher is visible to parents only when the profile is `active` — an
 * accepted invite (if any), a name and at least one subject. Re-checked after every change.
 */
export async function refreshProfileStatus(tx: Tx, teacherId: string) {
  const t = await tx
    .selectFrom('org.teachers')
    .select(['profile_status', 'display_name'])
    .where('id', '=', teacherId)
    .executeTakeFirstOrThrow();
  if (t.profile_status === 'invited') return 'invited' as const;
  const subjects = await tx
    .selectFrom('org.teacher_subjects')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('teacher_id', '=', teacherId)
    .executeTakeFirstOrThrow();
  const next = t.display_name.trim() && subjects.n > 0 ? 'active' : 'incomplete';
  if (next !== t.profile_status)
    await tx
      .updateTable('org.teachers')
      .set({ profile_status: next })
      .where('id', '=', teacherId)
      .execute();
  return next;
}

/** Teacher profile (J04), groups (J05, My groups) and centre invitations. */
export class Groups {
  constructor(
    private readonly db: Database,
    private readonly seats: Seats,
  ) {}

  self(userId: string, lang: Lang) {
    return this.db.asUser(userId, (tx, ctx) => this.selfIn(tx, teacherOf(ctx), lang));
  }

  private async selfIn(tx: Tx, teacherId: string, lang: Lang) {
    const t = await tx
      .selectFrom('org.teachers')
      .selectAll()
      .where('id', '=', teacherId)
      .executeTakeFirstOrThrow();
    const stats = await tx
      .selectFrom('market.review_stats')
      .select('distribution')
      .where('target_type', '=', 'teacher')
      .where('target_id', '=', teacherId)
      .executeTakeFirst();
    const r = ratingOf(stats?.distribution);
    const subjects = await tx
      .selectFrom('org.teacher_subjects as ts')
      .innerJoin('ref.subjects as s', 's.id', 'ts.subject_id')
      .innerJoin('ref.school_years as y', 'y.id', 's.school_year_id')
      .select(['s.name_en', 's.name_ar', 'y.short_name_en', 'y.short_name_ar', 'y.position'])
      .where('ts.teacher_id', '=', teacherId)
      .orderBy('y.position')
      .execute();
    const bySubject = new Map<string, string[]>();
    for (const s of subjects) {
      const name = lang === 'ar' ? s.name_ar : s.name_en;
      const year = (lang === 'ar' ? s.short_name_ar : s.short_name_en) ?? '';
      bySubject.set(name, [...new Set([...(bySubject.get(name) ?? []), year])]);
    }
    // The teacher reads the status of their own checks (never notes or evidence, 06 §3).
    const checks = await this.db.asSystem((sys) =>
      sys
        .selectFrom('org.verification_checks')
        .select(['check_code', 'status'])
        .where('subject_type', '=', 'teacher')
        .where('subject_id', '=', teacherId)
        .execute(),
    );
    const degree = checks.find((c) => c.check_code === 'degree');
    const groups = await this.teacherGroupsIn(tx, teacherId, lang);
    const settings = t.settings as { reviewEachEnrolment?: boolean };
    return {
      id: t.id,
      name: t.display_name,
      subjects: [...bySubject]
        .map(([n, ys]) => `${n} • ${ys.join(lang === 'ar' ? '، ' : ', ')}`)
        .join(' · '),
      yearsExperience: t.years_experience ?? 0,
      rating: r.avg,
      reviewCount: r.count,
      openToSlots: t.open_to_slots,
      about: (lang === 'ar' ? t.bio_ar : t.bio_en) ?? t.bio_ar ?? t.bio_en ?? '',
      verification: {
        nationalId:
          t.verification === 'verified'
            ? 'verified'
            : t.verification === 'pending'
              ? 'pending'
              : 'missing',
        degree: degree?.status === 'done' ? 'verified' : degree ? 'pending' : 'missing',
        references: {
          added: checks.filter((c) => c.check_code === 'reference' && c.status === 'done').length,
          needed: 2,
        },
      } as const,
      // A new profile's column default is `{}`: no availability set yet.
      availability: Array.isArray(t.availability)
        ? (t.availability as { weekday: number; am: boolean; pm: boolean }[])
        : [],
      reviewEachEnrolment: settings.reviewEachEnrolment ?? false,
      // Payout accounts arrive with the ledger (R2b).
      payoutAccount: '••••',
      teaches: groups.map((g) => ({
        groupId: g.id,
        subjectId: g.subjectId,
        schoolYearId: g.schoolYearId,
        label: g.name,
        where: g.where,
        students: g.seatsFilled,
        monthlyFee: g.monthlyFee,
      })),
      profileStatus: t.profile_status as 'invited' | 'incomplete' | 'active',
    };
  }

  patchSelf(
    userId: string,
    p: {
      displayName?: string;
      subjectIds?: string[];
      about?: string;
      openToSlots?: boolean;
      availability?: { weekday: number; am: boolean; pm: boolean }[];
      reviewEachEnrolment?: boolean;
    },
    lang: Lang,
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const teacherId = teacherOf(ctx);
      const set: Record<string, unknown> = {};
      if (p.displayName !== undefined) set.display_name = p.displayName;
      if (p.about !== undefined) set[lang === 'ar' ? 'bio_ar' : 'bio_en'] = p.about;
      if (p.openToSlots !== undefined) set.open_to_slots = p.openToSlots;
      if (p.availability) set.availability = JSON.stringify(p.availability);
      if (p.reviewEachEnrolment !== undefined)
        set.settings = sql`jsonb_set(settings, '{reviewEachEnrolment}', ${JSON.stringify(p.reviewEachEnrolment)}::jsonb)`;
      if (Object.keys(set).length)
        await tx.updateTable('org.teachers').set(set).where('id', '=', teacherId).execute();
      if (p.subjectIds) {
        const known = p.subjectIds.length
          ? await tx
              .selectFrom('ref.subjects')
              .select('id')
              .where('id', 'in', p.subjectIds)
              .execute()
          : [];
        if (known.length !== new Set(p.subjectIds).size)
          throw new Problem(422, 'validation_failed', 'Unknown subject.', {
            errors: [{ field: 'subjectIds', code: 'unknown' }],
          });
        await tx.deleteFrom('org.teacher_subjects').where('teacher_id', '=', teacherId).execute();
        if (known.length)
          await tx
            .insertInto('org.teacher_subjects')
            .values(known.map((s) => ({ teacher_id: teacherId, subject_id: s.id })))
            .execute();
      }
      const status = await refreshProfileStatus(tx, teacherId);
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: 'teacher.profile_updated',
        objectType: 'teacher',
        objectRef: teacherId,
        after: { fields: Object.keys(p), profileStatus: status },
        requestId,
      });
      return this.selfIn(tx, teacherId, lang);
    });
  }

  /** "My groups" (CF-30): fees, seats filled in the next session, where it meets. */
  teacherGroups(userId: string, lang: Lang) {
    return this.db.asUser(userId, async (tx, ctx) =>
      (await this.teacherGroupsIn(tx, teacherOf(ctx), lang)).map((g) => ({
        id: g.id,
        name: g.name,
        centre: g.centre,
        room: g.room,
        weekdays: g.weekdays,
        startTime: g.startTime,
        endTime: g.endTime,
        sessionFee: g.sessionFee,
        monthlyFee: g.monthlyFee,
        offersMonthlyRecurring: g.offersMonthlyRecurring,
        seatCap: g.seatCap,
        seatsFilled: g.seatsFilled,
        nextSession: g.nextSession,
        // The follow-up parts (records complete, open follow-ups) arrive with R3.
        followup: null,
      })),
    );
  }

  private async teacherGroupsIn(tx: Tx, teacherId: string, lang: Lang) {
    const rows = await tx
      .selectFrom('market.groups as g')
      .innerJoin('market.room_bookings as b', 'b.id', 'g.room_booking_id')
      .innerJoin('market.rooms_seen_by_teacher as r', 'r.id', 'b.room_id')
      .innerJoin('market.centres_seen_by_teacher as c', 'c.id', 'g.centre_id')
      .innerJoin('ref.subjects as s', 's.id', 'g.subject_id')
      .innerJoin('ref.school_years as y', 'y.id', 'g.school_year_id')
      .select([
        'g.id',
        'g.subject_id',
        'g.school_year_id',
        'g.weekdays',
        sql<string>`g.start_time::text`.as('start_time'),
        sql<string>`g.end_time::text`.as('end_time'),
        'g.seat_cap',
        'g.monthly_fee_pt',
        'g.session_fee_pt',
        'g.offers_monthly_recurring',
        'c.id as centre_id',
        'c.name as centre_name',
        'r.name as room_name',
        's.name_en',
        's.name_ar',
        'y.short_name_en',
        'y.short_name_ar',
        sql<{ id: string; starts_at: Date } | null>`(
          SELECT json_build_object('id', gs.id, 'starts_at', gs.starts_at) FROM market.group_sessions gs
          WHERE gs.group_id = g.id AND gs.starts_at > now() AND gs.status = 'scheduled'
          ORDER BY gs.starts_at LIMIT 1)`.as('next_session'),
      ])
      .where('g.teacher_id', '=', teacherId)
      .where('g.status', '<>', 'closed')
      .orderBy('g.created_at')
      .execute();
    const filled = await this.seats.filledNext(
      tx,
      rows.map((r) => r.id),
    );
    return rows.map((r) => {
      const name = `${lang === 'ar' ? r.name_ar : r.name_en} • ${(lang === 'ar' ? r.short_name_ar : r.short_name_en) ?? ''}`;
      return {
        id: r.id,
        name,
        subjectId: r.subject_id,
        schoolYearId: r.school_year_id,
        centre: { id: r.centre_id!, displayName: r.centre_name! },
        room: r.room_name!,
        weekdays: r.weekdays,
        startTime: hhmm(r.start_time),
        endTime: hhmm(r.end_time),
        sessionFee: money(Number(r.session_fee_pt)),
        monthlyFee: money(Number(r.monthly_fee_pt)),
        offersMonthlyRecurring: r.offers_monthly_recurring,
        seatCap: r.seat_cap,
        seatsFilled: filled.get(r.id) ?? 0,
        nextSession: r.next_session
          ? { id: r.next_session.id, startsAt: new Date(r.next_session.starts_at).toISOString() }
          : null,
        where: `${r.centre_name} • ${r.room_name} • ${formatWeekdays(r.weekdays, lang)} ${formatClock(hhmm(r.start_time), lang)}`,
      };
    });
  }

  /** J05 "New group" in a booked slot (MKT-GRP-01, CF-05): seats never above the hall. */
  create(
    userId: string,
    b: {
      bookingId: string;
      subjectId: string;
      schoolYearId: string;
      monthlyFeePt: number;
      sessionFeePt: number;
      seatCap: number;
      offersMonthlyRecurring: boolean;
    },
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const teacherId = teacherOf(ctx);
      const bk = await tx
        .selectFrom('market.room_bookings as b')
        .innerJoin('market.rooms_seen_by_teacher as r', 'r.id', 'b.room_id')
        .select([
          'b.id',
          'b.centre_id',
          'b.teacher_id',
          'b.weekly_slots',
          'b.status',
          sql<string>`b.starts_on::text`.as('starts_on'),
          'r.capacity',
        ])
        .where('b.id', '=', b.bookingId)
        .executeTakeFirst();
      if (!bk || bk.teacher_id !== teacherId || bk.status === 'ended') throw notFound('booking');
      const has = await tx
        .selectFrom('market.groups')
        .select('id')
        .where('room_booking_id', '=', bk.id)
        .executeTakeFirst();
      if (has) throw new Problem(409, 'booking_has_group', 'This slot already has a group.');
      checkFees(b.monthlyFeePt, b.sessionFeePt);
      if (!Number.isInteger(b.seatCap) || b.seatCap < 1)
        throw new Problem(422, 'invalid_seats', 'Seats: a whole number.');
      if (b.seatCap > bk.capacity!)
        throw new Problem(422, 'seat_cap_above_hall', `The hall has ${bk.capacity} seats.`, {
          capacity: bk.capacity,
        });
      const subject = await subjectForYear(tx, b.subjectId, b.schoolYearId);
      const slots = bk.weekly_slots as { weekday: number; start: string; end: string }[];
      const id = uuidv7();
      const group = {
        weekdays: slots.map((s) => s.weekday),
        startTime: slots[0]!.start,
        endTime: slots[0]!.end,
        startsOn: bk.starts_on,
      };
      await tx
        .insertInto('market.groups')
        .values({
          id,
          teacher_id: teacherId,
          centre_id: bk.centre_id,
          room_booking_id: bk.id,
          subject_id: subject.id,
          curriculum_id: subject.curriculum_id,
          school_year_id: subject.school_year_id,
          weekdays: group.weekdays,
          start_time: group.startTime,
          end_time: group.endTime,
          seat_cap: b.seatCap,
          monthly_fee_pt: b.monthlyFeePt,
          session_fee_pt: b.sessionFeePt,
          offers_monthly_recurring: b.offersMonthlyRecurring,
          starts_on: group.startsOn,
        })
        .execute();
      // Sessions from the slot (MKT-GRP-01), from the booking's first day.
      const sessions = sessionTimes(group);
      if (sessions.length)
        await tx
          .insertInto('market.group_sessions')
          .values(
            sessions.map((s) => ({
              id: uuidv7(),
              group_id: id,
              centre_id: bk.centre_id,
              starts_at: s.startsAt,
              ends_at: s.endsAt,
            })),
          )
          .execute();
      await tx
        .insertInto('org.teacher_subjects')
        .values({ teacher_id: teacherId, subject_id: subject.id })
        .onConflict((oc) => oc.doNothing())
        .execute();
      await refreshProfileStatus(tx, teacherId);
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: bk.centre_id,
        action: 'group.created',
        objectType: 'group',
        objectRef: id,
        after: { seatCap: b.seatCap, monthlyFeePt: b.monthlyFeePt, sessionFeePt: b.sessionFeePt },
        requestId,
      });
      await enqueue(tx, {
        type: 'group.published',
        aggregateType: 'group',
        aggregateId: id,
        centreId: bk.centre_id,
        data: { groupId: id, teacherId, centreId: bk.centre_id },
        requestId,
      });
      return { id };
    });
  }

  /** J05 (MKT-GRP-02): seats ≤ the hall and ≥ the seats taken; fees at least EGP 1. */
  patch(
    userId: string,
    groupId: string,
    p: {
      monthlyFeePt?: number;
      sessionFeePt?: number;
      seatCap?: number;
      offersMonthlyRecurring?: boolean;
    },
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const teacherId = teacherOf(ctx);
      const g = await tx
        .selectFrom('market.groups as g')
        .innerJoin('market.room_bookings as b', 'b.id', 'g.room_booking_id')
        .innerJoin('market.rooms_seen_by_teacher as r', 'r.id', 'b.room_id')
        .select(['g.id', 'g.centre_id', 'g.teacher_id', 'r.capacity'])
        .where('g.id', '=', groupId)
        .executeTakeFirst();
      if (!g || g.teacher_id !== teacherId) throw notFound('group');
      checkFees(p.monthlyFeePt, p.sessionFeePt);
      if (p.seatCap !== undefined) {
        if (!Number.isInteger(p.seatCap) || p.seatCap < 1)
          throw new Problem(422, 'invalid_seats', 'Seats: a whole number.');
        if (p.seatCap > g.capacity!)
          throw new Problem(422, 'seat_cap_above_hall', `The hall has ${g.capacity} seats.`, {
            capacity: g.capacity,
          });
        const filled = (await this.seats.filledNext(tx, [groupId])).get(groupId) ?? 0;
        if (p.seatCap < filled)
          throw new Problem(409, 'seat_cap_below_filled', `${filled} seats are already taken.`);
      }
      const set: Record<string, unknown> = {};
      if (p.monthlyFeePt !== undefined) set.monthly_fee_pt = p.monthlyFeePt;
      if (p.sessionFeePt !== undefined) set.session_fee_pt = p.sessionFeePt;
      if (p.seatCap !== undefined) set.seat_cap = p.seatCap;
      if (p.offersMonthlyRecurring !== undefined)
        set.offers_monthly_recurring = p.offersMonthlyRecurring;
      if (Object.keys(set).length)
        await tx.updateTable('market.groups').set(set).where('id', '=', groupId).execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: g.centre_id,
        action: 'group.updated',
        objectType: 'group',
        objectRef: groupId,
        after: p,
        requestId,
      });
      return { ok: true as const };
    });
  }

  /** Invitations waiting for an answer (teacher invites need one, decided 2026-10-09). */
  invites(userId: string) {
    return this.db.asUser(userId, async () => listInvites(this.db, userId));
  }

  /** Accept: the role becomes active; the profile leaves `invited` (then shows once complete). */
  accept(userId: string, inviteId: string, requestId?: string) {
    return this.db.asSystem(async (sys) => {
      const ra = await sys
        .selectFrom('identity.role_assignments')
        .select(['id', 'user_id', 'role', 'centre_id', 'teacher_id', 'status'])
        .where('id', '=', inviteId)
        .executeTakeFirst();
      if (!ra || ra.user_id !== userId) throw notFound('invitation');
      if (ra.status === 'invited') {
        await sys
          .updateTable('identity.role_assignments')
          .set({ status: 'active' })
          .where('id', '=', ra.id)
          .execute();
        if (ra.teacher_id) {
          await sys
            .updateTable('org.teachers')
            .set({ profile_status: 'incomplete' })
            .where('id', '=', ra.teacher_id)
            .where('profile_status', '=', 'invited')
            .execute();
          await refreshProfileStatus(sys, ra.teacher_id);
        }
        await writeAudit(sys, {
          actorId: userId,
          actorType: 'user',
          centreId: ra.centre_id,
          action: 'access.invite_accepted',
          objectType: 'role_assignment',
          objectRef: ra.id,
          after: { role: ra.role, status: 'active' },
          requestId,
        });
      }
      return listInvites(this.db, userId, sys);
    });
  }
}

async function listInvites(db: Database, userId: string, sys?: Tx) {
  const run = (tx: Tx) =>
    tx
      .selectFrom('identity.role_assignments as ra')
      .innerJoin('org.centres as c', 'c.id', 'ra.centre_id')
      .select(['ra.id', 'ra.role', 'ra.created_at', 'c.id as centre_id', 'c.name'])
      .where('ra.user_id', '=', userId)
      .where('ra.status', '=', 'invited')
      .orderBy('ra.created_at')
      .execute();
  const rows = sys ? await run(sys) : await db.asSystem(run);
  return rows.map((r) => ({
    id: r.id,
    centre: { id: r.centre_id, name: r.name },
    role: (r.role === 'teacher' ? 'teacher' : 'reception') as 'teacher' | 'reception',
    invitedAt: new Date(r.created_at).toISOString(),
  }));
}

@Controller()
export class GroupsController {
  constructor(@Inject(Groups) private readonly groups: Groups) {}

  @Endpoint(routes.teacherSelf)
  self(@Caller() p: Principal) {
    return this.groups.self(p.userId, p.lang);
  }

  @Endpoint(routes.patchTeacherSelf)
  patchSelf(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.patchTeacherSelf>,
    @Req() req: Request,
  ) {
    return this.groups.patchSelf(p.userId, i.body, p.lang, requestIdOf(req));
  }

  @Endpoint(routes.teacherGroups)
  mine(@Caller() p: Principal) {
    return this.groups.teacherGroups(p.userId, p.lang);
  }

  @Endpoint(routes.createGroup)
  create(@Caller() p: Principal, @Input() i: In<typeof routes.createGroup>, @Req() req: Request) {
    return this.groups.create(p.userId, i.body, requestIdOf(req));
  }

  @Endpoint(routes.patchGroup)
  patch(@Caller() p: Principal, @Input() i: In<typeof routes.patchGroup>, @Req() req: Request) {
    return this.groups.patch(p.userId, i.params.id, i.body, requestIdOf(req));
  }

  @Endpoint(routes.myInvites)
  invites(@Caller() p: Principal) {
    return this.groups.invites(p.userId);
  }

  @Endpoint(routes.acceptInvite)
  accept(@Caller() p: Principal, @Input() i: In<typeof routes.acceptInvite>, @Req() req: Request) {
    return this.groups.accept(p.userId, i.params.id, requestIdOf(req));
  }
}
