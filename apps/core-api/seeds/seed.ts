// pnpm db:seed — docs/14 §4. Synthetic data only: every person, centre and phone below is fictional.
// Phone numbers are placeholders that only ever reach the local sms-sink; nothing is sent.
// Idempotent: fixed IDs + ON CONFLICT DO NOTHING, so it can run on every reset.
// Runs as app_migrator (the table owner), so RLS does not apply here.
import pg from 'pg';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) throw new Error('DATABASE_URL_MIGRATOR is not set');

// Readable fixed UUIDs: 00000000-0000-7000-8000-<hex kind><n>, e.g. centre 1 = …-8000-a00000000001.
const KIND: Record<string, string> = {
  c: 'c0', // curricula
  y: 'c1', // school years
  t: 'c2', // academic terms
  s: 'c3', // subjects
  u: 'b0', // users
  g: 'b1', // role assignments
  a: 'a0', // centres
  r: 'a1', // rooms (halls)
  e: 'e0', // teachers
  k: 'f0', // commission rules
};
const id = (kind: string, n: number) => {
  const p = KIND[kind]!;
  return `00000000-0000-7000-8000-${p}${String(n).padStart(12 - p.length, '0')}`;
};

type Row = Record<string, unknown>;
async function insert(c: pg.Client, table: string, rows: Row[], conflict = '(id)') {
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map((_, i) => `$${i + 1}`);
    await c.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT ${conflict} DO NOTHING`,
      cols.map((k) => row[k]),
    );
  }
  return rows.length;
}

// ── Reference data (confirmed = false until OD-07) ────────────────────────────
const CUR = { NATIONAL: id('c', 1), IGCSE: id('c', 2), AMERICAN: id('c', 3), NILE: id('c', 4) };
const curricula = [
  {
    id: CUR.NATIONAL,
    code: 'NATIONAL',
    name_en: 'National (public / government)',
    name_ar: 'المنهج الوطني (الحكومي)',
    position: 1,
  },
  {
    id: CUR.IGCSE,
    code: 'IGCSE',
    name_en: 'IGCSE (British)',
    name_ar: 'المنهج البريطاني IGCSE',
    position: 2,
  },
  {
    id: CUR.AMERICAN,
    code: 'AMERICAN',
    name_en: 'American',
    name_ar: 'المنهج الأمريكي',
    position: 3,
  },
  { id: CUR.NILE, code: 'NILE', name_en: 'Nile', name_ar: 'منهج النيل', position: 4 },
];

const ordAr = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
const schoolYears: Row[] = [];
let sy = 0;
const addYear = (curriculum: string, code: string, en: string, ar: string, position: number) =>
  schoolYears.push({
    id: id('y', ++sy),
    curriculum_id: curriculum,
    code,
    name_en: en,
    name_ar: ar,
    position,
  });
for (let i = 1; i <= 6; i++)
  addYear(CUR.NATIONAL, `P${i}`, `Primary ${i}`, `الصف ${ordAr[i - 1]} الابتدائي`, i);
for (let i = 1; i <= 3; i++)
  addYear(CUR.NATIONAL, `PREP${i}`, `Preparatory ${i}`, `الصف ${ordAr[i - 1]} الإعدادي`, 6 + i);
for (let i = 1; i <= 3; i++)
  addYear(CUR.NATIONAL, `SEC${i}`, `Secondary ${i}`, `الصف ${ordAr[i - 1]} الثانوي`, 9 + i);
for (let i = 7; i <= 13; i++) addYear(CUR.IGCSE, `Y${i}`, `Year ${i}`, `السنة ${i}`, i);
for (let i = 1; i <= 12; i++) addYear(CUR.AMERICAN, `G${i}`, `Grade ${i}`, `الصف ${i}`, i);
// NILE years: TBD with the education advisor (glossary, OD-07). None seeded.
const yearId = (curriculum: string, code: string) =>
  schoolYears.find((y) => y.curriculum_id === curriculum && y.code === code)!.id as string;

const terms = [
  {
    id: id('t', 1),
    academic_year: '2026/27',
    code: 'T1',
    name_en: 'Term 1',
    name_ar: 'الترم الأول',
    starts_on: '2026-09-20',
    ends_on: '2027-01-21',
  },
  {
    id: id('t', 2),
    academic_year: '2026/27',
    code: 'T2',
    name_en: 'Term 2',
    name_ar: 'الترم الثاني',
    starts_on: '2027-02-06',
    ends_on: '2027-06-10',
  },
];

const subjectDefs: [string, string, string, string, string][] = [
  // curriculum, year, code, en, ar
  [CUR.NATIONAL, 'SEC2', 'MATH', 'Maths', 'الرياضيات'],
  [CUR.NATIONAL, 'SEC2', 'PHYS', 'Physics', 'الفيزياء'],
  [CUR.NATIONAL, 'SEC2', 'ENG', 'English', 'اللغة الإنجليزية'],
  [CUR.NATIONAL, 'PREP3', 'MATH', 'Maths', 'الرياضيات'],
  [CUR.IGCSE, 'Y10', 'MATH', 'Maths', 'الرياضيات'],
  [CUR.IGCSE, 'Y10', 'PHYS', 'Physics', 'الفيزياء'],
  [CUR.AMERICAN, 'G10', 'MATH', 'Maths', 'الرياضيات'],
  [CUR.AMERICAN, 'G10', 'PHYS', 'Physics', 'الفيزياء'],
];
const subjects = subjectDefs.map(([curriculum, year, code, en, ar], i) => ({
  id: id('s', i + 1),
  curriculum_id: curriculum,
  school_year_id: yearId(curriculum, year),
  code,
  name_en: en,
  name_ar: ar,
}));
const subjectId = (curriculum: string, year: string, code: string) =>
  subjects.find(
    (s) =>
      s.curriculum_id === curriculum &&
      s.school_year_id === yearId(curriculum, year) &&
      s.code === code,
  )!.id;

// ── People (one per app role, plus a second owner for the RLS test and two ops users) ──
const U = {
  parent: id('u', 1),
  teacherMona: id('u', 2),
  teacherKarim: id('u', 3),
  teacherHala: id('u', 4),
  ownerA: id('u', 5),
  staffA: id('u', 6),
  ownerB: id('u', 7),
  opsAgent: id('u', 8),
  opsFinance: id('u', 9),
};
const users = [
  {
    id: U.parent,
    phone_e164: '+201000000001',
    name: 'Salma Fathy (sample parent)',
    language: 'ar',
  },
  { id: U.teacherMona, phone_e164: '+201000000002', name: 'منى عادل', language: 'ar' },
  { id: U.teacherKarim, phone_e164: '+201000000003', name: 'Karim Saleh', language: 'en' },
  { id: U.teacherHala, phone_e164: '+201000000004', name: 'هالة نبيل', language: 'ar' },
  {
    id: U.ownerA,
    phone_e164: '+201000000005',
    name: 'Hossam Ragab (sample owner)',
    language: 'ar',
  },
  { id: U.staffA, phone_e164: '+201000000006', name: 'Nada Samir (sample staff)', language: 'ar' },
  {
    id: U.ownerB,
    phone_e164: '+201000000007',
    name: 'Tarek Lotfy (sample owner B)',
    language: 'en',
  },
  { id: U.opsAgent, phone_e164: '+201000000008', name: 'Ops Agent (sample)', language: 'en' },
  { id: U.opsFinance, phone_e164: '+201000000009', name: 'Ops Finance (sample)', language: 'en' },
];

// ── Centres in Maadi, Cairo (fictional) ──────────────────────────────────────
const C = { nour: id('a', 1), daralelm: id('a', 2) };
const point = (lat: number, lng: number) => `SRID=4326;POINT(${lng} ${lat})`;
const hours = JSON.stringify(
  [6, 7, 1, 2, 3, 4].map((weekday) => ({ weekday, opens: '14:00', closes: '22:00' })), // Sat–Thu
);
const centres = [
  {
    id: C.nour,
    owner_id: U.ownerA,
    name: 'Al Nour Centre',
    slug: 'al-nour-maadi',
    about_en: 'Sample centre for local development.',
    about_ar: 'مركز تجريبي للتطوير المحلي.',
    governorate: 'Cairo',
    area: 'Maadi',
    address: 'Road 9, Maadi (sample)',
    location: point(29.9602, 31.2569),
    hours,
    verification: 'verified',
    verified_at: '2026-09-01T10:00:00Z',
  },
  {
    id: C.daralelm,
    owner_id: U.ownerB,
    name: 'Dar El Elm Centre',
    slug: 'dar-el-elm-maadi',
    about_en: 'Second sample centre (tenant B for the RLS test).',
    about_ar: 'مركز تجريبي ثانٍ.',
    governorate: 'Cairo',
    area: 'Maadi',
    address: 'Road 233, Degla (sample)',
    location: point(29.9588, 31.2775),
    hours,
    verification: 'pending',
  },
];

const rooms = [
  {
    id: id('r', 1),
    centre_id: C.nour,
    name: 'Hall A',
    capacity: 40,
    facilities: ['ac', 'smart_board'],
    rent_rule: JSON.stringify({ type: 'fixed_per_session', amountPt: 25000 }),
    listed: true,
  },
  {
    id: id('r', 2),
    centre_id: C.nour,
    name: 'Hall B',
    capacity: 24,
    facilities: ['ac', 'whiteboard'],
    rent_rule: JSON.stringify({
      type: 'per_student_per_session',
      amountPt: 1500,
      countBasis: 'enrolled',
    }),
    listed: true,
  },
  {
    id: id('r', 3),
    centre_id: C.daralelm,
    name: 'Hall 1',
    capacity: 30,
    facilities: ['fan', 'whiteboard'],
    rent_rule: JSON.stringify({ type: 'percent_of_fees', pct: '20.00' }),
    listed: false,
  },
];

const T = { mona: id('e', 1), karim: id('e', 2), hala: id('e', 3) };
const teachers = [
  {
    id: T.mona,
    user_id: U.teacherMona,
    display_name: 'منى عادل',
    slug: 'mona-adel-maths',
    years_experience: 9,
    bio_en: 'Sample maths teacher.',
    bio_ar: 'معلّمة رياضيات (بيانات تجريبية).',
    verification: 'verified',
    verified_at: '2026-09-02T10:00:00Z',
    open_to_slots: true,
  },
  {
    id: T.karim,
    user_id: U.teacherKarim,
    display_name: 'Karim Saleh',
    slug: 'karim-saleh-physics',
    years_experience: 6,
    bio_en: 'Sample physics teacher.',
    bio_ar: 'معلّم فيزياء (بيانات تجريبية).',
    verification: 'verified',
    verified_at: '2026-09-03T10:00:00Z',
    open_to_slots: true,
  },
  {
    id: T.hala,
    user_id: U.teacherHala,
    display_name: 'هالة نبيل',
    slug: 'hala-nabil-english',
    years_experience: 3,
    bio_en: 'Sample English teacher.',
    bio_ar: 'معلّمة لغة إنجليزية (بيانات تجريبية).',
    verification: 'pending',
    open_to_slots: false,
  },
];
const teacherSubjects = [
  { teacher_id: T.mona, subject_id: subjectId(CUR.NATIONAL, 'SEC2', 'MATH') },
  { teacher_id: T.mona, subject_id: subjectId(CUR.IGCSE, 'Y10', 'MATH') },
  { teacher_id: T.karim, subject_id: subjectId(CUR.IGCSE, 'Y10', 'PHYS') },
  { teacher_id: T.karim, subject_id: subjectId(CUR.AMERICAN, 'G10', 'PHYS') },
  { teacher_id: T.hala, subject_id: subjectId(CUR.NATIONAL, 'SEC2', 'ENG') },
];

const roles = [
  { id: id('g', 1), user_id: U.parent, role: 'parent' },
  { id: id('g', 2), user_id: U.teacherMona, role: 'teacher', teacher_id: T.mona },
  { id: id('g', 3), user_id: U.teacherKarim, role: 'teacher', teacher_id: T.karim },
  { id: id('g', 4), user_id: U.teacherHala, role: 'teacher', teacher_id: T.hala },
  { id: id('g', 5), user_id: U.ownerA, role: 'centre_owner', centre_id: C.nour },
  {
    id: id('g', 6),
    user_id: U.staffA,
    role: 'centre_staff',
    centre_id: C.nour,
    permissions: ['bookings.manage', 'reviews.reply'],
  },
  { id: id('g', 7), user_id: U.ownerB, role: 'centre_owner', centre_id: C.daralelm },
  // OD-37 bundles. Ops sign in through SSO (oidc-stub), never phone OTP (MKT-OPS-08).
  {
    id: id('g', 8),
    user_id: U.opsAgent,
    role: 'link_ops',
    permissions: ['ops.verify', 'ops.moderate'],
  },
  { id: id('g', 9), user_id: U.opsFinance, role: 'link_ops', permissions: ['ops.finance'] },
];

// Commission defaults (OD-01, OD-02): global, 5% each. Rates live only here, never in code.
const commissionRules = [
  {
    id: id('k', 1),
    kind: 'rent_fee',
    rate_pct: '5.00',
    valid_from: '2026-01-01',
    reason: 'Default (OD-01)',
  },
  {
    id: id('k', 2),
    kind: 'booking_commission',
    rate_pct: '5.00',
    valid_from: '2026-01-01',
    reason: 'Default (OD-02)',
  },
];

// Phase 2–3 features off (docs/14 §4, OD-48).
const flags = [
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
].map((key) => ({ key, scope_type: 'global', enabled: false }));

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  const counts: Record<string, number> = {
    'ref.curricula': await insert(client, 'ref.curricula', curricula),
    'ref.school_years': await insert(client, 'ref.school_years', schoolYears),
    'ref.academic_terms': await insert(client, 'ref.academic_terms', terms),
    'ref.subjects': await insert(client, 'ref.subjects', subjects),
    'identity.users': await insert(client, 'identity.users', users),
    'org.centres': await insert(client, 'org.centres', centres),
    'market.rooms': await insert(client, 'market.rooms', rooms),
    'org.teachers': await insert(client, 'org.teachers', teachers),
    'org.teacher_subjects': await insert(
      client,
      'org.teacher_subjects',
      teacherSubjects,
      '(teacher_id, subject_id)',
    ),
    'identity.role_assignments': await insert(client, 'identity.role_assignments', roles),
    'ledger.commission_rules': await insert(client, 'ledger.commission_rules', commissionRules),
    'platform.feature_flags': await insert(
      client,
      'platform.feature_flags',
      flags,
      '(key, scope_type, scope_id)',
    ),
  };
  await client.query('COMMIT');
  console.log('Seed applied (sample data, idempotent):');
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(28)} ${n}`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
