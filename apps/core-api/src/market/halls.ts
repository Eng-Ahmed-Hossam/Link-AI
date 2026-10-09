import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { sql } from 'kysely';
import { createTranslator, formatClock, formatWeekday } from '@link/i18n';
import { routes } from '../contract/routes';
import { writeAudit } from '../platform/audit';
import { Database, isOwnerOf, isStaffOf, type RlsContext, type Tx } from '../platform/db';
import { FLAG, centreFlag } from '../platform/flags';
import { Caller, Endpoint, type In, Input, type Principal } from '../platform/http';
import { uuidv7 } from '../platform/ids';
import { Problem, forbidden, notFound } from '../platform/problem';
import { requestIdOf } from '../platform/request-context';
import { addDays, cairoToday, isoWeekday } from '../platform/time';
import {
  DEFAULT_POINT,
  type Lang,
  SLOT_DAYS,
  SLOT_TIMES,
  type StoredRentRule,
  distanceKmSql,
  hhmm,
  overlaps,
  plus2h,
  ratingOf,
  ruleDto,
  ruleFromInput,
} from './model';
import type { Seats } from '../enrolment/seats';

type SlotState = 'free' | 'taken' | 'closed';
const DEFAULT_AUTO_APPROVE = {
  enabled: false,
  verifiedId: true,
  minRating: 4.5,
  fitsCapacity: true,
};

/** A live booking slot of a hall (taken from now on). */
export interface TakenSlot {
  roomId: string;
  weekday: number;
  start: string;
  end: string;
}

/** Live bookings' slots for these halls (ended bookings free their slots). */
export async function takenSlots(tx: Tx, roomIds: string[]): Promise<TakenSlot[]> {
  if (!roomIds.length) return [];
  const rows = await tx
    .selectFrom('market.room_bookings')
    .select(['room_id', 'weekly_slots'])
    .where('room_id', 'in', roomIds)
    .where('status', '<>', 'ended')
    .where((w) => w.or([w('ends_on', 'is', null), w('ends_on', '>', cairoToday() as never)]))
    .execute();
  return rows.flatMap((r) =>
    (r.weekly_slots as { weekday: number; start: string; end: string }[]).map((s) => ({
      roomId: r.room_id,
      weekday: s.weekday,
      start: s.start,
      end: s.end,
    })),
  );
}

export interface HallRow {
  id: string;
  centre_id: string;
  name: string;
  capacity: number;
  facilities: string[];
  rent_rule: unknown;
  listed: boolean;
  photo: number;
}

/** The weekly grid of a hall with each slot's state (C05). */
export function hallSlots(
  h: HallRow,
  open: { weekday: number; start_time: string; listed: boolean }[],
  taken: TakenSlot[],
) {
  return SLOT_DAYS.flatMap((weekday) =>
    SLOT_TIMES.map((start) => {
      const end = plus2h(start);
      const isTaken = taken.some(
        (t) => t.roomId === h.id && t.weekday === weekday && overlaps(t.start, t.end, start, end),
      );
      const slot = open.find((o) => o.weekday === weekday && hhmm(o.start_time) === start);
      const state: SlotState = isTaken ? 'taken' : !h.listed || !slot?.listed ? 'closed' : 'free';
      return { weekday, start, end, state };
    }),
  );
}

export function hallDto(
  h: HallRow,
  open: { room_id: string; weekday: number; start_time: string; listed: boolean }[],
  taken: TakenSlot[],
) {
  const slots = hallSlots(
    h,
    open.filter((o) => o.room_id === h.id),
    taken,
  );
  return {
    id: h.id,
    centreId: h.centre_id,
    name: h.name,
    capacity: h.capacity,
    facilities: h.facilities as (
      'ac' | 'fan' | 'projector' | 'sound' | 'whiteboard' | 'smart_board' | 'wheelchair'
    )[],
    rentRule: ruleDto(h.rent_rule as StoredRentRule),
    listed: h.listed,
    slots,
    freeSlotsPerWeek: slots.filter((s) => s.state === 'free').length,
    photo: h.photo,
  };
}

