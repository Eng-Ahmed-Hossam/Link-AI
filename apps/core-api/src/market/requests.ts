import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { sql } from 'kysely';
import { routes } from '../contract/routes';
import { writeAudit } from '../platform/audit';
import { can, Database, isStaffOf, type RlsContext, type Tx } from '../platform/db';
import { Caller, Endpoint, type In, Input, type Principal } from '../platform/http';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { requestIdOf } from '../platform/request-context';
import { autoApproveOf, takenSlots } from './halls';
import {
  DEFAULT_POINT,
  type Lang,
  SLOT_DAYS,
  SLOT_TIMES,
  type StoredRentRule,
  feeOf,
  hhmm,
  money,
  overlaps,
  percentNumber,
  plus2h,
  rateFor,
  ratingOf,
  rentFor,
  ruleDto,
  subjectForYear,
} from './model';

type Stage = 'requested' | 'phone_call' | 'meeting' | 'approved' | 'declined' | 'withdrawn';
type Slot = { weekday: number; start: string; end: string };
/** C06 columns run one way: Requested → Phone call → Meeting → Approved. */
const ORDER: Stage[] = ['requested', 'phone_call', 'meeting', 'approved'];

const teacherOf = (ctx: RlsContext) => {
  if (!ctx.teacherId) throw forbidden('Teachers only.');
  return ctx.teacherId;
};

/** A unique-violation of the no-double-booking exclusion constraint (06 §4). */
const isOverlap = (e: unknown) => (e as { code?: string }).code === '23P01';

/**
 * Room requests and bookings (J01–J03, C06; MKT-HAL-01…05, CF-46). Which rows a caller may see is
 * decided by RLS (asUser); the request cards are then filled in by the system with the public or
 * related details (names, ratings, rules), so both sides read the same card.
 */
export class Requests {
  constructor(private readonly db: Database) {}

