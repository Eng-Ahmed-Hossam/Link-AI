// Database v2 sample data (docs/plan/database-v2.md §5). SAMPLE DATA ONLY. Mariam Hassan (the
// sample parent's daughter, Sec 2, National) in Mr Karim's Sec 2 Maths group at Al Nour (Sun & Tue,
// Hall A). Not Ms Salma's group: the connected story reserves Mariam a seat there, live.
// - a student account with one device and a PIN (the try-it guide's sample device);
// - the topic map (Maths · Sec 2 · National, a sample, not the official syllabus), the topics her
//   sessions covered, quiz questions tagged to topics, and marks that give one topic in each band
//   plus one hidden under 2 quizzes (written into each record before the teacher confirms it,
//   as the API would; the rules engine then runs on each confirmed record);
// - homework set, handed in, late and not marked yet; a missed session with a make-up request;
// - a moved session and a hall change (the change log and notifications come from the trigger);
// - an approved teacher note and a draft one; this week's approved focus checklist (one item
//   ticked) and next week's draft; last month's topic snapshot.
import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { DB } from '../src/db/schema';
import { evaluate } from '../src/followup/rules';
import { sessionStudents, sessionsOf } from '../src/followup/world';
import { writeAudit } from '../src/platform/audit';
import { sha256 } from '../src/platform/crypto';
import { onRecordConfirmed } from '../src/students/teaching';
import { demoId } from './demo-id';

export const MARIAM = demoId('chd-mariam');
/** The sample device (try-it guide, docs/plan/database-v2-tryit.md). Sample values, local only. */
export const SAMPLE_DEVICE = {
  id: demoId('dev-mariam-phone'),
  secret: 'sample-device-secret-mariam-phone-0001',
  pin: '2468',
};

type T = Transaction<DB> | Kysely<DB>;

const UNITS = [
  {
    key: 'algebra',
    en: 'Algebra',
    ar: 'الجبر',
    topics: [
      ['functions', 'Functions', 'الدوال'],
      ['exponents', 'Exponents', 'الأسس'],
      ['logarithms', 'Logarithms', 'اللوغاريتمات'],
    ],
  },
  {
    key: 'trig',
    en: 'Trigonometry',
    ar: 'حساب المثلثات',
    topics: [
      ['identities', 'Trigonometric identities', 'المتطابقات المثلثية'],
      ['triangles', 'Solving triangles', 'حل المثلث'],
      ['graphs', 'Trigonometric graphs', 'التمثيل البياني للدوال المثلثية'],
    ],
  },
  {
    key: 'calculus',
    en: 'Calculus',
    ar: 'التفاضل',
    topics: [
      ['limits', 'Limits', 'النهايات'],
      ['rates', 'Rates of change', 'معدلات التغير'],
      ['derivatives', 'Derivatives', 'المشتقات'],
    ],
  },
] as const;
export type TopicKey = (typeof UNITS)[number]['topics'][number][0];
export const topicId = (k: TopicKey) => demoId(`topic:${k}`);

/** The sample topic map of the group's subject (published, `confirmed = false` until OD-07). */
export async function seedTopicMap(tx: T, subjectId: string) {
  const template = demoId('topicmap:math-sec2-national');
  await tx
    .insertInto('ref.topic_templates')
    .values({
      id: template,
      subject_id: subjectId,
      academic_year: '2026/27',
      name_en: 'Maths · Secondary 2 · National (sample)',
      name_ar: 'الرياضيات • ٢ ثانوي • عام (عينة)',
      status: 'published',
    })
    .execute();
  for (const [u, unit] of UNITS.entries()) {
    const unitId = demoId(`unit:${unit.key}`);
    await tx
      .insertInto('ref.topic_template_nodes')
      .values({
        id: unitId,
        template_id: template,
        kind: 'unit',
        name_en: unit.en,
        name_ar: unit.ar,
        position: u + 1,
      })
      .execute();
    for (const [t, [key, en, ar]] of unit.topics.entries())
      await tx
        .insertInto('ref.topic_template_nodes')
        .values({
          id: topicId(key),
          template_id: template,
          parent_id: unitId,
          kind: 'topic',
          name_en: en,
          name_ar: ar,
          position: u * 10 + t + 1,
        })
        .execute();
  }
}