const requireOwner = (ctx: RlsContext, centreId: string) => {
  if (!isStaffOf(ctx, centreId)) throw notFound('centre');
  if (!isOwnerOf(ctx, centreId)) throw forbidden('Centre owners only.');
};

/** "Sat–Thu, 2:00–9:00 PM · Fri closed" from the centre's hours, in the caller's language. */
function hoursLabel(hours: { weekday: number; opens: string; closes: string }[], lang: Lang) {
  if (!hours.length) return '';
  const t = createTranslator(lang);
  const order = [6, 7, 1, 2, 3, 4, 5];
  const open = order.filter((d) => hours.some((h) => h.weekday === d));
  const first = hours.find((h) => h.weekday === open[0])!;
  const same = hours.every((h) => h.opens === first.opens && h.closes === first.closes);
  const days =
    open.length > 2
      ? `${formatWeekday(open[0]!, lang)}–${formatWeekday(open[open.length - 1]!, lang)}`
      : open.map((d) => formatWeekday(d, lang)).join(lang === 'ar' ? ' و' : ' & ');
  const times = same ? `${formatClock(first.opens, lang)}–${formatClock(first.closes, lang)}` : '';
  const closed = order
    .filter((d) => !open.includes(d))
    .map((d) => t('server.centre.closedDay', { day: formatWeekday(d, lang) }));
  return [[days, times].filter(Boolean).join(lang === 'ar' ? '، ' : ', '), ...closed].join(' · ');
}

/** Halls, slots and the centre's profile, schedule and auto-approve rules (C02, C03, C05). */
export class Halls {
  constructor(
    private readonly db: Database,
    private readonly seats: Seats,
  ) {}

  async hallsOf(tx: Tx, centreId: string) {
    const halls = await tx
      .selectFrom('market.rooms')
      .select(['id', 'centre_id', 'name', 'capacity', 'facilities', 'rent_rule', 'listed', 'photo'])
      .where('centre_id', '=', centreId)
      .where('archived_at', 'is', null)
      .orderBy('created_at')
      .orderBy('name')
      .execute();
    const ids = halls.map((h) => h.id);
    const open = ids.length
      ? await tx
          .selectFrom('market.room_open_slots')
          .select(['room_id', 'weekday', sql<string>`start_time::text`.as('start_time'), 'listed'])
          .where('room_id', 'in', ids)
          .execute()
      : [];
    const taken = await takenSlots(tx, ids);
    return { halls, open, taken, dtos: halls.map((h) => hallDto(h, open, taken)) };
  }

  list(userId: string, centreId: string) {
    return this.db.asUser(userId, async (tx) => (await this.hallsOf(tx, centreId)).dtos);
  }