  /** J01: listed halls of verified centres with free slots; fitting halls first, then nearest. */
  search(
    userId: string,
    q: { minCapacity?: number; weekday?: string; radiusKm?: number; lat?: number; lng?: number },
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      teacherOf(ctx);
      const lat = q.lat ?? DEFAULT_POINT.lat;
      const lng = q.lng ?? DEFAULT_POINT.lng;
      const days = q.weekday ? q.weekday.split(',').map(Number) : [];
      const rooms = await tx
        .selectFrom('market.public_rooms as r')
        .innerJoin('market.public_centres as c', 'c.id', 'r.centre_id')
        .select([
          'r.id',
          'r.name',
          'r.capacity',
          'r.facilities',
          'r.rent_rule',
          'c.id as centre_id',
          'c.name as centre_name',
          'c.area',
          sql<number>`round((ST_Distance(c.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000)::numeric, 1)::float8`.as(
            'distance_km',
          ),
        ])
        .execute();
      const slots = await tx
        .selectFrom('market.public_room_slots')
        .select([
          'room_id',
          'weekday',
          sql<string>`start_time::text`.as('start'),
          sql<string>`end_time::text`.as('end'),
          'taken',
        ])
        .execute();
      const students = q.minCapacity ?? 0;
      return rooms
        .map((r) => ({
          hall: {
            id: r.id!,
            name: r.name!,
            capacity: r.capacity!,
            facilities: r.facilities as never,
          },
          centre: {
            id: r.centre_id!,
            name: r.centre_name!,
            area: r.area ?? '',
            distanceKm: Number(r.distance_km),
          },
          freeSlots: slots
            .filter(
              (s) =>
                s.room_id === r.id &&
                !s.taken &&
                SLOT_DAYS.includes(s.weekday!) &&
                SLOT_TIMES.includes(hhmm(s.start)) &&
                (!days.length || days.includes(s.weekday!)),
            )
            .sort(
              (a, b) =>
                SLOT_DAYS.indexOf(a.weekday!) - SLOT_DAYS.indexOf(b.weekday!) ||
                a.start.localeCompare(b.start),
            )
            .map((s) => ({ weekday: s.weekday!, start: hhmm(s.start), end: hhmm(s.end) })),
          rentRule: ruleDto(r.rent_rule as StoredRentRule),
          fits: r.capacity! >= students,
        }))
        .filter(
          (r) =>
            r.freeSlots.length && (q.radiusKm === undefined || r.centre.distanceKm <= q.radiusKm),
        )
        .sort(
          (a, b) => Number(b.fits) - Number(a.fits) || a.centre.distanceKm - b.centre.distanceKm,
        );
    });
  }

  /** J02: a pure calculation from the slots, students and fee (BR-BKG-07). */
  estimate(
    userId: string,
    hallId: string,
    b: { slots: Slot[]; students: number; monthlyFeePt: number },
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const teacherId = teacherOf(ctx);
      const h = await tx
        .selectFrom('market.public_rooms')
        .select(['id', 'centre_id', 'capacity', 'rent_rule'])
        .where('id', '=', hallId)
        .executeTakeFirst();
      if (!h) throw notFound('hall');
      const weekdays = b.slots.map((s) => s.weekday);
      const sessions = weekdays.length * 4;
      const fees = Math.max(0, Math.round(b.students)) * Math.max(0, Math.round(b.monthlyFeePt));
      const rent = rentFor(h.rent_rule as StoredRentRule, sessions, b.students, fees);
      const pct = await rateFor(tx, 'booking_commission', { teacherId });
      const commission = feeOf(fees, pct);
      const start = b.slots[0]?.start ?? '14:00';
      const { rules, meets } = await this.db.asSystem(async (sys) => {
        const rules = await autoApproveOf(sys, h.centre_id!);
        const c = await checks(sys, {
          roomId: h.id!,
          centreId: h.centre_id!,
          teacherId,
          slots: weekdays.map((weekday) => ({ weekday, start, end: plus2h(start) })),
          expectedStudents: b.students,
          bookingId: null,
        });
        return { rules, meets: c.meetsRules };
      });
      return {
        sessionsPerMonth: sessions,
        fees: money(fees),
        rent: money(rent),
        commission: money(commission),
        commissionPercent: percentNumber(pct),
        keep: money(fees - rent - commission),
        autoApprove: { enabled: rules.enabled, meets },
      };
    });
  }

  /** J02: a request for free, listed slots of a verified centre's hall. */
  create(
    userId: string,
    b: {
      hallId: string;
      slots: Slot[];
      subjectId: string;
      schoolYearId: string;
      expectedStudents: number;
      startsOn: string;
    },
    lang: Lang,
    requestId?: string,
  ) {
    return this.db
      .asUser(userId, async (tx, ctx) => {
        const teacherId = teacherOf(ctx);
        const h = await tx
          .selectFrom('market.public_rooms')
          .select(['id', 'centre_id', 'capacity'])
          .where('id', '=', b.hallId)
          .executeTakeFirst();
        if (!h) {
          // Not public: say why when the hall exists (a pending centre, or an unlisted hall).
          const why = await this.db.asSystem((sys) =>
            sys
              .selectFrom('market.rooms as r')
              .innerJoin('org.centres as c', 'c.id', 'r.centre_id')
              .select(['r.listed', 'c.verification'])
              .where('r.id', '=', b.hallId)
              .executeTakeFirst(),
          );
          if (why && why.verification !== 'verified')
            throw new Problem(
              409,
              'centre_not_verified',
              'This centre is not verified yet; it takes no requests.',
            );
          if (why && !why.listed)
            throw new Problem(409, 'hall_not_listed', 'This hall is not taking requests.');
          throw notFound('hall');
        }
        if (!b.slots.length) throw new Problem(422, 'no_slots', 'Pick at least one free slot.');
        const start = b.slots[0]!.start;
        if (b.slots.some((s) => s.start !== start))
          throw new Problem(422, 'mixed_times', 'Pick slots at the same time of day.');
        if (!(b.expectedStudents >= 1))
          throw new Problem(422, 'invalid_students', 'How many students do you expect?');
        const slots = b.slots.map((s) => ({ weekday: s.weekday, start, end: plus2h(start) }));
        const free = await tx
          .selectFrom('market.public_room_slots')
          .select(['weekday', sql<string>`start_time::text`.as('start'), 'taken'])
          .where('room_id', '=', h.id!)
          .execute();
        for (const s of slots)
          if (!free.some((f) => f.weekday === s.weekday && hhmm(f.start) === s.start && !f.taken))
            throw new Problem(409, 'slot_taken', 'That slot is not free now.');
        const subject = await subjectForYear(tx, b.subjectId, b.schoolYearId);
        const id = uuidv7();
        await tx
          .insertInto('market.teacher_applications')
          .values({
            id,
            teacher_id: teacherId,
            centre_id: h.centre_id!,
            room_id: h.id!,
            subject_id: subject.id,
            requested_slots: JSON.stringify(slots),
            expected_students: b.expectedStudents,
            starts_on: b.startsOn,
          })
          .execute();
        await writeAudit(tx, {
          actorId: userId,
          actorType: 'user',
          centreId: h.centre_id,
          action: 'room_request.created',
          objectType: 'teacher_application',
          objectRef: id,
          after: { stage: 'requested', slots },
          requestId,
        });
        await enqueue(tx, {
          type: 'room_request.created',
          aggregateType: 'teacher_application',
          aggregateId: id,
          centreId: h.centre_id,
          data: { applicationId: id, centreId: h.centre_id, teacherId },
          requestId,
        });
        return { id, centreId: h.centre_id!, teacherId };
      })
      .then(async ({ id, centreId, teacherId }) => {
        // MKT-HAL-05: auto-approve only when the centre switched it on and every rule is met.
        await this.db.asSystem(async (sys) => {
          const rules = await autoApproveOf(sys, centreId);
          if (!rules.enabled) return;
          const app = await loadApplication(sys, id);
          const c = await checks(sys, {
            roomId: app.room_id,
            centreId,
            teacherId,
            slots: app.requested_slots,
            expectedStudents: app.expected_students,
            bookingId: null,
          });
          if (!c.meetsRules) return;
          try {
            await book(sys, app, null, true, requestId);
          } catch (e) {
            if (!isOverlap(e)) throw e; // someone else took the slot: it stays a request
          }
        });
        return (await this.dtos([id], lang))[0]!;
      });
  }

  /** `scope=mine` (J03) or the centre pipeline (C06, needs bookings.manage). */
  list(userId: string, q: { scope?: 'mine'; centreId?: string }, lang: Lang) {
    return this.db
      .asUser(userId, async (tx, ctx) => {
        if (q.centreId) {
          if (!isStaffOf(ctx, q.centreId)) throw notFound('centre');
          if (!can(ctx, q.centreId, 'bookings.manage'))
            throw forbidden('Room requests need the bookings permission.');
          const rows = await tx
            .selectFrom('market.teacher_applications')
            .select('id')
            .where('centre_id', '=', q.centreId)
            .where('stage', '<>', 'withdrawn')
            .orderBy('created_at')
            .execute();
          return rows.map((r) => r.id);
        }
        const teacherId = teacherOf(ctx);
        const rows = await tx
          .selectFrom('market.teacher_applications')
          .select('id')
          .where('teacher_id', '=', teacherId)
          .orderBy('created_at', 'desc')
          .execute();
        return rows.map((r) => r.id);
      })
      .then((ids) => this.dtos(ids, lang));
  }

  /** C06 stage moves, approval (books the slot, CF-46) and decline: centre staff with bookings.manage. */
  decide(
    userId: string,
    id: string,
    action:
      | { kind: 'stage'; stage: 'phone_call' | 'meeting'; at?: string }
      | { kind: 'approve' }
      | { kind: 'decline'; reason: string },
    lang: Lang,
    requestId?: string,
  ) {
    return this.db
      .asUser(userId, async (tx, ctx) => {
        const app = await loadApplication(tx, id).catch(() => null);
        if (!app || !isStaffOf(ctx, app.centre_id)) throw notFound('request');
        if (!can(ctx, app.centre_id, 'bookings.manage'))
          throw forbidden('Room requests need the bookings permission.');
        if (action.kind === 'stage') {
          if (!ORDER.includes(app.stage) || app.stage === 'approved')
            throw new Problem(409, 'request_closed', 'This request is already decided.');
          if (ORDER.indexOf(action.stage) <= ORDER.indexOf(app.stage))
            throw new Problem(409, 'stage_backwards', 'A request only moves forward.');
          await tx
            .updateTable('market.teacher_applications')
            .set({
              stage: action.stage,
              scheduled_contact_at: action.at ? new Date(action.at) : null,
            })
            .where('id', '=', id)
            .execute();
        } else if (action.kind === 'decline') {
          if (!action.reason.trim())
            throw new Problem(422, 'reason_required', 'Give the teacher a reason.');
          if (app.stage === 'approved')
            throw new Problem(409, 'request_closed', 'An approved request is a booking now.');
          if (!ORDER.includes(app.stage))
            throw new Problem(409, 'request_closed', 'This request was declined or withdrawn.');
          await tx
            .updateTable('market.teacher_applications')
            .set({ stage: 'declined', decline_reason: action.reason.trim() })
            .where('id', '=', id)
            .execute();
        } else {
          if (app.stage !== 'approved') {
            if (!ORDER.includes(app.stage))
              throw new Problem(409, 'request_closed', 'This request was declined or withdrawn.');
            const centre = await tx
              .selectFrom('org.centres')
              .select('verification')
              .where('id', '=', app.centre_id)
              .executeTakeFirstOrThrow();
            if (centre.verification !== 'verified')
              throw new Problem(
                409,
                'centre_not_verified',
                'A centre takes bookings once Link has verified it.',
              );
            try {
              await book(tx, app, userId, false, requestId);
            } catch (e) {
              if (isOverlap(e))
                throw new Problem(409, 'slot_taken', 'Another teacher has this slot now.');
              throw e;
            }
          }
        }
        if (action.kind !== 'approve')
          await writeAudit(tx, {
            actorId: userId,
            actorType: 'user',
            centreId: app.centre_id,
            action: `room_request.${action.kind === 'stage' ? 'moved' : 'declined'}`,
            objectType: 'teacher_application',
            objectRef: id,
            before: { stage: app.stage },
            after: action.kind === 'stage' ? { stage: action.stage } : { stage: 'declined' },
            reason: action.kind === 'decline' ? action.reason : null,
            requestId,
          });
        return id;
      })
      .then(async (rid) => (await this.dtos([rid], lang))[0]!);
  }

  withdraw(userId: string, id: string, lang: Lang, requestId?: string) {
    return this.db
      .asUser(userId, async (tx, ctx) => {
        const teacherId = teacherOf(ctx);
        const app = await loadApplication(tx, id).catch(() => null);
        if (!app || app.teacher_id !== teacherId) throw notFound('request');
        if (app.stage === 'approved' || app.stage === 'declined')
          throw new Problem(409, 'request_closed', 'This request is already decided.');
        await tx
          .updateTable('market.teacher_applications')
          .set({ stage: 'withdrawn' })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, {
          actorId: userId,
          actorType: 'user',
          centreId: app.centre_id,
          action: 'room_request.withdrawn',
          objectType: 'teacher_application',
          objectRef: id,
          requestId,
        });
        return id;
      })
      .then(async (rid) => (await this.dtos([rid], lang))[0]!);
  }

  /** J05 "New group": the teacher's bookings, with what the request said the group would teach. */
  myBookings(userId: string, lang: Lang) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const teacherId = teacherOf(ctx);
      const rows = await tx
        .selectFrom('market.room_bookings as b')
        .innerJoin('market.rooms_seen_by_teacher as r', 'r.id', 'b.room_id')
        .innerJoin('market.centres_seen_by_teacher as c', 'c.id', 'b.centre_id')
        .leftJoin('market.teacher_applications as a', 'a.id', 'b.application_id')
        .leftJoin('ref.subjects as s', 's.id', 'a.subject_id')
        .leftJoin('ref.school_years as y', 'y.id', 's.school_year_id')
        .leftJoin('market.groups as g', (j) => j.onRef('g.room_booking_id', '=', 'b.id'))
        .select([
          'b.id',
          'b.weekly_slots',
          sql<string>`b.starts_on::text`.as('starts_on'),
          'r.id as room_id',
          'r.name as room_name',
          'r.capacity',
          'c.id as centre_id',
          'c.name as centre_name',
          'g.id as group_id',
          's.id as subject_id',
          's.school_year_id',
          's.name_en',
          's.name_ar',
          'y.short_name_en',
          'y.short_name_ar',
        ])
        .where('b.teacher_id', '=', teacherId)
        .where('b.status', '<>', 'ended')
        .orderBy('b.created_at')
        .execute();
      return rows.map((r) => {
        const slots = r.weekly_slots as Slot[];
        return {
          id: r.id,
          centre: { id: r.centre_id!, name: r.centre_name! },
          hall: { id: r.room_id!, name: r.room_name!, capacity: r.capacity! },
          weekdays: slots.map((s) => s.weekday),
          start: slots[0]?.start ?? '',
          end: slots[0]?.end ?? '',
          startsOn: r.starts_on,
          groupId: r.group_id,
          subjectId: r.subject_id,
          schoolYearId: r.school_year_id,
          label: r.subject_id
            ? `${lang === 'ar' ? r.name_ar : r.name_en} • ${(lang === 'ar' ? r.short_name_ar : r.short_name_en) ?? ''}`
            : null,
        };
      });
    });
  }

  /** The request cards (RoomRequest), filled in by the system for IDs the caller may see. */
  dtos(ids: string[], lang: Lang) {
    if (!ids.length) return Promise.resolve([]);
    return this.db.asSystem(async (sys) => {
      const rows = await sys
        .selectFrom('market.teacher_applications as a')
        .innerJoin('market.rooms as r', 'r.id', 'a.room_id')
        .innerJoin('org.centres as c', 'c.id', 'a.centre_id')
        .innerJoin('org.teachers as t', 't.id', 'a.teacher_id')
        .innerJoin('ref.subjects as s', 's.id', 'a.subject_id')
        .innerJoin('ref.school_years as y', 'y.id', 's.school_year_id')
        .leftJoin('market.review_stats as rs', (j) =>
          j.onRef('rs.target_id', '=', 'a.teacher_id').on('rs.target_type', '=', 'teacher'),
        )
        .select([
          'a.id',
          'a.teacher_id',
          'a.centre_id',
          'a.room_id',
          'a.requested_slots',
          'a.expected_students',
          sql<string>`a.starts_on::text`.as('starts_on'),
          'a.stage',
          'a.scheduled_contact_at',
          'a.decline_reason',
          'a.room_booking_id',
          'a.created_at',
          'r.name as room_name',
          'r.capacity',
          'r.rent_rule',
          'c.name as centre_name',
          'c.area',
          't.display_name',
          't.verification',
          's.name_en',
          's.name_ar',
          'y.short_name_en',
          'y.short_name_ar',
          'rs.distribution',
        ])
        .where('a.id', 'in', ids)
        .execute();
      const out: Awaited<ReturnType<typeof cardOf>>[] = [];
      for (const r of rows) out.push(await cardOf(r));
      return ids.map((id) => out.find((x) => x.id === id)!).filter(Boolean);

      async function cardOf(r: (typeof rows)[number]) {
        const slots = r.requested_slots as Slot[];
        const c = await checks(sys, {
          roomId: r.room_id,
          centreId: r.centre_id,
          teacherId: r.teacher_id,
          slots,
          expectedStudents: r.expected_students,
          bookingId: r.room_booking_id,
        });
        const rating = ratingOf(r.distribution);
        return {
          id: r.id,
          centre: { id: r.centre_id, name: r.centre_name, area: r.area ?? '' },
          hall: { id: r.room_id, name: r.room_name, capacity: r.capacity },
          teacher: {
            id: r.teacher_id,
            name: r.display_name,
            rating: rating.avg,
            reviewCount: rating.count,
            verifiedId: r.verification === 'verified',
            // "New on Link": no published review yet.
            isNew: rating.count === 0,
          },
          subject: lang === 'ar' ? r.name_ar : r.name_en,
          schoolYear: (lang === 'ar' ? r.short_name_ar : r.short_name_en) ?? '',
          weekdays: slots.map((s) => s.weekday),
          start: slots[0]?.start ?? '',
          end: slots[0]?.end ?? '',
          expectedStudents: r.expected_students,
          startsOn: r.starts_on,
          stage: r.stage as Stage,
          stageAt: r.scheduled_contact_at ? new Date(r.scheduled_contact_at).toISOString() : null,
          checks: c.checks,
          meetsRules: c.meetsRules,
          rentRule: ruleDto(r.rent_rule as StoredRentRule),
          declinedReason: r.decline_reason,
          createdAt: new Date(r.created_at).toISOString(),
        };
      }
    });
  }
}

