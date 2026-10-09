// pnpm seed:demo — the connected-story world in Postgres (docs/14 §4). SAMPLE DATA ONLY: every
// person, centre and phone is fictional, and phones only ever reach the local sms-sink.
// It mirrors the mock fixtures (packages/mocks) so the same e2e specs run in mock and live mode:
// same people, same phones, same centres and halls. IDs are deterministic UUIDs derived from the
// mock IDs (`demoId('cen-nour')`), so a reset gives the same IDs every time.
// It WIPES the app tables first, so it refuses to run unless APP_ENV=local.
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { Redis } from 'ioredis';
import * as fx from '@link/mocks/fixtures';
import * as mfx from '@link/mocks/market-fixtures';
import { FieldCipher, LocalKeyWrapper, keyFingerprint, lookupHmac } from '../src/platform/crypto';
import { SLOT_DAYS, SLOT_TIMES, plus2h, sessionTimes } from '../src/market/model';
import { addDays, cairoToUtc, cairoToday } from '../src/platform/time';

export { demoId } from './demo-id';
import { demoId } from './demo-id';

/** Second owner and centre: tenant B for `pnpm test:rls`. */
export const OWNER_B_PHONE = '+201000000007';
const RLS_CENTRE = 'cen-nile';

/** Tables the seed owns, emptied in one statement (CASCADE follows the in-schema FKs). */
const TABLES = [
  'platform.data_keys',
  'market.review_stats',
  'market.group_sessions',
  'market.groups',
  'market.room_booking_slots',
  'market.room_bookings',
  'market.teacher_applications',
  'market.room_open_slots',
  'audit.audit_events',
  'platform.outbox_events',
  'platform.inbox_events',
  'platform.idempotency_keys',
  'platform.feature_flags',
  'ledger.commission_rules',
  'market.rooms',
  'org.consent_events',
  'org.student_guardians',
  'org.students',
  'org.guardians',
  'org.leads',
  'org.verification_checks',
  'org.teacher_subjects',
  'org.teachers',
  'org.centres',
  'identity.devices',
  'identity.auth_sessions',
  'identity.role_assignments',
  'identity.users',
  'ref.subjects',
  'ref.academic_terms',
  'ref.school_years',
  'ref.curricula',
];

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