  /** CF-44: the owner adds a hall: listed, the whole weekly grid open. */
  add(
    userId: string,
    centreId: string,
    b: {
      name: string;
      capacity: number;
      facilities: string[];
      rentRule: Parameters<typeof ruleFromInput>[0];
    },
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      requireOwner(ctx, centreId);
      const name = b.name.trim();
      if (!name) throw new Problem(422, 'invalid_name', 'Give the hall a name.');
      checkCapacity(b.capacity);
      const id = uuidv7();
      const count = await tx
        .selectFrom('market.rooms')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('centre_id', '=', centreId)
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('market.rooms')
        .values({
          id,
          centre_id: centreId,
          name,
          capacity: b.capacity,
          facilities: [...new Set(b.facilities)],
          rent_rule: JSON.stringify(ruleFromInput(b.rentRule)),
          listed: true,
          photo: count.n % 4,
        })
        .execute();
      await tx
        .insertInto('market.room_open_slots')
        .values(
          SLOT_DAYS.flatMap((weekday) =>
            SLOT_TIMES.map((start) => ({
              id: uuidv7(),
              room_id: id,
              centre_id: centreId,
              weekday,
              start_time: start,
              end_time: plus2h(start),
              listed: true,
            })),
          ),
        )
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId,
        action: 'hall.added',
        objectType: 'room',
        objectRef: id,
        after: { capacity: b.capacity },
        requestId,
      });
      return (await this.hallsOf(tx, centreId)).dtos.find((h) => h.id === id)!;
    });
  }

  /** C05: one rent rule per hall; seats never below a group's seat cap in it. */
  patch(
    userId: string,
    hallId: string,
    p: {
      name?: string;
      capacity?: number;
      facilities?: string[];
      rentRule?: Parameters<typeof ruleFromInput>[0];
      listed?: boolean;
      closedSlots?: { weekday: number; start: string; end: string }[];
    },
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const h = await tx
        .selectFrom('market.rooms')
        .select(['id', 'centre_id', 'capacity'])
        .where('id', '=', hallId)
        .executeTakeFirst();
      if (!h) throw notFound('hall');
      requireOwner(ctx, h.centre_id);
      const set: Record<string, unknown> = {};
      if (p.capacity !== undefined) {
        checkCapacity(p.capacity);
        const biggest = await tx
          .selectFrom('market.groups as g')
          .innerJoin('market.room_bookings as b', 'b.id', 'g.room_booking_id')
          .select(sql<number>`coalesce(max(g.seat_cap), 0)::int`.as('n'))
          .where('b.room_id', '=', hallId)
          .where('g.status', '<>', 'closed')
          .executeTakeFirstOrThrow();
        if (p.capacity < biggest.n)
          throw new Problem(
            409,
            'capacity_below_group',
            `A group in this hall has ${biggest.n} seats.`,
          );
        set.capacity = p.capacity;
      }
      if (p.name !== undefined) {
        const name = p.name.trim();
        if (!name) throw new Problem(422, 'invalid_name', 'Give the hall a name.');
        set.name = name;
      }
      if (p.facilities) set.facilities = [...new Set(p.facilities)];
      if (p.listed !== undefined) set.listed = p.listed;
      if (p.rentRule) set.rent_rule = JSON.stringify(ruleFromInput(p.rentRule));
      if (Object.keys(set).length)
        await tx.updateTable('market.rooms').set(set).where('id', '=', hallId).execute();
      if (p.closedSlots) {
        await tx
          .updateTable('market.room_open_slots')
          .set({ listed: true })
          .where('room_id', '=', hallId)
          .execute();
        for (const c of p.closedSlots)
          await tx
            .updateTable('market.room_open_slots')
            .set({ listed: false })
            .where('room_id', '=', hallId)
            .where('weekday', '=', c.weekday)
            .where(sql<boolean>`start_time = ${c.start}::time`)
            .execute();
      }
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: h.centre_id,
        action: 'hall.updated',
        objectType: 'room',
        objectRef: hallId,
        after: { fields: Object.keys(p) },
        requestId,
      });
      return (await this.hallsOf(tx, h.centre_id)).dtos.find((x) => x.id === hallId)!;
    });
  }

  /** C02: the editing view of the centre's profile. */
  profile(userId: string, centreId: string, lang: Lang) {
    return this.db.asUser(userId, (tx) => this.profileIn(tx, centreId, lang));
  }

  async profileIn(tx: Tx, centreId: string, lang: Lang) {
    const c = await tx
      .selectFrom('org.centres')
      .select([
        'id',
        'slug',
        'name',
        'area',
        'address',
        'about_en',
        'about_ar',
        'photos',
        'hours',
        'verification',
        'location_status',
        sql<number | null>`ST_Y(location::geometry)`.as('lat'),
        sql<number | null>`ST_X(location::geometry)`.as('lng'),
        distanceKmSql(DEFAULT_POINT.lat, DEFAULT_POINT.lng).as('distance_km'),
      ])
      .where('id', '=', centreId)
      .executeTakeFirst();
    if (!c) throw notFound('centre');
    const { dtos: halls } = await this.hallsOf(tx, centreId);
    const about = (lang === 'ar' ? c.about_ar : c.about_en) ?? c.about_ar ?? c.about_en ?? '';
    const photos = Array.isArray(c.photos) ? c.photos.length : 0;
    const listed = halls.filter((h) => h.listed).length;
    const parts = [about.length >= 40, photos >= 3, listed > 0, true, true];
    const stats = await tx
      .selectFrom('market.review_stats')
      .select('distribution')
      .where('target_type', '=', 'centre')
      .where('target_id', '=', centreId)
      .executeTakeFirst();
    const r = ratingOf(stats?.distribution);
    const teachers = await tx
      .selectFrom('market.room_bookings')
      .select(sql<number>`count(distinct teacher_id)::int`.as('n'))
      .where('centre_id', '=', centreId)
      .where('status', '<>', 'ended')
      .executeTakeFirstOrThrow();
    const verified = c.verification === 'verified';
    return {
      id: c.id,
      slug: c.slug,
      distanceKm: Number(c.distance_km ?? 0),
      name: c.name,
      area: c.area ?? '',
      address: c.address ?? '',
      about,
      photos,
      hours: hoursLabel(c.hours as { weekday: number; opens: string; closes: string }[], lang),
      liveOnMap: verified && listed > 0,
      verified,
      completeness: Math.round((parts.filter(Boolean).length / parts.length) * 100),
      badges: [
        ...(verified ? ['verified'] : []),
        ...((await centreFlag(tx, FLAG.followupExtra, centreId)) ? ['progress_updates'] : []),
      ],
      rating: { avg: r.avg ?? 0, count: r.count },
      teachers: teachers.n,
      halls,
      location: {
        lat: c.lat ?? 0,
        lng: c.lng ?? 0,
        address: c.address ?? '',
        underReview: c.location_status === 'under_review',
      },
    };
  }

  /** C02 edits (owner only). CF-44: a moved pin is under review until Link ops verify it. */
  patchCentre(
    userId: string,
    centreId: string,
    p: {
      about?: string;
      photos?: number;
      location?: { lat: number; lng: number; address: string };
    },
    lang: Lang,
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      requireOwner(ctx, centreId);
      const set: Record<string, unknown> = {};
      if (p.about !== undefined) set[lang === 'ar' ? 'about_ar' : 'about_en'] = p.about;
      if (p.photos !== undefined)
        set.photos = JSON.stringify(Array.from({ length: p.photos }, (_, i) => ({ sample: i })));
      if (p.location) {
        const address = p.location.address.trim();
        if (!address) throw new Problem(422, 'invalid_address', 'Write the address.');
        const { lat, lng } = p.location;
        // Egypt, roughly: the pin must be on the map Link serves.
        if (!(lat >= 22 && lat <= 32 && lng >= 24.5 && lng <= 37))
          throw new Problem(422, 'invalid_location', 'Put the pin in Egypt.');
        set.location = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
        set.address = address;
      }
      if (Object.keys(set).length)
        await tx.updateTable('org.centres').set(set).where('id', '=', centreId).execute();
      // CF-44: the database marks a moved pin `under_review` (trigger centres_location_review).
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId,
        action: p.location ? 'centre.location_moved' : 'centre.updated',
        objectType: 'centre',
        objectRef: centreId,
        after: { fields: Object.keys(p) },
        requestId,
      });
      return this.profileIn(tx, centreId, lang);
    });
  }

  /** C03: the next six working days, booked and teaching cells, free slots, and the stats. */
  schedule(userId: string, centreId: string) {
    return this.db
      .asUser(userId, async (tx) => {
        const today = cairoToday();
        const { halls, open, taken } = await this.hallsOf(tx, centreId);
        const dates: Record<string, string> = {};
        for (let i = 0; i < 7; i++) {
          const d = addDays(today, i);
          if (SLOT_DAYS.includes(isoWeekday(d))) dates[String(isoWeekday(d))] = d;
        }
        const bookings = await tx
          .selectFrom('market.room_bookings as b')
          .leftJoin('market.groups as g', (j) =>
            j.onRef('g.room_booking_id', '=', 'b.id').on('g.status', '<>', 'closed'),
          )
          .leftJoin('market.teachers_seen_by_centre as t', 't.id', 'b.teacher_id')
          .leftJoin('ref.subjects as s', 's.id', 'g.subject_id')
          .leftJoin('ref.school_years as y', 'y.id', 'g.school_year_id')
          .select([
            'b.id',
            'b.room_id',
            'b.teacher_id',
            'b.weekly_slots',
            sql<string>`b.starts_on::text`.as('starts_on'),
            'g.id as group_id',
            'g.seat_cap',
            't.display_name',
            's.name_en as subject_en',
            's.name_ar as subject_ar',
            'y.short_name_en',
            'y.short_name_ar',
          ])
          .where('b.centre_id', '=', centreId)
          .where('b.status', '<>', 'ended')
          .execute();
        const filled = await this.seats.filledNext(
          tx,
          bookings.flatMap((b) => (b.group_id ? [b.group_id] : [])),
        );
        return { halls, open, taken, bookings, dates, filled, today };
      })
      .then(({ halls, open, taken, bookings, dates, filled, today }) => ({
        build: (lang: Lang) => {
          const cells = [];
          const fill: number[] = [];
          const teachers = new Set<string>();
          for (const b of bookings) {
            teachers.add(b.teacher_id);
            const started = b.starts_on <= today;
            const seats = b.group_id
              ? { filled: filled.get(b.group_id) ?? 0, cap: b.seat_cap! }
              : null;
            if (seats && started) fill.push(seats.filled / seats.cap);
            const group = b.group_id
              ? `${(lang === 'ar' ? b.subject_ar : b.subject_en) ?? ''} • ${(lang === 'ar' ? b.short_name_ar : b.short_name_en) ?? ''}`
              : null;
            for (const s of b.weekly_slots as { weekday: number; start: string; end: string }[])
              cells.push({
                hallId: b.room_id,
                weekday: s.weekday,
                start: s.start,
                end: s.end,
                kind: (b.group_id && started ? 'teaching' : 'booked') as 'teaching' | 'booked',
                teacher: b.display_name ?? null,
                group,
                seats,
                startsOn: started ? null : b.starts_on,
                rentRule: null,
              });
          }
          let openCount = 0;
          let takenCount = 0;
          let free = 0;
          for (const h of halls.filter((x) => x.listed))
            for (const s of hallSlots(
              h,
              open.filter((o) => o.room_id === h.id),
              taken,
            )) {
              if (s.state === 'closed') continue;
              openCount++;
              if (s.state === 'taken') takenCount++;
              else {
                free++;
                cells.push({
                  hallId: h.id,
                  weekday: s.weekday,
                  start: s.start,
                  end: s.end,
                  kind: 'free' as const,
                  teacher: null,
                  group: null,
                  seats: null,
                  startsOn: null,
                  rentRule: ruleDto(h.rent_rule as StoredRentRule),
                });
              }
            }
          return {
            days: [...SLOT_DAYS].sort((a, b) =>
              (dates[String(a)] ?? '').localeCompare(dates[String(b)] ?? ''),
            ),
            dates,
            halls: halls.map((h) => ({ id: h.id, name: h.name, capacity: h.capacity })),
            cells,
            stats: {
              roomUsePercent: openCount ? Math.round((takenCount / openCount) * 100) : 0,
              freeSlots: free,
              averageSeatsFilledPercent: fill.length
                ? Math.round((fill.reduce((a, x) => a + x, 0) / fill.length) * 100)
                : 0,
              teachersRenting: teachers.size,
            },
          };
        },
      }));
  }

  autoApprove(userId: string, centreId: string) {
    return this.db.asUser(userId, async (tx) => autoApproveOf(tx, centreId));
  }

  putAutoApprove(
    userId: string,
    centreId: string,
    r: { enabled: boolean; verifiedId: boolean; minRating: number; fitsCapacity: boolean },
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      requireOwner(ctx, centreId);
      if (!(r.minRating >= 1 && r.minRating <= 5))
        throw new Problem(422, 'invalid_rating', 'Rating from 1 to 5.');
      await tx
        .updateTable('org.centres')
        .set({ settings: sql`jsonb_set(settings, '{autoApprove}', ${JSON.stringify(r)}::jsonb)` })
        .where('id', '=', centreId)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId,
        action: 'centre.auto_approve_changed',
        objectType: 'centre',
        objectRef: centreId,
        after: r,
        requestId,
      });
      return autoApproveOf(tx, centreId);
    });
  }
}