async function loadApplication(tx: Tx, id: string) {
  const a = await tx
    .selectFrom('market.teacher_applications')
    .select([
      'id',
      'teacher_id',
      'centre_id',
      'room_id',
      'requested_slots',
      'expected_students',
      sql<string>`starts_on::text`.as('starts_on'),
      'stage',
      'room_booking_id',
    ])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return { ...a, stage: a.stage as Stage, requested_slots: a.requested_slots as Slot[] };
}

/** Each auto-approve rule, checked from the data (C06 card, J02 estimate). */
async function checks(
  sys: Tx,
  r: {
    roomId: string;
    centreId: string;
    teacherId: string;
    slots: Slot[];
    expectedStudents: number;
    bookingId: string | null;
  },
) {
  const rules = await autoApproveOf(sys, r.centreId);
  const room = await sys
    .selectFrom('market.rooms')
    .select('capacity')
    .where('id', '=', r.roomId)
    .executeTakeFirstOrThrow();
  const t = await sys
    .selectFrom('org.teachers as t')
    .leftJoin('market.review_stats as rs', (j) =>
      j.onRef('rs.target_id', '=', 't.id').on('rs.target_type', '=', 'teacher'),
    )
    .select(['t.verification', 'rs.distribution'])
    .where('t.id', '=', r.teacherId)
    .executeTakeFirstOrThrow();
  const own = r.bookingId
    ? await sys
        .selectFrom('market.room_bookings')
        .select('weekly_slots')
        .where('id', '=', r.bookingId)
        .executeTakeFirst()
    : undefined;
  const taken = (await takenSlots(sys, [r.roomId])).filter(
    (x) =>
      !(
        own &&
        (own.weekly_slots as Slot[]).some((o) => o.weekday === x.weekday && o.start === x.start)
      ),
  );
  const rating = ratingOf(t.distribution).avg;
  const result = {
    verifiedId: t.verification === 'verified',
    rating: rating !== null && rating >= rules.minRating,
    fitsCapacity: r.expectedStudents <= room.capacity,
    slotFree: r.slots.every(
      (s) =>
        !taken.some((x) => x.weekday === s.weekday && overlaps(x.start, x.end, s.start, s.end)),
    ),
  };
  return {
    checks: result,
    meetsRules:
      (!rules.verifiedId || result.verifiedId) &&
      result.rating &&
      (!rules.fitsCapacity || result.fitsCapacity) &&
      result.slotFree,
  };
}