/**
 * The plan for each seeded session (oldest first), used by demo-followup.ts while it writes the
 * records: what was covered, the homework set, the topics, the quiz, Mariam's marks.
 *   functions: 5/7 then 7/7 → 86 mastered · exponents 4/7, 5/7 → 64 improving ·
 *   logarithms 3/6, 2/6 → 42 needs practice · identities one quiz (7/10) → hidden ·
 *   solving triangles covered in the session she missed → not scored yet · the rest not taught yet.
 */
export const SESSION_PLAN = [
  {
    topicCovered: 'الدوال والأسس: مراجعة وتمارين',
    homeworkSet: 'تمارين ٢ صفحة ١٤: من ١ إلى ٨',
    homework: 'تمارين الدوال (ص ١٤)',
    topics: ['functions', 'exponents'] as TopicKey[],
    quiz: {
      mode: 'per_question' as const,
      questions: [
        ['functions', 7, 5],
        ['exponents', 7, 4],
        ['logarithms', 6, 3],
      ] as const,
    },
  },
  {
    topicCovered: 'اللوغاريتمات: التعريف والخواص',
    homeworkSet: 'ورقة عمل اللوغاريتمات',
    homework: 'ورقة عمل اللوغاريتمات',
    topics: ['logarithms'] as TopicKey[],
    quiz: {
      mode: 'per_question' as const,
      questions: [
        ['functions', 7, 7],
        ['exponents', 7, 5],
        ['logarithms', 6, 2],
      ] as const,
    },
  },
  {
    topicCovered: 'المتطابقات المثلثية الأساسية',
    homeworkSet: 'حل ٥ متطابقات من الكتاب',
    homework: 'خمس متطابقات (ص ٣٢)',
    topics: ['identities'] as TopicKey[],
    quiz: { mode: 'whole_quiz' as const, topic: 'identities' as TopicKey, max: 10, mariam: 7 },
  },
  {
    topicCovered: 'حل المثلث: قانون الجيب',
    homeworkSet: 'تمارين ٣ صفحة ٤٠: من ١ إلى ١٠',
    homework: 'قانون الجيب: تمارين ٣ (ص ٤٠)',
    topics: ['triangles'] as TopicKey[],
    quiz: null,
  },
];

/** Mariam's total on a seeded quiz (null when it has none). */
export function mariamScore(i: number): number | null {
  const q = SESSION_PLAN[i]?.quiz;
  if (!q) return null;
  return q.mode === 'whole_quiz' ? q.mariam : q.questions.reduce((n, x) => n + x[2], 0);
}