/** MKT-HAL-05: off by default; the rules are Figma C05's. Read with the caller's own RLS. */
export async function autoApproveOf(tx: Tx, centreId: string) {
  const c = await tx
    .selectFrom('org.centres')
    .select('settings')
    .where('id', '=', centreId)
    .executeTakeFirst();
  if (!c) throw notFound('centre');
  const a =
    (c.settings as { autoApprove?: Partial<typeof DEFAULT_AUTO_APPROVE> }).autoApprove ?? {};
  return { ...DEFAULT_AUTO_APPROVE, ...a };
}

function checkCapacity(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 500)
    throw new Problem(422, 'invalid_capacity', 'Seats must be a whole number from 1 to 500.');
}

@Controller()
export class HallsController {
  constructor(@Inject(Halls) private readonly halls: Halls) {}

  @Endpoint(routes.centreProfile)
  profile(@Caller() p: Principal, @Input() i: In<typeof routes.centreProfile>) {
    return this.halls.profile(p.userId, i.params.id, p.lang);
  }

  @Endpoint(routes.patchCentre)
  patch(@Caller() p: Principal, @Input() i: In<typeof routes.patchCentre>, @Req() req: Request) {
    return this.halls.patchCentre(p.userId, i.params.id, i.body, p.lang, requestIdOf(req));
  }