/**
 * Approval → the booking (CF-46): the hall's rent rule is snapshotted, and one booking-slot row per
 * weekday is written; the exclusion constraint makes a double booking impossible.
 */
async function book(
  tx: Tx,
  app: Awaited<ReturnType<typeof loadApplication>>,
  actorId: string | null,
  auto: boolean,
  requestId?: string,
) {
  const room = await tx
    .selectFrom('market.rooms')
    .select('rent_rule')
    .where('id', '=', app.room_id)
    .executeTakeFirstOrThrow();
  const id = uuidv7();
  await tx
    .insertInto('market.room_bookings')
    .values({
      id,
      room_id: app.room_id,
      centre_id: app.centre_id,
      teacher_id: app.teacher_id,
      application_id: app.id,
      weekly_slots: JSON.stringify(app.requested_slots),
      rent_rule: JSON.stringify(room.rent_rule),
      starts_on: app.starts_on,
    })
    .execute();
  await tx
    .insertInto('market.room_booking_slots')
    .values(
      app.requested_slots.map((s) => ({
        booking_id: id,
        room_id: app.room_id,
        centre_id: app.centre_id,
        weekday: s.weekday,
        minutes: sql`int4range(${Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3))}, ${Number(s.end.slice(0, 2)) * 60 + Number(s.end.slice(3))})`,
        active_dates: sql`daterange(${app.starts_on}::date, NULL)`,
      })) as never,
    )
    .execute();
  await tx
    .updateTable('market.teacher_applications')
    .set({ stage: 'approved', room_booking_id: id, auto_approved: auto })
    .where('id', '=', app.id)
    .execute();
  await writeAudit(tx, {
    actorId,
    actorType: actorId ? 'user' : 'system',
    centreId: app.centre_id,
    action: 'room_request.approved',
    objectType: 'teacher_application',
    objectRef: app.id,
    before: { stage: app.stage },
    after: { stage: 'approved', bookingId: id, auto },
    requestId,
  });
  await enqueue(tx, {
    type: 'room_booking.created',
    aggregateType: 'room_booking',
    aggregateId: id,
    centreId: app.centre_id,
    data: {
      bookingId: id,
      applicationId: app.id,
      teacherId: app.teacher_id,
      centreId: app.centre_id,
    },
    requestId,
  });
  return id;
}