/** After the history: the account, the device, notes, the make-up, a moved session, focus plans. */
export async function seedStudentWorld(tx: T, hmacKey: string) {
  const counts: Record<string, number> = {};
  const parentUser = demoId('usr-parent');
  const guardian = demoId('gdn-parent');
  const group = KARIM_GROUP;
  const centre = demoId('cen-nour');
  const teacher = demoId('tch-karim');
  const teacherUser = KARIM_USER;
  const owner = demoId('usr-owner');

  // ── Mr Karim's last four sessions: what Mariam's student pages are made of ─────
  const subject = await tx
    .selectFrom('market.groups')
    .select('subject_id')
    .where('id', '=', group)
    .executeTakeFirstOrThrow();
  await seedTopicMap(tx, subject.subject_id);
  counts['records.session_records (Karim)'] = await seedHistory(
    tx,
    group,
    centre,
    teacher,
    teacherUser,
  );

  // ── The student account, its consent, one device with its PIN ─────────────────
  const studentUser = demoId('usr-student-mariam');
  await tx
    .insertInto('identity.users')
    .values({ id: studentUser, account_type: 'student', language: 'ar' })
    .execute();
  const consent = demoId('consent:student_account:mariam');
  await tx
    .insertInto('org.consent_events')
    .values([
      {
        id: consent,
        user_id: parentUser,
        guardian_id: guardian,
        student_id: MARIAM,
        kind: 'student_account',
        granted: true,
        version: 'draft-2026-10',
        source: 'student_account',
      },
      // D10: the weekly focus checklist needs the guardian's focus_plans consent for this child.
      {
        id: demoId('consent:focus_plans:mariam'),
        user_id: parentUser,
        guardian_id: guardian,
        student_id: MARIAM,
        kind: 'focus_plans',
        granted: true,
        version: 'draft-2026-10',
        source: 'settings',
      },
    ])
    .execute();
  await sql`INSERT INTO org.consent_versions (kind, version) VALUES ('student_account', 'draft-2026-10'), ('focus_plans', 'draft-2026-10') ON CONFLICT DO NOTHING`.execute(
    tx,
  );
  await tx
    .insertInto('identity.student_accounts')
    .values({
      student_id: MARIAM,
      user_id: studentUser,
      guardian_id: guardian,
      created_by_user_id: parentUser,
      status: 'active',
      consent_event_id: consent,
    })
    .execute();
  const code = demoId('code:mariam');
  const made = new Date(Date.now() - 2 * 86_400_000);
  await tx
    .insertInto('identity.student_access_codes')
    .values({
      id: code,
      student_id: MARIAM,
      created_by_user_id: parentUser,
      code_hmac: createHmac('sha256', hmacKey).update('student-code:SAMPLEUSED').digest(),
      created_at: made,
      expires_at: new Date(made.getTime() + 600_000),
      used_at: new Date(made.getTime() + 60_000),
      used_by_device_id: SAMPLE_DEVICE.id,
    })
    .execute();
  // The same hash as StudentAccounts.pinHash (accounts.ts): scrypt of HMAC(pepper, device ‖ PIN).
  const pepper = createHmac('sha256', hmacKey).update('link:student-pin:v1').digest();
  const salt = randomBytes(16);
  const key = createHmac('sha256', pepper)
    .update(`${SAMPLE_DEVICE.id}:${SAMPLE_DEVICE.pin}`)
    .digest();
  const pinHash = `scrypt$16384$8$1$${salt.toString('base64')}$${scryptSync(key, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
  await tx
    .insertInto('identity.student_devices')
    .values({
      id: SAMPLE_DEVICE.id,
      student_id: MARIAM,
      user_id: studentUser,
      secret_hash: sha256(SAMPLE_DEVICE.secret),
      pin_hash: pinHash,
      pin_set_at: new Date(made.getTime() + 90_000),
      platform: 'android',
      label: 'Android phone',
      access_code_id: code,
      last_used_at: new Date(Date.now() - 86_400_000),
    })
    .execute();
  counts['identity.student_accounts'] = 1;

  // ── A moved session and a hall change (the trigger logs and notifies) ─────────
  const upcoming = await tx
    .selectFrom('market.group_sessions')
    .select(['id', 'starts_at', 'ends_at'])
    .where('group_id', '=', group)
    .where('status', '=', 'scheduled')
    .where('starts_at', '>', new Date())
    .orderBy('starts_at')
    .limit(4)
    .execute();
  const otherHall = demoId('hall-nour-2');
  if (upcoming.length >= 4) {
    const moved = upcoming[2]!;
    await sql`SELECT set_config('app.actor_id', ${teacherUser}, true), set_config('app.change_reason', ${'طلب المدرّسة: تأخير ساعة'}, true)`.execute(
      tx,
    );
    await tx
      .updateTable('market.group_sessions')
      .set({
        starts_at: new Date(moved.starts_at.getTime() + 3_600_000),
        ends_at: new Date(moved.ends_at.getTime() + 3_600_000),
      })
      .where('id', '=', moved.id)
      .execute();
    const hall = await tx
      .selectFrom('market.rooms')
      .select('id')
      .where('id', '=', otherHall)
      .executeTakeFirst();
    if (hall) {
      await sql`SELECT set_config('app.actor_id', ${owner}, true), set_config('app.change_reason', ${'صيانة التكييف في قاعة أ'}, true)`.execute(
        tx,
      );
      await tx
        .updateTable('market.group_sessions')
        .set({ room_id: otherHall })
        .where('id', '=', upcoming[3]!.id)
        .execute();
    }
    await sql`SELECT set_config('app.actor_id', '', true), set_config('app.change_reason', '', true)`.execute(
      tx,
    );
  }
  counts['market.session_changes'] = Number(
    (
      await tx
        .selectFrom('market.session_changes')
        .select(sql<number>`count(*)::int`.as('n'))
        .executeTakeFirstOrThrow()
    ).n,
  );

  // ── The make-up request for the session she missed ──────────────────────────
  const missed = await sql<{ group_session_id: string }>`
    SELECT sr.group_session_id FROM records.session_records sr
    JOIN records.record_entries re ON re.session_record_id = sr.id
    WHERE sr.group_id = ${group} AND re.student_id = ${MARIAM} AND re.attendance = 'absent' AND sr.status = 'confirmed'
    ORDER BY sr.session_date DESC LIMIT 1`.execute(tx);
  if (missed.rows[0]) {
    await tx
      .insertInto('market.makeup_requests')
      .values({
        id: demoId('makeup:mariam'),
        student_id: MARIAM,
        guardian_id: guardian,
        group_id: group,
        centre_id: centre,
        missed_session_id: missed.rows[0].group_session_id,
        requested_by_user_id: studentUser,
        requested_by: 'student',
        note: 'كنت عيانة. ممكن أحضر حصة تانية الأسبوع ده؟',
      })
      .execute();
    counts['market.makeup_requests'] = 1;
  }

  // ── Teacher notes for the student: one approved, one draft ────────────────────
  const approvedAt = new Date(Date.now() - 3 * 86_400_000);
  await tx
    .insertInto('records.student_notes')
    .values([
      {
        id: demoId('snote:mariam:approved'),
        student_id: MARIAM,
        group_id: group,
        centre_id: centre,
        teacher_id: teacher,
        author_id: teacherUser,
        body: 'تحسن ممتاز في الدوال. استمري في التمرين يوميًا ١٠ دقائق.',
        status: 'approved',
        submitted_at: new Date(approvedAt.getTime() - 3_600_000),
        approved_by: owner,
        approved_at: approvedAt,
      },
      {
        id: demoId('snote:mariam:draft'),
        student_id: MARIAM,
        group_id: group,
        centre_id: centre,
        teacher_id: teacher,
        author_id: teacherUser,
        body: 'راجعي قوانين اللوغاريتمات قبل الحصة الجاية.',
      },
    ])
    .execute();
  counts['records.student_notes'] = 2;

  // ── Focus checklists: this week's approved (one item ticked), next week's draft ─
  const monday = cairoMonday();
  const next = new Date(`${monday}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  const plans = [
    { id: demoId('focus:mariam:this'), week: monday, status: 'approved' as const },
    {
      id: demoId('focus:mariam:next'),
      week: next.toISOString().slice(0, 10),
      status: 'drafted' as const,
    },
  ];
  for (const p of plans) {
    await tx
      .insertInto('analytics.focus_plans')
      .values({
        id: p.id,
        student_id: MARIAM,
        group_id: group,
        centre_id: centre,
        teacher_id: teacher,
        week_of: p.week as never,
        created_by: teacherUser,
      })
      .execute();
    const items = [
      ['حلّي ٥ مسائل لوغاريتمات', 'Solve 5 logarithm problems', 'logarithms'],
      ['راجعي قوانين الأسس', 'Review the laws of exponents', 'exponents'],
      ['اقرئي درس قانون الجيب', 'Read the sine-rule lesson', 'triangles'],
    ] as const;
    for (const [k, [ar, en, t]] of items.entries())
      await tx
        .insertInto('analytics.focus_plan_items')
        .values({
          id: demoId(`${p.id}:item:${k}`),
          focus_plan_id: p.id,
          centre_id: centre,
          text_ar: ar,
          text_en: en,
          topic_node_id: topicId(t),
          position: k + 1,
        })
        .execute();
    if (p.status === 'approved') {
      await tx
        .updateTable('analytics.focus_plans')
        .set({ status: 'approved', approved_by: teacherUser, approved_at: new Date() })
        .where('id', '=', p.id)
        .execute();
      await tx
        .updateTable('analytics.focus_plan_items')
        .set({ ticked_at: new Date() })
        .where('id', '=', demoId(`${p.id}:item:1`))
        .execute();
    }
  }
  counts['analytics.focus_plans'] = 2;

  // ── Last month's snapshot, for the "last month" comparison ───────────────────
  const c = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const month = `${new Date(c.getFullYear(), c.getMonth() - 1, 1).getFullYear()}-${String(new Date(c.getFullYear(), c.getMonth() - 1, 1).getMonth() + 1).padStart(2, '0')}-01`;
  await tx
    .insertInto('analytics.topic_score_snapshots')
    .values([
      {
        id: demoId('snap:functions'),
        student_id: MARIAM,
        group_id: group,
        centre_id: centre,
        topic_node_id: topicId('functions'),
        month: month as never,
        score: '71.43',
        score_display: 71,
        band: 'improving',
        quiz_count: 2,
      },
      {
        id: demoId('snap:exponents'),
        student_id: MARIAM,
        group_id: group,
        centre_id: centre,
        topic_node_id: topicId('exponents'),
        month: month as never,
        score: null,
        score_display: null,
        band: 'not_enough_data',
        quiz_count: 1,
      },
    ])
    .execute();
  counts['analytics.topic_score_snapshots'] = 2;
  return counts;
}

