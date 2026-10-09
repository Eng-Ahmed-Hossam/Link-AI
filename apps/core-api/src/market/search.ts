import { Controller, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import { routes } from '../contract/routes';
import { Database, type Tx } from '../platform/db';
import {
  CallerLang,
  Endpoint,
  type In,
  Input,
  MaybeCaller,
  type Principal,
} from '../platform/http';
import { notFound } from '../platform/problem';
import { type Lang, DEFAULT_POINT, hhmm, money, ratingSummary, sessionsPerMonth } from './model';
import type { Seats } from '../enrolment/seats';
import { publicReviews } from './reviews';

type Query = {
  curriculumId?: string;
  schoolYearId?: string;
  subjectId?: string;
  radiusKm?: number;
  minRating?: number;
  maxFeePt?: number;
  seatsOpen?: boolean;
  verifiedOnly?: boolean;
  sort?: 'best_match' | 'distance' | 'rating' | 'fee';
  q?: string;
  lat?: number;
  lng?: number;
  /** The signed-in parent's home area (never from the query string). */
  homeArea?: string | null;
};
/** MKT-DSC-02: within 5 km unless the parent widens it. */
const DEFAULT_RADIUS_KM = 5;
const pick = (lang: Lang, en: string | null | undefined, ar: string | null | undefined) =>
  (lang === 'ar' ? ar : en) ?? ar ?? en ?? '';

/**
 * Discovery (P02–P06) from the PUBLIC views only: verified centres, active teachers, listed halls,
 * published groups. A pending centre (C01) or an invited teacher never appears here.
 */
export class Search {
  constructor(
    private readonly db: Database,
    private readonly seats: Seats,
  ) {}

  /** Published groups matching the filters; the subject matches by code within the school year. */
  private async groups(tx: Tx, q: Query, lang: Lang) {
    const { lat, lng } = await this.point(tx, q);
    let query = tx
      .selectFrom('market.public_groups as g')
      .innerJoin('market.public_centres as c', 'c.id', 'g.centre_id')
      .innerJoin('market.public_teachers as t', 't.id', 'g.teacher_id')
      .innerJoin('ref.subjects as s', 's.id', 'g.subject_id')
      .select([
        'g.id',
        'g.centre_id',
        'g.teacher_id',
        'g.subject_id',
        'g.curriculum_id',
        'g.school_year_id',
        'g.session_fee_pt',
        'g.seat_cap',
        's.name_en as subject_en',
        's.name_ar as subject_ar',
        'c.name as centre_name',
        sql<number>`round((ST_Distance(c.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000)::numeric, 1)::float8`.as(
          'distance_km',
        ),
      ]);
    if (q.curriculumId) query = query.where('g.curriculum_id', '=', q.curriculumId);
    if (q.schoolYearId) query = query.where('g.school_year_id', '=', q.schoolYearId);
    if (q.subjectId)
      query = query.where(
        's.code',
        '=',
        tx.selectFrom('ref.subjects').select('code').where('id', '=', q.subjectId),
      );
    if (q.maxFeePt) query = query.where('g.session_fee_pt', '<=', String(q.maxFeePt));
    const rows = await query.execute();
    void lang;
    return rows;
  }

  /**
   * Where distances are measured from (decided 2026-10-09): the location the browser shared (sent
   * with the query, never stored), else the parent's home area — the centre of the verified
   * centres there — else the Maadi sample point.
   */
  private async point(tx: Tx, q: Query) {
    if (q.lat !== undefined && q.lng !== undefined) return { lat: q.lat, lng: q.lng };
    if (q.homeArea) {
      const c = await tx
        .selectFrom('market.public_centres')
        .select([
          sql<number | null>`avg(ST_Y(location::geometry))`.as('lat'),
          sql<number | null>`avg(ST_X(location::geometry))`.as('lng'),
        ])
        .where('area', '=', q.homeArea)
        .executeTakeFirst();
      if (c?.lat != null && c.lng != null) return { lat: Number(c.lat), lng: Number(c.lng) };
    }
    return DEFAULT_POINT;
  }

  /** A signed-in parent's home area, if any (a name only). */
  async homeAreaOf(p: Principal | null) {
    if (!p) return null;
    return this.db.asUser(p.userId, async (tx, ctx) =>
      ctx.guardianId
        ? ((
            await tx
              .selectFrom('org.guardians')
              .select('home_area')
              .where('id', '=', ctx.guardianId)
              .executeTakeFirst()
          )?.home_area ?? null)
        : null,
    );
  }

  /** Seat state per group from its next session (CF-28: a full group takes a waitlist). */
  private async seatStates(
    tx: Tx,
    groups: { id: string; centre_id: string; seat_cap: number | null }[],
  ) {
    const next = groups.length
      ? await tx
          .selectFrom('market.public_group_sessions')
          .select(['id', 'group_id', 'starts_at'])
          .where(
            'group_id',
            'in',
            groups.map((g) => g.id),
          )
          .where('starts_at', '>', new Date())
          .where('status', '=', 'scheduled')
          .orderBy('starts_at')
          .execute()
      : [];
    const first = new Map<string, string>();
    for (const s of next) if (!first.has(s.group_id!)) first.set(s.group_id!, s.id!);
    const left = await this.seats.left(
      tx,
      groups.flatMap((g) =>
        first.has(g.id)
          ? [{ id: first.get(g.id)!, groupId: g.id, centreId: g.centre_id, seatCap: g.seat_cap! }]
          : [],
      ),
    );
    return new Map(
      groups.map((g) => [
        g.id,
        (left.get(first.get(g.id) ?? '') ?? 0) > 0 ? ('open' as const) : ('waitlist' as const),
      ]),
    );
  }

  private async stats(tx: Tx, type: 'centre' | 'teacher', ids: string[]) {
    if (!ids.length)
      return new Map<string, { distribution: number[]; tags: { tag: string; count: number }[] }>();
    const rows = await tx
      .selectFrom('market.review_stats')
      .select(['target_id', 'distribution', 'tag_counts'])
      .where('target_type', '=', type)
      .where('target_id', 'in', ids)
      .execute();
    return new Map(
      rows.map((r) => [
        r.target_id,
        { distribution: r.distribution, tags: r.tag_counts as { tag: string; count: number }[] },
      ]),
    );
  }

  centres(q: Query, lang: Lang) {
    return this.db.asAnonymous(async (tx) => {
      const radius = q.radiusKm ?? DEFAULT_RADIUS_KM;
      const gs = (await this.groups(tx, q, lang)).filter((g) => Number(g.distance_km) <= radius);
      const centreIds = [...new Set(gs.map((g) => g.centre_id!))];
      const centres = centreIds.length
        ? await tx
            .selectFrom('market.public_centres')
            .select([
              'id',
              'slug',
              'name',
              'area',
              sql<number>`ST_Y(location::geometry)`.as('lat'),
              sql<number>`ST_X(location::geometry)`.as('lng'),
            ])
            .where('id', 'in', centreIds)
            .execute()
        : [];
      const seat = await this.seatStates(
        tx,
        gs.map((g) => ({ id: g.id!, centre_id: g.centre_id!, seat_cap: g.seat_cap })),
      );
      const stats = await this.stats(tx, 'centre', centreIds);
      let cards = centres.map((c) => {
        const mine = gs.filter((g) => g.centre_id === c.id);
        return {
          id: c.id!,
          slug: c.slug!,
          name: c.name!,
          area: c.area ?? '',
          distanceKm: Number(mine[0]!.distance_km),
          rating: ratingSummary(stats.get(c.id!)?.distribution),
          teacherCount: new Set(mine.map((g) => g.teacher_id)).size,
          fromSessionFee: money(Math.min(...mine.map((g) => Number(g.session_fee_pt)))),
          seatState: mine.some((g) => seat.get(g.id!) === 'open')
            ? ('open' as const)
            : ('waitlist' as const),
          verified: true,
          lat: Number(c.lat),
          lng: Number(c.lng),
        };
      });
      if (q.q) cards = cards.filter((c) => c.name.toLowerCase().includes(q.q!.toLowerCase()));
      if (q.minRating) cards = cards.filter((c) => Number(c.rating?.avg ?? 0) >= q.minRating!);
      if (q.seatsOpen) cards = cards.filter((c) => c.seatState === 'open');
      const sorts = {
        distance: (x: (typeof cards)[0], y: (typeof cards)[0]) =>
          (x.distanceKm ?? 99) - (y.distanceKm ?? 99),
        rating: (x: (typeof cards)[0], y: (typeof cards)[0]) =>
          Number(y.rating?.avg ?? 0) - Number(x.rating?.avg ?? 0),
        fee: (x: (typeof cards)[0], y: (typeof cards)[0]) =>
          (x.fromSessionFee?.amountPt ?? 0) - (y.fromSessionFee?.amountPt ?? 0),
        // Best match (OD-29 open): seats open first, then distance.
        best_match: (x: (typeof cards)[0], y: (typeof cards)[0]) =>
          Number(y.seatState === 'open') - Number(x.seatState === 'open') ||
          (x.distanceKm ?? 99) - (y.distanceKm ?? 99),
      };
      cards.sort(sorts[q.sort ?? 'best_match']);
      const teacherIds = new Set(
        gs.filter((g) => cards.some((c) => c.id === g.centre_id)).map((g) => g.teacher_id),
      );
      return {
        data: cards,
        nextCursor: null,
        totals: { centres: cards.length, teachers: teacherIds.size },
      };
    });
  }

  teachers(q: Query, lang: Lang) {
    return this.db.asAnonymous(async (tx) => {
      const radius = q.radiusKm ?? DEFAULT_RADIUS_KM;
      const gs = (await this.groups(tx, q, lang)).filter((g) => Number(g.distance_km) <= radius);
      const data = await this.teacherCards(tx, gs, lang);
      return {
        data: data.sort((x, y) => Number(y.rating?.avg ?? 0) - Number(x.rating?.avg ?? 0)),
        nextCursor: null,
      };
    });
  }

  private async teacherCards(tx: Tx, gs: Awaited<ReturnType<Search['groups']>>, lang: Lang) {
    const ids = [...new Set(gs.map((g) => g.teacher_id!))];
    if (!ids.length) return [];
    const ts = await tx
      .selectFrom('market.public_teachers')
      .select(['id', 'slug', 'display_name', 'verified'])
      .where('id', 'in', ids)
      .execute();
    const stats = await this.stats(tx, 'teacher', ids);
    return ts.map((t) => {
      const mine = gs.filter((g) => g.teacher_id === t.id);
      return {
        id: t.id!,
        slug: t.slug!,
        displayName: t.display_name!,
        subjects: [...new Set(mine.map((g) => pick(lang, g.subject_en, g.subject_ar)))],
        rating: ratingSummary(stats.get(t.id!)?.distribution),
        fromSessionFee: mine.length
          ? money(Math.min(...mine.map((g) => Number(g.session_fee_pt))))
          : null,
        centreNames: [...new Set(mine.map((g) => g.centre_name!))],
        verified: t.verified ?? false,
      };
    });
  }

  /** GroupSummary (P04, P05, P06): seats left per upcoming session. */
  async groupSummaries(tx: Tx, ids: string[], lang: Lang) {
    if (!ids.length) return [];
    const rows = await tx
      .selectFrom('market.public_groups as g')
      .innerJoin('market.public_teachers as t', 't.id', 'g.teacher_id')
      .innerJoin('market.public_centres as c', 'c.id', 'g.centre_id')
      .innerJoin('ref.subjects as s', 's.id', 'g.subject_id')
      .innerJoin('ref.curricula as cu', 'cu.id', 'g.curriculum_id')
      .innerJoin('ref.school_years as y', 'y.id', 'g.school_year_id')
      .select([
        'g.id',
        'g.weekdays',
        sql<string>`g.start_time::text`.as('start_time'),
        sql<string>`g.end_time::text`.as('end_time'),
        'g.session_fee_pt',
        'g.monthly_fee_pt',
        'g.offers_monthly_recurring',
        'g.seat_cap',
        'g.room_name',
        't.id as teacher_id',
        't.slug as teacher_slug',
        't.display_name',
        'c.id as centre_id',
        'c.slug as centre_slug',
        'c.name as centre_name',
        'c.area',
        'c.address',
        's.id as subject_id',
        's.code as subject_code',
        's.name_en as subject_en',
        's.name_ar as subject_ar',
        'cu.id as curriculum_id',
        'cu.code as curriculum_code',
        'cu.name_en as cur_en',
        'cu.name_ar as cur_ar',
        'y.id as year_id',
        'y.code as year_code',
        'y.name_en as year_en',
        'y.name_ar as year_ar',
        'y.short_name_en',
        'y.short_name_ar',
      ])
      .where('g.id', 'in', ids)
      .execute();
    const sessions = await tx
      .selectFrom('market.public_group_sessions')
      .select(['id', 'group_id', 'starts_at', 'ends_at'])
      .where('group_id', 'in', ids)
      .where('starts_at', '>', new Date())
      .where('status', '=', 'scheduled')
      .orderBy('starts_at')
      .execute();
    const teacherStats = await this.stats(tx, 'teacher', [
      ...new Set(rows.map((r) => r.teacher_id!)),
    ]);
    const upcoming = (gid: string) => sessions.filter((s) => s.group_id === gid).slice(0, 9);
    const left = await this.seats.left(
      tx,
      rows.flatMap((r) =>
        upcoming(r.id!).map((s) => ({
          id: s.id!,
          groupId: r.id!,
          centreId: r.centre_id!,
          seatCap: r.seat_cap!,
        })),
      ),
    );
    const out = rows.map((r) => ({
      id: r.id!,
      teacher: {
        id: r.teacher_id!,
        slug: r.teacher_slug!,
        displayName: r.display_name!,
        rating: ratingSummary(teacherStats.get(r.teacher_id!)?.distribution),
      },
      centre: {
        id: r.centre_id!,
        slug: r.centre_slug!,
        name: r.centre_name!,
        area: r.area ?? '',
        address: r.address ?? '',
      },
      room: { name: r.room_name ?? '' },
      subject: {
        id: r.subject_id,
        code: r.subject_code,
        name: pick(lang, r.subject_en, r.subject_ar),
      },
      curriculum: {
        id: r.curriculum_id,
        code: r.curriculum_code as 'NATIONAL' | 'IGCSE' | 'AMERICAN' | 'NILE',
        name: pick(lang, r.cur_en, r.cur_ar),
      },
      schoolYear: {
        id: r.year_id,
        code: r.year_code,
        name: pick(lang, r.year_en, r.year_ar),
        shortName: pick(lang, r.short_name_en ?? r.year_en, r.short_name_ar ?? r.year_ar),
      },
      weekdays: r.weekdays!,
      startTime: hhmm(r.start_time),
      endTime: hhmm(r.end_time),
      sessionFee: money(Number(r.session_fee_pt)),
      monthlyFee: money(Number(r.monthly_fee_pt)),
      sessionsPerMonth: sessionsPerMonth(r.weekdays!),
      offersMonthlyRecurring: r.offers_monthly_recurring!,
      seatCap: r.seat_cap!,
      status: 'published' as const,
      upcomingSessions: upcoming(r.id!).map((s) => ({
        id: s.id!,
        startsAt: new Date(s.starts_at!).toISOString(),
        endsAt: new Date(s.ends_at!).toISOString(),
        seatCap: r.seat_cap!,
        seatsLeft: left.get(s.id!) ?? r.seat_cap!,
      })),
    }));
    return ids.map((id) => out.find((g) => g.id === id)).filter((g) => g !== undefined);
  }

  group(id: string, lang: Lang) {
    return this.db.asAnonymous(async (tx) => {
      const [g] = await this.groupSummaries(tx, [id], lang);
      if (!g) throw notFound('group');
      return g;
    });
  }

  /** P04 (MKT-DSC-04): a verified centre; `groupsForChild` filtered by the child's year and subject. */
  centreBySlug(slug: string, q: { schoolYearId?: string; subjectId?: string }, lang: Lang) {
    return this.db.asAnonymous(async (tx) => {
      const c = await tx
        .selectFrom('market.public_centres')
        .select([
          'id',
          'slug',
          'name',
          'area',
          'governorate',
          'address',
          'hours',
          'location_status',
          sql<number>`ST_Y(location::geometry)`.as('lat'),
          sql<number>`ST_X(location::geometry)`.as('lng'),
          sql<number>`round((ST_Distance(location, ST_SetSRID(ST_MakePoint(${DEFAULT_POINT.lng}, ${DEFAULT_POINT.lat}), 4326)::geography) / 1000)::numeric, 1)::float8`.as(
            'distance_km',
          ),
        ])
        .where('slug', '=', slug)
        .executeTakeFirst();
      if (!c) throw notFound('centre');
      const gs = await tx
        .selectFrom('market.public_groups as g')
        .innerJoin('ref.subjects as s', 's.id', 'g.subject_id')
        .select([
          'g.id',
          'g.teacher_id',
          'g.subject_id',
          'g.curriculum_id',
          'g.school_year_id',
          's.code',
        ])
        .where('g.centre_id', '=', c.id!)
        .execute();
      const summaries = await this.groupSummaries(
        tx,
        gs.map((g) => g.id!),
        lang,
      );
      const stats = await this.stats(tx, 'centre', [c.id!]);
      const dist = stats.get(c.id!)?.distribution ?? [0, 0, 0, 0, 0];
      const bySubject = new Map<string, typeof summaries>();
      for (const g of summaries) {
        const k = `${g.subject.code}|${g.curriculum.id}`;
        bySubject.set(k, [...(bySubject.get(k) ?? []), g]);
      }
      const sep = lang === 'ar' ? '، ' : ', ';
      const pickCode = q.subjectId
        ? (
            await tx
              .selectFrom('ref.subjects')
              .select('code')
              .where('id', '=', q.subjectId)
              .executeTakeFirst()
          )?.code
        : undefined;
      const teacherGroups = new Map<string, typeof summaries>();
      for (const g of summaries)
        teacherGroups.set(g.teacher.id, [...(teacherGroups.get(g.teacher.id) ?? []), g]);
      const cards = await this.teacherCards(
        tx,
        summaries.map((g) => ({
          id: g.id,
          centre_id: c.id,
          teacher_id: g.teacher.id,
          subject_id: g.subject.id,
          curriculum_id: g.curriculum.id,
          school_year_id: g.schoolYear.id,
          session_fee_pt: String(g.sessionFee.amountPt),
          seat_cap: g.seatCap,
          subject_en: g.subject.name,
          subject_ar: g.subject.name,
          centre_name: c.name,
          distance_km: c.distance_km,
        })) as never,
        lang,
      );
      return {
        id: c.id!,
        slug: c.slug!,
        name: c.name!,
        area: c.area ?? '',
        governorate: c.governorate ?? '',
        address: c.address ?? '',
        distanceKm: Number(c.distance_km),
        verified: true,
        hours: (c.hours as { weekday: number; opens: string; closes: string }[]) ?? [],
        rating: ratingSummary(dist),
        ratingDistribution: dist.map((count, i) => ({ stars: 5 - i, count })),
        trustBadges: ['verified' as const],
        subjects: [...bySubject.values()].map((list) => ({
          subject: list[0]!.subject,
          curriculum: list[0]!.curriculum,
          yearsLabel: [...new Set(list.map((g) => g.schoolYear.shortName))].join(sep),
        })),
        teachers: cards.map((t) => {
          const mine = teacherGroups.get(t.id) ?? [];
          return {
            ...t,
            subjectLabel: `${mine[0]?.subject.name ?? ''} • ${[...new Set(mine.map((g) => g.schoolYear.shortName))].join(sep)}`,
          };
        }),
        reviews: await publicReviews(tx, 'centre', c.id!, lang),
        lat: Number(c.lat),
        lng: Number(c.lng),
        locationUnderReview: c.location_status === 'under_review',
        groupsForChild: summaries.filter(
          (g) =>
            (!q.schoolYearId || g.schoolYear.id === q.schoolYearId) &&
            (!pickCode || g.subject.code === pickCode),
        ),
      };
    });
  }

  /** P05 (MKT-DSC-05): an active teacher, their groups at verified centres within 20 km. */
  teacherBySlug(slug: string, lang: Lang) {
    return this.db.asAnonymous(async (tx) => {
      const t = await tx
        .selectFrom('market.public_teachers')
        .select(['id', 'slug', 'display_name', 'bio_en', 'bio_ar', 'years_experience', 'verified'])
        .where('slug', '=', slug)
        .executeTakeFirst();
      if (!t) throw notFound('teacher');
      const gs = (await this.groups(tx, {}, lang)).filter(
        (g) => g.teacher_id === t.id && Number(g.distance_km) <= 20,
      );
      const groups = await this.groupSummaries(
        tx,
        gs.map((g) => g.id!),
        lang,
      );
      const stats = await this.stats(tx, 'teacher', [t.id!]);
      const subjects = new Map(groups.map((g) => [g.subject.code, g.subject]));
      const curricula = new Map(groups.map((g) => [g.curriculum.id, g.curriculum]));
      return {
        id: t.id!,
        slug: t.slug!,
        displayName: t.display_name!,
        subjects: [...subjects.values()],
        curricula: [...curricula.values()],
        yearsExperience: t.years_experience ?? null,
        bio: pick(lang, t.bio_en, t.bio_ar) || null,
        verified: t.verified ?? false,
        rating: ratingSummary(stats.get(t.id!)?.distribution),
        centreCount: new Set(groups.map((g) => g.centre.id)).size,
        tagCounts: (stats.get(t.id!)?.tags ?? []) as never,
        // Phase 2 badge; the UI hides it while the flag is off.
        recordedPct: null,
        groups,
        reviews: await publicReviews(tx, 'teacher', t.id!, lang),
      };
    });
  }
}

@Controller()
export class SearchController {
  constructor(@Inject(Search) private readonly search: Search) {}

  @Endpoint(routes.searchCentres)
  async centres(
    @CallerLang() lang: Lang,
    @MaybeCaller() p: Principal | null,
    @Input() i: In<typeof routes.searchCentres>,
  ) {
    return this.search.centres({ ...i.query, homeArea: await this.search.homeAreaOf(p) }, lang);
  }

  @Endpoint(routes.searchTeachers)
  async teachers(
    @CallerLang() lang: Lang,
    @MaybeCaller() p: Principal | null,
    @Input() i: In<typeof routes.searchTeachers>,
  ) {
    return this.search.teachers({ ...i.query, homeArea: await this.search.homeAreaOf(p) }, lang);
  }

  @Endpoint(routes.centreBySlug)
  centre(@CallerLang() lang: Lang, @Input() i: In<typeof routes.centreBySlug>) {
    return this.search.centreBySlug(i.params.slug, i.query, lang);
  }

  @Endpoint(routes.teacherBySlug)
  teacher(@CallerLang() lang: Lang, @Input() i: In<typeof routes.teacherBySlug>) {
    return this.search.teacherBySlug(i.params.slug, lang);
  }

  @Endpoint(routes.group)
  group(@CallerLang() lang: Lang, @Input() i: In<typeof routes.group>) {
    return this.search.group(i.params.id, lang);
  }
}