  @Endpoint(routes.halls)
  list(@Caller() p: Principal, @Input() i: In<typeof routes.halls>) {
    return this.halls.list(p.userId, i.params.id);
  }

  @Endpoint(routes.addHall)
  add(@Caller() p: Principal, @Input() i: In<typeof routes.addHall>, @Req() req: Request) {
    return this.halls.add(p.userId, i.params.id, i.body, requestIdOf(req));
  }

  @Endpoint(routes.patchHall)
  patchHall(@Caller() p: Principal, @Input() i: In<typeof routes.patchHall>, @Req() req: Request) {
    return this.halls.patch(p.userId, i.params.id, i.body, requestIdOf(req));
  }

  @Endpoint(routes.schedule)
  async schedule(@Caller() p: Principal, @Input() i: In<typeof routes.schedule>) {
    return (await this.halls.schedule(p.userId, i.params.id)).build(p.lang);
  }

  @Endpoint(routes.autoApprove)
  autoApprove(@Caller() p: Principal, @Input() i: In<typeof routes.autoApprove>) {
    return this.halls.autoApprove(p.userId, i.params.id);
  }

  @Endpoint(routes.putAutoApprove)
  putAutoApprove(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.putAutoApprove>,
    @Req() req: Request,
  ) {
    return this.halls.putAutoApprove(p.userId, i.params.id, i.body, requestIdOf(req));
  }
}