export const KARIM_GROUP = demoId('grp-karim-nour');
export const KARIM_USER = demoId('usr-tch-karim');
/** Mr Karim's sample phone (seeds/demo.ts: teachers without a staff fixture get +2010000001NN). */
export const KARIM_PHONE = '+201000000101';

/**
 * Records for the group's last four held sessions (the latest stays open, as in the follow-up
 * seed): each written as a draft with what was covered, the topics, the quiz and its questions,
 * the homework, and the marks of the previous homework; then confirmed by the teacher, so the
 * homework reaches the students and the rules engine runs on it (FUP-RUL-03), as the API does.
 * Mariam misses the latest of the four (one absence: no flag).
 */
async function seedHistory(
  tx: T,
  group: string,
  centre: string,
  teacher: string,
  teacherUser: string,
) {
  const sys = tx as never;
  const past = await sessionsOf(sys, [group], 'past');
  const seeded = past.slice(-5, -1);
  let lastItem: string | null = null;
  for (const [i, s] of seeded.entries()) {
    const plan = SESSION_PLAN[i];
    const roster = await sessionStudents(sys, s.id);
    const id = demoId(`rec:${s.id}`);
    const at = new Date(Date.parse(s.endsAt) + 3600_000);
    await tx
      .insertInto('records.session_records')
      .values({
        id,
        group_id: group,
        centre_id: centre,
        teacher_id: teacher,
        group_session_id: s.id,
        session_date: s.date,
        created_by: teacherUser,
        created_at: at,
        topic_covered: plan?.topicCovered ?? null,
        homework_set: plan?.homeworkSet ?? null,
      })
      .execute();
    for (const t of plan?.topics ?? [])
      await tx
        .insertInto('records.session_topics')
        .values({
          session_record_id: id,
          topic_node_id: topicId(t),
          centre_id: centre,
          group_id: group,
        })
        .execute();
    const q = plan?.quiz ?? null;
    const assessment = q ? demoId(`asm:${s.id}`) : null;
    if (q && assessment) {
      await tx
        .insertInto('records.assessments')
        .values({
          id: assessment,
          group_id: group,
          centre_id: centre,
          session_record_id: id,
          title: q.mode === 'whole_quiz' ? 'المتطابقات • كويز قصير' : 'الجبر • كويز تدريبي',
          series: q.mode === 'whole_quiz' ? null : 'algebra-practice',
          max_score: q.mode === 'whole_quiz' ? String(q.max) : '20',
          tagging_mode: q.mode,
          taken_on: s.date,
        })
        .execute();
      const questions =
        q.mode === 'whole_quiz'
          ? [[q.topic, q.max, null] as const]
          : q.questions.map((x) => [x[0], x[1], x[2]] as const);
      for (const [n, [topic, max, marks]] of questions.entries()) {
        const item = demoId(`item:${assessment}:${n}`);
        await tx
          .insertInto('records.assessment_items')
          .values({
            id: item,
            assessment_id: assessment,
            centre_id: centre,
            label: q.mode === 'whole_quiz' ? 'Whole quiz' : `Q${n + 1}`,
            max_marks: String(max),
            position: n + 1,
          })
          .execute();
        await tx
          .insertInto('analytics.item_topics')
          .values({ assessment_item_id: item, topic_node_id: topicId(topic), centre_id: centre })
          .execute();
        if (marks != null)
          await tx
            .insertInto('records.item_scores')
            .values({
              id: demoId(`score:${item}:mariam`),
              assessment_item_id: item,
              student_id: MARIAM,
              centre_id: centre,
              marks: String(marks),
            })
            .execute();
      }
    }
    const last = i === seeded.length - 1;
    if (roster.length)
      await tx
        .insertInto('records.record_entries')
        .values(
          roster.map((st) => {
            const absent = st.id === MARIAM && last;
            const score = st.id === MARIAM && !absent ? mariamScore(i) : null;
            return {
              id: demoId(`ent:${s.id}:${st.id}`),
              session_record_id: id,
              centre_id: centre,
              student_id: st.id,
              attendance: absent ? 'absent' : 'present',
              participation: absent ? 'not_recorded' : 'normal',
              score: score == null ? null : String(score),
              assessment_id: score == null ? null : assessment,
            };
          }),
        )
        .execute();
    // The previous session's homework, marked in this record (before it is confirmed).
    if (lastItem && (i === 1 || i === 2))
      await tx
        .updateTable('records.homework_statuses')
        .set({
          status: i === 1 ? 'handed_in' : 'late',
          marked_in_record_id: id,
          marked_by: teacherUser,
          marked_at: at,
        })
        .where('homework_item_id', '=', lastItem)
        .where('student_id', '=', MARIAM)
        .execute();
    if (plan) {
      lastItem = demoId(`hw:${s.id}`);
      await tx
        .insertInto('records.homework_items')
        .values({
          id: lastItem,
          session_record_id: id,
          group_id: group,
          group_session_id: s.id,
          centre_id: centre,
          teacher_id: teacher,
          title: plan.homework,
          created_by: teacherUser,
          created_at: at,
        })
        .execute();
    }
    await tx
      .updateTable('records.session_records')
      .set({ status: 'confirmed', confirmed_by: teacherUser, confirmed_at: at })
      .where('id', '=', id)
      .execute();
    await onRecordConfirmed(sys, id);
    await writeAudit(sys, {
      actorId: teacherUser,
      actorType: 'user',
      centreId: centre,
      action: 'record.confirmed',
      objectType: 'session_record',
      objectRef: id,
      after: { groupId: group, sessionId: s.id, sessionDate: s.date, source: 'tap' },
    });
    await evaluate(sys, {
      groupId: group,
      studentIds: roster.map((x) => x.id),
      trigger: 'record',
      upto: s.date,
    });
  }
  return seeded.length;
}

/** The Monday of this week, Cairo time. */
function cairoMonday() {
  const day = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}