export async function seedDemo(migratorUrl: string) {
  if (process.env.APP_ENV !== 'local')
    throw new Error('seed:demo wipes the app tables: it runs only with APP_ENV=local.');
  const cipher = new FieldCipher(new LocalKeyWrapper(env('FIELD_KEY_LOCAL')));
  const hmacKey = env('HMAC_KEY_LOOKUP');
  const phone = (e164: string) => ({
    phone_hmac: lookupHmac(hmacKey, e164),
    phone_enc: cipher.encrypt(e164),
    phone_last4: e164.slice(-4),
  });

  const db = new Kysely<Record<string, Record<string, unknown>>>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: migratorUrl, max: 1 }) }),
  });
  const counts: Record<string, number> = {};
  const put = async (table: string, rows: Record<string, unknown>[]) => {
    if (rows.length) await db.insertInto(table).values(rows).execute();
    counts[table] = (counts[table] ?? 0) + rows.length;
  };

  try {
    await sql`TRUNCATE ${sql.raw(TABLES.join(', '))} CASCADE`.execute(db);

    // ── Reference data (confirmed = false until OD-07) ──────────────────────────
    await put(
      'ref.curricula',
      fx.curricula.map((c, i) => ({
        id: demoId(c.id),
        code: c.code,
        name_en: c.name.en,
        name_ar: c.name.ar,
        position: i + 1,
      })),
    );
    await put(
      'ref.school_years',
      fx.schoolYears.map((y, i) => ({
        id: demoId(y.id),
        curriculum_id: demoId(y.curriculumId),
        code: y.code,
        name_en: y.name.en,
        name_ar: y.name.ar,
        short_name_en: y.short.en,
        short_name_ar: y.short.ar,
        position: i + 1,
      })),
    );
    // The mock lists subjects without a year; in the schema a subject belongs to one curriculum
    // and year (06 §2), so every year gets every sample subject.
    await put(
      'ref.subjects',
      fx.schoolYears.flatMap((y) =>
        fx.subjects.map((s) => ({
          id: y.id === fx.schoolYears[0]!.id ? demoId(s.id) : demoId(`${s.id}:${y.id}`),
          curriculum_id: demoId(y.curriculumId),
          school_year_id: demoId(y.id),
          code: s.code,
          name_en: s.name.en,
          name_ar: s.name.ar,
        })),
      ),
    );
    const subjectRow = (subjectId: string, yearId: string) =>
      yearId === fx.schoolYears[0]!.id ? demoId(subjectId) : demoId(`${subjectId}:${yearId}`);
    await put('ref.academic_terms', [
      {
        id: demoId('term-2026-t1'),
        academic_year: '2026/27',
        code: 'T1',
        name_en: 'Term 1',
        name_ar: 'الترم الأول',
        starts_on: '2026-09-20',
        ends_on: '2027-01-21',
      },
      {
        id: demoId('term-2026-t2'),
        academic_year: '2026/27',
        code: 'T2',
        name_en: 'Term 2',
        name_ar: 'الترم الثاني',
        starts_on: '2027-02-06',
        ends_on: '2027-06-10',
      },
    ]);

    // ── People (same phones as the mock; code 123456 there, sms-sink here) ──────
    const ownerB = demoId('usr-owner-b');
    await put('identity.users', [
      {
        id: demoId(fx.parent.id),
        ...phone(fx.PARENT_PHONE),
        name: fx.parent.name.ar,
        language: 'ar',
      },
      ...fx.staff.map((u) => ({
        id: demoId(u.id),
        ...phone(u.phone),
        name: u.name.ar,
        language: 'ar',
      })),
      { id: ownerB, ...phone(OWNER_B_PHONE), name: 'مالك تجريبي (ب)', language: 'ar' },
      // Teachers in the search results without a sample account of their own.
      ...fx.teachers
        .filter((t) => !fx.staff.some((u) => u.teacherId === t.id))
        .map((t, i) => ({
          id: demoId(`usr-${t.id}`),
          ...phone(`+2010000001${String(i + 1).padStart(2, '0')}`),
          name: t.name.ar,
          language: 'ar',
        })),
    ]);
    const teacherUser = (teacherId: string) =>
      demoId(fx.staff.find((u) => u.teacherId === teacherId)?.id ?? `usr-${teacherId}`);

    // ── Centres, halls, teachers ─────────────────────────────────────────────────
    const ownerOf = (centreId: string) =>
      centreId === 'cen-nour'
        ? demoId('usr-owner')
        : centreId === RLS_CENTRE
          ? ownerB
          : demoId(`usr-owner-${centreId}`);
    // Centres other than Al Nour and Nile Academy have no sample owner account: an owner row
    // without a phone the demo uses (they exist so search has results in R2).
    const extraOwners = fx.centres
      .filter((c) => c.id !== 'cen-nour' && c.id !== RLS_CENTRE)
      .map((c, i) => ({
        id: ownerOf(c.id),
        ...phone(`+2010000002${String(i + 1).padStart(2, '0')}`),
        name: null,
        language: 'ar',
      }));
    await put('identity.users', extraOwners);
    await put(
      'org.centres',
      fx.centres.map((c) => ({
        id: demoId(c.id),
        owner_id: ownerOf(c.id),
        name: c.name.ar,
        slug: c.slug,
        about_en: mfx.centreExtra[c.id]?.about.en ?? null,
        about_ar: mfx.centreExtra[c.id]?.about.ar ?? null,
        photos: JSON.stringify(
          Array.from({ length: mfx.centreExtra[c.id]?.photos ?? 0 }, (_, i) => ({ sample: i })),
        ),
        // MKT-HAL-05: off by default; the rules are Figma C05's.
        settings: JSON.stringify({
          autoApprove: { enabled: false, verifiedId: true, minRating: 4.5, fitsCapacity: true },
          shareAttendanceWithParents: false,
        }),
        governorate: c.governorate.ar,
        area: c.area.ar,
        address: c.address.ar,
        location: `SRID=4326;POINT(${c.lng} ${c.lat})`,
        hours: JSON.stringify(c.hours),
        verification: c.verified ? 'verified' : 'pending',
        verified_at: c.verified ? '2026-09-01T10:00:00Z' : null,
      })),
    );
    await put(
      'market.rooms',
      mfx.halls.map((h) => ({
        id: demoId(h.id),
        centre_id: demoId(h.centreId),
        name: h.name.ar,
        capacity: h.capacity,
        facilities: h.facilities,
        rent_rule: JSON.stringify(
          h.rule.basis === 'percent_of_fees'
            ? { type: 'percent_of_fees', pct: Number(h.rule.percent).toFixed(2) }
            : h.rule.basis === 'per_student_per_session'
              ? {
                  type: 'per_student_per_session',
                  amountPt: h.rule.amountPt,
                  countBasis: 'enrolled',
                }
              : { type: 'fixed_per_session', amountPt: h.rule.amountPt },
        ),
        listed: h.listed,
        photo: h.photo,
      })),
    );
    // The weekly grid of every hall (C05); the owner's closed slots are not offered.
    await put(
      'market.room_open_slots',
      mfx.halls.flatMap((h) =>
        SLOT_DAYS.flatMap((weekday) =>
          SLOT_TIMES.map((start) => ({
            id: demoId(`slot:${h.id}:${weekday}:${start}`),
            room_id: demoId(h.id),
            centre_id: demoId(h.centreId),
            weekday,
            start_time: start,
            end_time: plus2h(start),
            listed: !h.closed.includes(`${weekday}|${start}`),
          })),
        ),
      ),
    );
    await put(
      'org.teachers',
      fx.teachers.map((t) => ({
        id: demoId(t.id),
        user_id: teacherUser(t.id),
        display_name: t.name.ar,
        slug: t.slug,
        bio_en: t.bio.en,
        bio_ar: t.bio.ar,
        years_experience: t.yearsExperience,
        verification: t.verified ? 'verified' : 'pending',
        verified_at: t.verified ? '2026-09-02T10:00:00Z' : null,
        open_to_slots: mfx.teacherSelf[t.id]?.openToSlots ?? true,
        availability: JSON.stringify(mfx.teacherSelf[t.id]?.availability ?? []),
        settings: JSON.stringify({ reviewEachEnrolment: t.reviewEachEnrolment }),
        profile_status: 'active',
      })),
    );
    // Room applicants (C06): sample teachers with no group yet, so not in the parent directory.
    await put(
      'identity.users',
      mfx.applicants.map((a, i) => ({
        id: demoId(`usr-${a.id}`),
        ...phone(`+2010000003${String(i + 1).padStart(2, '0')}`),
        name: a.name.ar,
        language: 'ar',
      })),
    );
    await put(
      'org.teachers',
      mfx.applicants.map((a) => ({
        id: demoId(a.id),
        user_id: demoId(`usr-${a.id}`),
        display_name: a.name.ar,
        slug: a.id,
        verification: a.verifiedId ? 'verified' : 'pending',
        open_to_slots: true,
        profile_status: 'active',
      })),
    );
    // What each teacher teaches: the subject of every group they have.
    await put(
      'org.teacher_subjects',
      [
        ...new Set(
          fx.groups.map((g) => `${g.teacherId}|${subjectRow(g.subjectId, g.schoolYearId)}`),
        ),
        ...mfx.applicants.map((a) => `${a.id}|${subjectRow(a.subjectId, 'sy-sec2')}`),
      ].map((k) => ({ teacher_id: demoId(k.split('|')[0]!), subject_id: k.split('|')[1]! })),
    );
    // Ms Salma's checks (J04): degree verified, one reference of two.
    await put('org.verification_checks', [
      {
        id: demoId('vc-salma-degree'),
        subject_type: 'teacher',
        subject_id: demoId('tch-salma'),
        check_code: 'degree',
        status: 'done',
        done_at: '2026-09-02T10:00:00Z',
      },
      {
        id: demoId('vc-salma-ref1'),
        subject_type: 'teacher',
        subject_id: demoId('tch-salma'),
        check_code: 'reference',
        status: 'done',
        done_at: '2026-09-02T10:00:00Z',
      },
    ]);
    // Ratings (BR-REV-07): the fixtures' published-review distributions (reviews themselves: R2b).
    const toDist = (rating: number | null, count: number) => {
      if (rating === null || !count) return [0, 0, 0, 0, 0];
      const five = Math.round((rating - 4) * count);
      return [five, count - five, 0, 0, 0];
    };
    await put('market.review_stats', [
      ...fx.centres.map((c) => ({
        target_type: 'centre',
        target_id: demoId(c.id),
        distribution: c.ratingDist,
      })),
      ...fx.teachers.map((t) => ({
        target_type: 'teacher',
        target_id: demoId(t.id),
        distribution: t.ratingDist,
        tag_counts: JSON.stringify(t.tagCounts),
      })),
      ...mfx.applicants.map((a) => ({
        target_type: 'teacher',
        target_id: demoId(a.id),
        distribution: toDist(a.rating, a.reviewCount),
      })),
    ]);

    // ── Bookings and groups (the fixture groups, and the C06 pipeline) ─────────
    const today = cairoToday();
    const hallOf = (g: (typeof fx.groups)[number]) =>
      mfx.halls.find((h) => h.centreId === g.centreId && h.roomLabel === g.room.en);
    const ruleOf = (h: (typeof mfx.halls)[number]) =>
      h.rule.basis === 'percent_of_fees'
        ? { type: 'percent_of_fees', pct: Number(h.rule.percent).toFixed(2) }
        : h.rule.basis === 'per_student_per_session'
          ? { type: 'per_student_per_session', amountPt: h.rule.amountPt, countBasis: 'enrolled' }
          : { type: 'fixed_per_session', amountPt: h.rule.amountPt };
    const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const bookings: Record<string, unknown>[] = [];
    const bookingSlots: Record<string, unknown>[] = [];
    const addBooking = (
      key: string,
      h: (typeof mfx.halls)[number],
      teacherKey: string,
      slots: { weekday: number; start: string; end: string }[],
      startsOn: string,
      applicationId: string | null,
    ) => {
      const id = demoId(key);
      bookings.push({
        id,
        room_id: demoId(h.id),
        centre_id: demoId(h.centreId),
        teacher_id: demoId(teacherKey),
        application_id: applicationId,
        weekly_slots: JSON.stringify(slots),
        rent_rule: JSON.stringify(ruleOf(h)),
        starts_on: startsOn,
      });
      for (const s of slots)
        bookingSlots.push({
          booking_id: id,
          room_id: demoId(h.id),
          centre_id: demoId(h.centreId),
          weekday: s.weekday,
          minutes: `[${minutes(s.start)},${minutes(s.end)})`,
          active_dates: `[${startsOn},)`,
        });
      return id;
    };
    const groupRows: Record<string, unknown>[] = [];
    const sessionRows: Record<string, unknown>[] = [];
    for (const g of fx.groups) {
      const h = hallOf(g);
      if (!h) continue;
      const startsOn = addDays(today, -35);
      const bookingId = addBooking(
        `bk-${g.id}`,
        h,
        g.teacherId,
        g.weekdays.map((weekday) => ({ weekday, start: g.startTime, end: g.endTime })),
        startsOn,
        null,
      );
      groupRows.push({
        id: demoId(g.id),
        teacher_id: demoId(g.teacherId),
        centre_id: demoId(g.centreId),
        room_booking_id: bookingId,
        subject_id: subjectRow(g.subjectId, g.schoolYearId),
        curriculum_id: demoId(g.curriculumId),
        school_year_id: demoId(g.schoolYearId),
        weekdays: g.weekdays,
        start_time: g.startTime,
        end_time: g.endTime,
        seat_cap: g.seatCap,
        monthly_fee_pt: g.monthlyFeePt,
        session_fee_pt: g.sessionFeePt,
        offers_monthly_recurring: g.offersMonthlyRecurring,
        starts_on: startsOn,
      });
      for (const s of sessionTimes({
        weekdays: g.weekdays,
        startTime: g.startTime,
        endTime: g.endTime,
        startsOn,
      }))
        sessionRows.push({
          id: demoId(`ses:${g.id}:${s.date}`),
          group_id: demoId(g.id),
          centre_id: demoId(g.centreId),
          starts_at: s.startsAt,
          ends_at: s.endsAt,
          // Past sessions took place (the held job marks them; the seed writes them so).
          status: new Date(s.endsAt) < new Date() ? 'held' : 'scheduled',
          status_changed_at: new Date(s.endsAt) < new Date() ? s.endsAt : null,
        });
    }
    const applications = mfx.requests.map((r) => {
      const h = mfx.halls.find((x) => x.id === r.hallId)!;
      return {
        id: demoId(r.id),
        teacher_id: demoId(r.teacherKey),
        centre_id: demoId(h.centreId),
        room_id: demoId(h.id),
        subject_id: subjectRow(r.subjectId, r.schoolYearId),
        requested_slots: JSON.stringify(
          r.weekdays.map((weekday) => ({ weekday, start: r.start, end: r.end })),
        ),
        expected_students: r.expectedStudents,
        starts_on: addDays(today, r.startsInDays),
        stage: r.stage,
        scheduled_contact_at: r.stageAt
          ? cairoToUtc(addDays(today, r.stageAt.inDays), r.stageAt.time)
          : null,
        created_at: cairoToUtc(addDays(today, -r.createdDaysAgo), '10:00'),
      };
    });
    await put('market.teacher_applications', applications);
    const approvedBookings: [string, string][] = [];
    for (const r of mfx.requests.filter((x) => x.stage === 'approved')) {
      const h = mfx.halls.find((x) => x.id === r.hallId)!;
      const id = addBooking(
        `bk-${r.id}`,
        h,
        r.teacherKey,
        r.weekdays.map((weekday) => ({ weekday, start: r.start, end: r.end })),
        addDays(today, r.startsInDays),
        demoId(r.id),
      );
      approvedBookings.push([demoId(r.id), id]);
    }
    await put('market.room_bookings', bookings);
    await put('market.room_booking_slots', bookingSlots);
    for (const [applicationId, bookingId] of approvedBookings)
      await db
        .updateTable('market.teacher_applications')
        .set({ room_booking_id: bookingId })
        .where('id', '=', applicationId)
        .execute();
    await put('market.groups', groupRows);
    await put('market.group_sessions', sessionRows);

    // ── Roles ────────────────────────────────────────────────────────────────────
    const role = (key: string, userId: string, r: string, extra: Record<string, unknown> = {}) => ({
      id: demoId(`role:${key}`),
      user_id: userId,
      role: r,
      ...extra,
    });
    await put('identity.role_assignments', [
      role('parent', demoId(fx.parent.id), 'parent'),
      ...fx.staff.map((u) =>
        u.role === 'teacher'
          ? role(u.id, demoId(u.id), 'teacher', { teacher_id: demoId(u.teacherId!) })
          : u.role === 'centre_owner'
            ? role(u.id, demoId(u.id), 'centre_owner', { centre_id: demoId('cen-nour') })
            : // Reception at Al Nour: the marketplace permissions of A16 (MKT-ACC-06 AC1).
              role(u.id, demoId(u.id), 'centre_staff', {
                centre_id: demoId('cen-nour'),
                permissions: ['bookings.manage', 'reviews.reply'],
              }),
      ),
      role('owner-b', ownerB, 'centre_owner', { centre_id: demoId(RLS_CENTRE) }),
      ...extraOwners.map((o, i) =>
        role(`owner-extra-${i}`, o.id, 'centre_owner', {
          centre_id: demoId(
            fx.centres.filter((c) => c.id !== 'cen-nour' && c.id !== RLS_CENTRE)[i]!.id,
          ),
        }),
      ),
      ...fx.teachers
        .filter((t) => !fx.staff.some((u) => u.teacherId === t.id))
        .map((t) =>
          role(`teacher-${t.id}`, teacherUser(t.id), 'teacher', { teacher_id: demoId(t.id) }),
        ),
      ...mfx.applicants.map((a) =>
        role(`teacher-${a.id}`, demoId(`usr-${a.id}`), 'teacher', { teacher_id: demoId(a.id) }),
      ),
    ]);

    // ── The sample parent's children (Mariam and Youssef) ────────────────────────
    const guardian = demoId('gdn-parent');
    await put('org.guardians', [{ id: guardian, user_id: demoId(fx.parent.id) }]);
    await put(
      'org.students',
      fx.children.map((c) => ({
        id: demoId(c.id),
        display_name: c.name.ar,
        curriculum_id: demoId(c.curriculumId),
        school_year_id: demoId(c.schoolYearId),
        created_by_guardian_id: guardian,
      })),
    );
    await put(
      'org.student_guardians',
      fx.children.map((c) => ({
        student_id: demoId(c.id),
        guardian_id: guardian,
        relation: 'father',
        consent_version: 'draft-2026-10',
        consent_at: '2026-09-01T09:00:00Z',
      })),
    );
    await put(
      'org.consent_events',
      fx.children.map((c) => ({
        id: demoId(`consent:${c.id}`),
        user_id: demoId(fx.parent.id),
        guardian_id: guardian,
        student_id: demoId(c.id),
        kind: 'child_data_processing',
        granted: true,
        version: 'draft-2026-10',
        source: 'add_child',
      })),
    );

    // ── Money rules and flags ────────────────────────────────────────────────────
    // Commission defaults (OD-01, OD-02): global, 5% each. Rates live only here, never in code.
    await put('ledger.commission_rules', [
      {
        id: demoId('rule-rent-fee'),
        kind: 'rent_fee',
        rate_pct: '5.00',
        valid_from: '2026-01-01',
        reason: 'Default (OD-01)',
      },
      {
        id: demoId('rule-booking-commission'),
        kind: 'booking_commission',
        rate_pct: '5.00',
        valid_from: '2026-01-01',
        reason: 'Default (OD-02)',
      },
    ]);
    // Marketplace on; Phase 2–3 surfaces and the Follow-up extra off until switched (docs/14 §4).
    await put('platform.feature_flags', [
      { key: 'marketplace.enabled', scope_type: 'global', enabled: true },
      ...[
        'followup.owner_nav',
        'followup.records',
        'followup.voice_notes',
        'followup.whatsapp_updates',
        'parent.updates_feed',
        'teacher.recorded_badge',
        'analytics.topic_scores',
        'analytics.focus_plans',
        'landing.phase2_sections',
        'ai.review_moderation',
      ].map((key) => ({ key, scope_type: 'global', enabled: false })),
      // OD-58: the Follow-up paid extra is on for Al Nour in the demo (as in the mock).
      { key: 'followup.extra', scope_type: 'centre', scope_id: demoId('cen-nour'), enabled: true },
    ]);
    // docs/10 §5: which keys wrote this data (checked at start-up).
    await put('platform.data_keys', [
      { purpose: 'field', key_id: cipher.keyId },
      { purpose: 'lookup', key_id: keyFingerprint(hmacKey) },
    ]);
  } finally {
    await db.destroy();
  }

  // Codes, rate limits and idempotency keys of the old world go too.
  for (const url of [process.env.REDIS_STATE_URL, process.env.REDIS_CACHE_URL]) {
    if (!url) continue;
    const r = new Redis(url, { maxRetriesPerRequest: 1 });
    try {
      let cursor = '0';
      do {
        const [next, keys] = await r.scan(
          cursor,
          'MATCH',
          `${process.env.APP_ENV}:*`,
          'COUNT',
          500,
        );
        if (keys.length) await r.del(...keys);
        cursor = next;
      } while (cursor !== '0');
    } finally {
      r.disconnect();
    }
  }
  return { ok: true, counts };
}

// Run directly: `pnpm seed:demo`.
if (process.argv[1] && /seeds[\\/]demo\.ts$/.test(process.argv[1])) {
  // `pnpm seed:demo` fills an empty database; `--reset` wipes your local data first.
  if (!process.argv.includes('--reset')) {
    const c = new pg.Client({ connectionString: env('DATABASE_URL_MIGRATOR') });
    await c.connect();
    const { rows } = await c.query('SELECT count(*)::int AS n FROM identity.users');
    await c.end();
    if (rows[0].n > 0) {
      console.log(
        `The database has data (${rows[0].n} users). pnpm seed:demo --reset wipes it and loads the demo world again.`,
      );
      process.exit(0);
    }
  }
  const { counts } = await seedDemo(env('DATABASE_URL_MIGRATOR'));
  console.log('Demo world seeded (sample data only):');
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(28)} ${n}`);
}
