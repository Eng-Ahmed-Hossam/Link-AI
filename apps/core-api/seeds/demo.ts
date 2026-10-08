// pnpm seed:demo — the connected-story world in Postgres (docs/14 §4). SAMPLE DATA ONLY: every
// person, centre and phone is fictional, and phones only ever reach the local sms-sink.
// It mirrors the mock fixtures (packages/mocks) so the same e2e specs run in mock and live mode:
// same people, same phones, same centres and halls. IDs are deterministic UUIDs derived from the
// mock IDs (`demoId('cen-nour')`), so a reset gives the same IDs every time.
// It WIPES the app tables first, so it refuses to run unless APP_ENV=local.
import { createHash } from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { Redis } from 'ioredis';
import * as fx from '@link/mocks/fixtures';
import { halls } from '@link/mocks/market-fixtures';
import { FieldCipher, LocalKeyWrapper, lookupHmac } from '../src/platform/crypto';

/** Deterministic UUID for a fixture ID (v4 layout; sample data only). */
export function demoId(key: string) {
  const h = createHash('sha256').update(`link-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16]!, 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Second owner and centre: tenant B for `pnpm test:rls`. */
export const OWNER_B_PHONE = '+201000000007';
const RLS_CENTRE = 'cen-nile';

/** Tables the seed owns, emptied in one statement (CASCADE follows the in-schema FKs). */
const TABLES = [
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
          id: demoId(`${s.id}:${y.id}`),
          curriculum_id: demoId(y.curriculumId),
          school_year_id: demoId(y.id),
          code: s.code,
          name_en: s.name.en,
          name_ar: s.name.ar,
        })),
      ),
    );
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
        about_en: null,
        about_ar: null,
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
      halls.map((h) => ({
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
      })),
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
        open_to_slots: true,
        settings: JSON.stringify({ reviewEachEnrolment: t.reviewEachEnrolment }),
      })),
    );

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
  const { counts } = await seedDemo(env('DATABASE_URL_MIGRATOR'));
  console.log('Demo world seeded (sample data only):');
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(28)} ${n}`);
}