@Controller()
export class RequestsController {
  constructor(@Inject(Requests) private readonly requests: Requests) {}

  @Endpoint(routes.roomSearch)
  search(@Caller() p: Principal, @Input() i: In<typeof routes.roomSearch>) {
    return this.requests.search(p.userId, i.query);
  }

  @Endpoint(routes.rentEstimate)
  estimate(@Caller() p: Principal, @Input() i: In<typeof routes.rentEstimate>) {
    return this.requests.estimate(p.userId, i.params.id, i.body);
  }

  @Endpoint(routes.requestRoom)
  create(@Caller() p: Principal, @Input() i: In<typeof routes.requestRoom>, @Req() req: Request) {
    return this.requests.create(p.userId, i.body, p.lang, requestIdOf(req));
  }

  @Endpoint(routes.roomRequests)
  list(@Caller() p: Principal, @Input() i: In<typeof routes.roomRequests>) {
    return this.requests.list(p.userId, i.query, p.lang);
  }

  @Endpoint(routes.stageRequest)
  stage(@Caller() p: Principal, @Input() i: In<typeof routes.stageRequest>, @Req() req: Request) {
    return this.requests.decide(
      p.userId,
      i.params.id,
      { kind: 'stage', stage: i.body.stage, at: i.body.at },
      p.lang,
      requestIdOf(req),
    );
  }

  @Endpoint(routes.approveRequest)
  approve(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.approveRequest>,
    @Req() req: Request,
  ) {
    return this.requests.decide(
      p.userId,
      i.params.id,
      { kind: 'approve' },
      p.lang,
      requestIdOf(req),
    );
  }

  @Endpoint(routes.declineRequest)
  decline(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.declineRequest>,
    @Req() req: Request,
  ) {
    return this.requests.decide(
      p.userId,
      i.params.id,
      { kind: 'decline', reason: i.body.reason },
      p.lang,
      requestIdOf(req),
    );
  }

  @Endpoint(routes.withdrawRequest)
  withdraw(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.withdrawRequest>,
    @Req() req: Request,
  ) {
    return this.requests.withdraw(p.userId, i.params.id, p.lang, requestIdOf(req));
  }

  @Endpoint(routes.myBookings)
  bookings(@Caller() p: Principal) {
    return this.requests.myBookings(p.userId, p.lang);
  }
}
