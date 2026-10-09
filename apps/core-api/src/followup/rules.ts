import { sql } from 'kysely';
import { writeAudit } from '../platform/audit';
import type { Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, pgConstraint } from '../platform/problem';
import { addDays, cairoToday } from '../platform/time';
import { type Bi, type Lang, arNum, extraOn, fmtDate, groupInfo, sessionsOf } from './world';

/**
 * The rules engine (FUP-RUL). The followup module is the ONLY evaluator of these four rules
 * (FUP-RUL-03, CLAUDE.md); only confirmed records and saved notes trigger them (BR-APR-08); a
 * "not recorded" session is never an absence (BR-APR-07). Every flag stores its readable
 * explanation, the numbers and the source records (BR-APR-04), and the version that raised it.
 */
export const RULE_CODES = [
  'consecutive_absences',
  'score_decline',
  'low_participation',
  'repeated_concern',
] as const;
export type RuleCode = (typeof RULE_CODES)[number];

/** 03 §3 defaults: only `consecutive_absences` is on. Every value is configurable per centre. */
export const RULE_DEFAULTS: Record<RuleCode, { active: boolean; params: Record<string, number> }> =
  {
    consecutive_absences: { active: true, params: { n: 2 } },
    score_decline: { active: false, params: { k: 2, drop: 10, minScores: 3 } },
    low_participation: { active: false, params: { k: 2, m: 3 } },
    repeated_concern: { active: false, params: { count: 3, windowDays: 30 } },
  };
export const RULE_PARAMS: Record<RuleCode, string[]> = {
  consecutive_absences: ['n'],
  score_decline: ['k', 'drop', 'minScores'],
  low_participation: ['k', 'm'],
  repeated_concern: ['count', 'windowDays'],
};
const CONCERN_TAGS = ['needs_revisit', 'behaviour', 'understanding'] as const;
const TAG: Record<string, Bi> = {
  needs_revisit: { en: 'Needs revisit', ar: 'يحتاج مراجعة' },
  behaviour: { en: 'Behaviour', ar: 'السلوك' },
  understanding: { en: 'Understanding', ar: 'الفهم' },
};
export const RULE_NAME: Record<RuleCode, Bi> = {
  consecutive_absences: { en: 'Consecutive absences', ar: 'غياب متتالي' },
  score_decline: { en: 'Comparable score decline', ar: 'تراجع الدرجات القابلة للمقارنة' },
  low_participation: { en: 'Low participation', ar: 'مشاركة منخفضة' },
  repeated_concern: { en: 'Same concern 3 times', ar: 'الملاحظة نفسها تتكرر' },
};

export interface Definition {
  params: Record<string, number>;
  scope: string; // 'all' or one group id (FUP-RUL-01 AC2)
}

const EN_COUNT: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
const sessionsWords = (n: number, lang: Lang) =>
  lang === 'ar'
    ? n === 2
      ? 'حصتين متتاليتين'
      : n <= 10
        ? `${arNum(n)} حصص متتالية`
        : `${arNum(n)} حصة متتالية`
    : `${EN_COUNT[n] ?? n} consecutive scheduled sessions`;
const list = (xs: string[], lang: Lang) =>
  lang === 'ar'
    ? xs.join(' و')
    : xs.length > 1
      ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`
      : (xs[0] ?? '');

/** The rule in plain words, with its version (FUP-CAS-02 AC1, A07). */
export function ruleText(code: RuleCode, p: Record<string, number>, lang: Lang, version?: number) {
  const v = version
    ? lang === 'ar'
      ? ` (القاعدة الإصدار ${arNum(version)})`
      : ` (Rule v${version})`
    : '';
  const ar = lang === 'ar';
  switch (code) {
    case 'consecutive_absences':
      return ar
        ? `غياب متتالي${v}: يُرفع تنبيه عندما يغيب الطالب عن آخر ${arNum(p.n!)} حصص مجدولة، ولكل منها سجل مؤكَّد. الحصة "غير المسجّلة" تقطع التتابع.`
        : `Consecutive absences${v}: a flag is raised when a student is absent from the last ${p.n} scheduled sessions, each with a confirmed record. A "Not recorded" session breaks the streak.`;
    case 'score_decline':
      return ar
        ? `تراجع الدرجات${v}: يُرفع تنبيه عندما تكون آخر ${arNum(p.k!)} درجات قابلة للمقارنة أقل من متوسط الطالب السابق بـ${arNum(p.drop!)} نقطة (٪) أو أكثر، في السلسلة نفسها، مع ${arNum(p.minScores!)} درجات على الأقل.`
        : `Comparable score decline${v}: a flag is raised when the last ${p.k} comparable scores are each ${p.drop} points (%) or more below the student's own earlier average in the same assessment series, with at least ${p.minScores} scores.`;
    case 'low_participation':
      return ar
        ? `مشاركة منخفضة${v}: يُرفع تنبيه عندما تكون المشاركة "منخفضة" في ${arNum(p.k!)} من آخر ${arNum(p.m!)} حصص مؤكَّدة.`
        : `Low participation${v}: a flag is raised when participation was "low" in ${p.k} of the last ${p.m} confirmed sessions.`;
    case 'repeated_concern':
      return ar
        ? `الملاحظة نفسها تتكرر${v}: يُرفع تنبيه عندما يتكرر موضوع الملاحظة نفسه (الفهم، يحتاج مراجعة، السلوك) ${arNum(p.count!)} مرات خلال ${arNum(p.windowDays!)} يومًا.`
        : `Same concern repeated${v}: a flag is raised when the same note topic (understanding, needs revisit, behaviour) is recorded ${p.count} times in ${p.windowDays} days.`;
  }
}
export const RULE_EXAMPLE: Record<RuleCode, Bi> = {
  consecutive_absences: {
    en: 'Absent from two consecutive scheduled sessions: 24 and 28 September.',
    ar: 'غاب عن حصتين مجدولتين متتاليتين: ٢٤ و٢٨ سبتمبر.',
  },
  score_decline: {
    en: 'Sign rules practice: 60% and 55% after an average of 75%.',
    ar: 'تدريب قواعد الإشارات: ٦٠٪ و٥٥٪ بعد متوسط ٧٥٪.',
  },
  low_participation: {
    en: 'Low participation on 21 and 28 September.',
    ar: 'مشاركة منخفضة يومي ٢١ و٢٨ سبتمبر.',
  },
  repeated_concern: {
    en: '"Needs revisit" noted three times since 10 September.',
    ar: '"يحتاج مراجعة" تكرر ثلاث مرات منذ ١٠ سبتمبر.',
  },
};

// ── rules and versions ─────────────────────────────────────────────────────────
export interface RuleRow {
  id: string;
  centre_id: string;
  code: RuleCode;
  active: boolean;
  current_version: number;
  definition: Definition;
  default_assignee_role: string;
  due_in_days: number;
}

/** The centre's four rules, created with the 03 §3 defaults (version 1) the first time. */
export async function centreRules(sys: Tx, centreId: string): Promise<RuleRow[]> {
  const have = await sys
    .selectFrom('followup.rules')
    .selectAll()
    .where('centre_id', '=', centreId)
    .where('teacher_id', 'is', null)
    .execute();
  for (const code of RULE_CODES) {
    if (have.some((r) => r.code === code)) continue;
    const d = RULE_DEFAULTS[code];
    const id = uuidv7();
    const definition: Definition = { params: { ...d.params }, scope: 'all' };
    const ins = await sys
      .insertInto('followup.rules')
      .values({
        id,
        centre_id: centreId,
        code,
        definition: JSON.stringify(definition),
        active: d.active,
        current_version: 1,
      })
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!ins) continue;
    await sys
      .insertInto('followup.rule_versions')
      .values({
        id: uuidv7(),
        rule_id: id,
        centre_id: centreId,
        version: 1,
        definition: JSON.stringify(definition),
        active: d.active,
        explanation_template_en: ruleText(code, d.params, 'en'),
        explanation_template_ar: ruleText(code, d.params, 'ar'),
        approved_at: new Date(),
        status: 'approved',
      })
      .execute();
  }
  const rows = await sys
    .selectFrom('followup.rules')
    .selectAll()
    .where('centre_id', '=', centreId)
    .where('teacher_id', 'is', null)
    .execute();
  return RULE_CODES.map((c) => rows.find((r) => r.code === c)!).map((r) => ({
    ...r,
    code: r.code as RuleCode,
    definition: r.definition as unknown as Definition,
  }));
}

/** 422 unless every parameter is a whole number ≥ 1 and the scope is all or a group here. */
export async function validateChange(
  sys: Tx,
  centreId: string,
  code: RuleCode,
  b: { active: boolean; params: Record<string, unknown>; scope: string },
): Promise<Definition> {
  const params: Record<string, number> = {};
  for (const k of RULE_PARAMS[code]) {
    const v = b.params?.[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 365)
      throw new Problem(422, 'validation_failed', `"${k}" must be a whole number of 1 or more.`, {
        field: k,
      });
    params[k] = v;
  }
  if (code === 'low_participation' && params.k! > params.m!)
    throw new Problem(422, 'validation_failed', '"k" cannot be more than "m".', { field: 'k' });
  if (b.scope !== 'all') {
    const g = await sys
      .selectFrom('market.groups')
      .select('id')
      .where('id', '=', b.scope)
      .where('centre_id', '=', centreId)
      .executeTakeFirst()
      .catch(() => undefined);
    if (!g) throw new Problem(422, 'validation_failed', 'Unknown group.', { field: 'scope' });
  }
  return { params, scope: b.scope };
}

// ── evaluation ─────────────────────────────────────────────────────────────────
interface Hit {
  evidenceRecordIds: string[];
  numbers: Record<string, unknown>;
  explanation: Bi;
}

/** Confirmed entries of a student in a group, oldest first, with their record's date and maximum. */
async function confirmedEntries(sys: Tx, groupId: string, studentId: string, upto: string) {
  const { rows } = await sql<{
    record_id: string;
    group_session_id: string;
    session_date: string;
    attendance: string;
    participation: string;
    score: string | null;
    max_score: string | null;
    series: string | null;
    title: string | null;
    observation_tag: string | null;
    confirmed_at: Date;
  }>`
    SELECT r.id AS record_id, r.group_session_id, r.session_date::text, e.attendance, e.participation, e.score::text,
           a.max_score::text, a.series, a.title, e.observation_tag, r.confirmed_at
    FROM records.session_records r
    JOIN records.record_entries e ON e.session_record_id = r.id AND e.student_id = ${studentId}
    LEFT JOIN records.assessments a ON a.id = e.assessment_id
    WHERE r.group_id = ${groupId} AND r.status = 'confirmed' AND r.session_date <= ${upto}::date
    ORDER BY r.session_date, r.confirmed_at`.execute(sys);
  return rows;
}

async function consecutiveAbsences(
  sys: Tx,
  groupId: string,
  studentId: string,
  upto: string,
  p: Record<string, number>,
): Promise<Hit | null> {
  const n = p.n!;
  // The last n SCHEDULED sessions (not the last n records): a session with no confirmed record,
  // or "not recorded", breaks the streak (BR-APR-07, BR-APR-08).
  const sched = (await sessionsOf(sys, [groupId], 'past', upto)).slice(-n);
  if (sched.length < n) return null;
  const entries = await confirmedEntries(sys, groupId, studentId, upto);
  const bySession = new Map(entries.map((e) => [e.group_session_id, e]));
  const recs = sched.map((s) => bySession.get(s.id));
  if (!recs.every((r) => r?.attendance === 'absent')) return null;
  const dates = recs.map((r) => r!.session_date);
  return {
    evidenceRecordIds: recs.map((r) => r!.record_id),
    numbers: { n, absentOn: dates },
    explanation: {
      en: `Absent from ${sessionsWords(n, 'en')}: ${list(
        dates.map((d) => fmtDate(d, 'en')),
        'en',
      )}`,
      ar: `غياب عن ${sessionsWords(n, 'ar')}: ${list(
        dates.map((d) => fmtDate(d, 'ar')),
        'ar',
      )}`,
    },
  };
}

async function scoreDecline(
  sys: Tx,
  groupId: string,
  studentId: string,
  upto: string,
  p: Record<string, number>,
): Promise<Hit | null> {
  const { k, drop, minScores } = p as { k: number; drop: number; minScores: number };
  const scored = (await confirmedEntries(sys, groupId, studentId, upto)).filter(
    (e) => e.score != null && e.series && e.max_score,
  );
  const bySeries = new Map<string, typeof scored>();
  for (const e of scored) bySeries.set(e.series!, [...(bySeries.get(e.series!) ?? []), e]);
  for (const [series, xs] of bySeries) {
    if (xs.length < Math.max(minScores, k + 1)) continue;
    const pct = (e: (typeof xs)[number]) => (Number(e.score) / Number(e.max_score)) * 100;
    const earlier = xs.slice(0, -k);
    const last = xs.slice(-k);
    const avg = earlier.reduce((a, e) => a + pct(e), 0) / earlier.length;
    if (!last.every((e) => pct(e) <= avg - drop)) continue;
    const r = (x: number) => Math.round(x);
    const title = last.at(-1)!.title ?? series;
    return {
      evidenceRecordIds: [...earlier, ...last].map((e) => e.record_id),
      numbers: { series, k, drop, earlierAveragePct: r(avg), lastPct: last.map((e) => r(pct(e))) },
      explanation: {
        en: `${title}: ${last.map((e) => `${r(pct(e))}%`).join(' and ')} after an average of ${r(avg)}% (${drop}+ points lower)`,
        ar: `${title}: ${last.map((e) => `${arNum(r(pct(e)))}٪`).join(' و')} بعد متوسط ${arNum(r(avg))}٪ (أقل بـ${arNum(drop)} نقطة أو أكثر)`,
      },
    };
  }
  return null;
}

async function lowParticipation(
  sys: Tx,
  groupId: string,
  studentId: string,
  upto: string,
  p: Record<string, number>,
): Promise<Hit | null> {
  const { k, m } = p as { k: number; m: number };
  const last = (await confirmedEntries(sys, groupId, studentId, upto)).slice(-m);
  const low = last.filter((e) => e.participation === 'low');
  if (low.length < k) return null;
  const dates = low.map((e) => e.session_date);
  return {
    evidenceRecordIds: low.map((e) => e.record_id),
    numbers: { k, m, lowOn: dates },
    explanation: {
      en: `Low participation in ${low.length} of the last ${last.length} confirmed sessions: ${list(
        dates.map((d) => fmtDate(d, 'en')),
        'en',
      )}`,
      ar: `مشاركة منخفضة في ${arNum(low.length)} من آخر ${arNum(last.length)} حصص مؤكَّدة: ${list(
        dates.map((d) => fmtDate(d, 'ar')),
        'ar',
      )}`,
    },
  };
}

async function repeatedConcern(
  sys: Tx,
  groupId: string,
  studentId: string,
  upto: string,
  p: Record<string, number>,
): Promise<Hit | null> {
  const { count, windowDays } = p as { count: number; windowDays: number };
  const since = addDays(upto, -windowDays);
  // Saved teacher notes (confirmed input, BR-APR-08) and confirmed record observations.
  const notes = await sql<{ tag: string; day: string; record_id: string | null }>`
    SELECT tag, (created_at AT TIME ZONE 'Africa/Cairo')::date::text AS day, session_record_id AS record_id
    FROM records.notes
    WHERE group_id = ${groupId} AND student_id = ${studentId} AND tag = ANY (${CONCERN_TAGS as unknown as string[]}::text[])
      AND (created_at AT TIME ZONE 'Africa/Cairo')::date > ${since}::date`.execute(sys);
  const obs = (await confirmedEntries(sys, groupId, studentId, upto))
    .filter(
      (e) =>
        e.observation_tag &&
        (CONCERN_TAGS as readonly string[]).includes(e.observation_tag) &&
        e.session_date > since,
    )
    .map((e) => ({ tag: e.observation_tag!, day: e.session_date, record_id: e.record_id }));
  const all = [...notes.rows, ...obs];
  for (const tag of CONCERN_TAGS) {
    const hits = all.filter((x) => x.tag === tag).sort((a, b) => a.day.localeCompare(b.day));
    if (hits.length < count) continue;
    const first = hits[0]!.day;
    return {
      evidenceRecordIds: [...new Set(hits.map((h) => h.record_id).filter(Boolean) as string[])],
      numbers: { tag, count: hits.length, windowDays, since: first },
      explanation: {
        en: `"${TAG[tag]!.en}" noted ${hits.length} times since ${fmtDate(first, 'en')}`,
        ar: `"${TAG[tag]!.ar}" تكرر ${arNum(hits.length)} مرات منذ ${fmtDate(first, 'ar')}`,
      },
    };
  }
  return null;
}

const EVALUATORS: Record<
  RuleCode,
  (
    sys: Tx,
    groupId: string,
    studentId: string,
    upto: string,
    p: Record<string, number>,
  ) => Promise<Hit | null>
> = {
  consecutive_absences: consecutiveAbsences,
  score_decline: scoreDecline,
  low_participation: lowParticipation,
  repeated_concern: repeatedConcern,
};

/** Which rules a trigger runs (FUP-RUL-03 AC1). */
const TRIGGERS: Record<'record' | 'note', RuleCode[]> = {
  record: ['consecutive_absences', 'score_decline', 'low_participation', 'repeated_concern'],
  note: ['repeated_concern'],
};

export interface EvaluateInput {
  groupId: string;
  studentIds: string[];
  trigger: 'record' | 'note';
  /** Evaluate as of this Cairo day: the confirmed record's session day (default: today). */
  upto?: string;
  /** A correction of this record: a flag whose evidence it was and that no longer holds is resolved. */
  correctionOf?: string;
  actorId?: string | null;
  requestId?: string | null;
}

/**
 * Evaluate the rules for some students of a group, on confirmed data only. Idempotent: an open
 * flag of the same rule, student and group gets the new evidence instead of a second flag
 * (INV-08), so running twice (the request and the `followup` consumer) changes nothing.
 * Returns the IDs of the signals raised or updated.
 */
export async function evaluate(sys: Tx, e: EvaluateInput): Promise<string[]> {
  const g = await groupInfo(sys, e.groupId);
  // OD-58: no rule runs for a centre without the Follow-up extra (an event queued before it was
  // switched off included).
  if (!(await extraOn(sys, g.centreId))) return [];
  const rules = await centreRules(sys, g.centreId);
  const upto = e.upto ?? cairoToday();
  const touched: string[] = [];
  for (const rule of rules) {
    if (!TRIGGERS[e.trigger].includes(rule.code)) continue;
    if (!rule.active) continue;
    if (rule.definition.scope !== 'all' && rule.definition.scope !== e.groupId) continue;
    for (const studentId of e.studentIds) {
      const hit = await EVALUATORS[rule.code](
        sys,
        e.groupId,
        studentId,
        upto,
        rule.definition.params,
      );
      const open = await sys
        .selectFrom('followup.signals')
        .selectAll()
        .where('rule_id', '=', rule.id)
        .where('student_id', '=', studentId)
        .where('group_id', '=', e.groupId)
        .where('topic_id', 'is', null)
        .where('status', 'in', ['open', 'case_opened'])
        .forUpdate()
        .executeTakeFirst();
      if (hit) {
        if (open) {
          const ev = open.evidence as { recordIds: string[] };
          const ids = [...new Set([...ev.recordIds, ...hit.evidenceRecordIds])];
          if (ids.length !== ev.recordIds.length)
            await sys
              .updateTable('followup.signals')
              .set({ evidence: JSON.stringify({ ...hit.numbers, recordIds: ids }) })
              .where('id', '=', open.id)
              .execute();
          touched.push(open.id);
          continue;
        }
        const id = await raise(sys, rule, g, studentId, hit, e);
        if (id) touched.push(id);
      } else if (
        open &&
        e.correctionOf &&
        (open.evidence as { recordIds: string[] }).recordIds.includes(e.correctionOf)
      ) {
        // FUP-REC-08 AC3: a flag that no longer applies is kept, with a note — never deleted.
        await sys
          .updateTable('followup.signals')
          .set({ status: 'resolved_by_correction' })
          .where('id', '=', open.id)
          .execute();
        const c = await sys
          .selectFrom('followup.cases')
          .select('id')
          .where('signal_id', '=', open.id)
          .executeTakeFirst();
        if (c)
          await caseEvent(sys, {
            caseId: c.id,
            centreId: g.centreId,
            kind: 'resolved_by_correction',
            text: {
              en: 'Resolved by correction: the rule no longer applies',
              ar: 'انتهى بتصحيح: القاعدة لم تعد تنطبق',
            },
            actorId: null,
          });
        await writeAudit(sys, {
          actorId: null,
          actorType: 'system',
          centreId: g.centreId,
          action: 'signal.resolved_by_correction',
          objectType: 'signal',
          objectRef: open.id,
          after: { caseId: c?.id ?? null, recordId: e.correctionOf },
          requestId: e.requestId,
        });
        touched.push(open.id);
      }
    }
  }
  return touched;
}

/** A new flag and its case: assigned by default to Reception, due the same day (FUP-CAS-02 AC2). */
async function raise(
  sys: Tx,
  rule: RuleRow,
  g: Awaited<ReturnType<typeof groupInfo>>,
  studentId: string,
  hit: Hit,
  e: EvaluateInput,
) {
  const signalId = uuidv7();
  const now = new Date();
  try {
    await sys
      .insertInto('followup.signals')
      .values({
        id: signalId,
        rule_id: rule.id,
        rule_code: rule.code,
        rule_version: rule.current_version,
        student_id: studentId,
        group_id: g.id,
        centre_id: g.centreId,
        evidence: JSON.stringify({ ...hit.numbers, recordIds: hit.evidenceRecordIds }),
        params: JSON.stringify(rule.definition.params),
        explanation_en: hit.explanation.en,
        explanation_ar: hit.explanation.ar,
        status: 'case_opened',
        raised_at: now,
      })
      .execute();
  } catch (err) {
    // Another evaluator raised the same flag a moment ago (INV-08): theirs stands.
    if (pgConstraint(err) === 'signals_one_open') return null;
    throw err;
  }
  const assignee = await defaultAssignee(sys, g.centreId, rule.default_assignee_role);
  const caseId = uuidv7();
  const dueOn = addDays(cairoToday(now), rule.due_in_days);
  await sys
    .insertInto('followup.cases')
    .values({
      id: caseId,
      signal_id: signalId,
      centre_id: g.centreId,
      student_id: studentId,
      group_id: g.id,
      assignee_id: assignee.id,
      status: 'open',
      due_on: dueOn,
    })
    .execute();
  const name = RULE_NAME[rule.code];
  await caseEvent(sys, {
    caseId,
    centreId: g.centreId,
    kind: 'flag_raised',
    text: {
      en: `Flag raised by rule "${name.en}" (v${rule.current_version})`,
      ar: `تم رفع تنبيه بقاعدة "${name.ar}" (الإصدار ${arNum(rule.current_version)})`,
    },
    actorId: null,
  });
  await caseEvent(sys, {
    caseId,
    centreId: g.centreId,
    kind: 'assigned',
    text: {
      en: `Assigned to ${assignee.title.en}, due ${rule.due_in_days ? `in ${rule.due_in_days} days` : 'the same day'}`,
      ar: `أُسند إلى ${assignee.title.ar}، ${rule.due_in_days ? `مستحق خلال ${arNum(rule.due_in_days)} أيام` : 'مستحق في نفس اليوم'}`,
    },
    actorId: null,
  });
  await enqueue(sys, {
    type: 'signal.raised',
    aggregateType: 'signal',
    aggregateId: signalId,
    centreId: g.centreId,
    data: { signalId, caseId, rule: rule.code, ruleVersion: rule.current_version, groupId: g.id },
    requestId: e.requestId,
  });
  await writeAudit(sys, {
    actorId: null,
    actorType: 'system',
    centreId: g.centreId,
    action: 'signal.raised',
    objectType: 'signal',
    objectRef: signalId,
    after: {
      caseId,
      rule: rule.code,
      ruleVersion: rule.current_version,
      groupId: g.id,
      studentId,
      dueOn,
      assigneeId: assignee.id,
    },
    requestId: e.requestId,
  });
  return signalId;
}

/** Reception gets new follow-ups by default; the owner when there is no Reception (FUP-CAS-02). */
async function defaultAssignee(sys: Tx, centreId: string, role: string) {
  const rows = await sys
    .selectFrom('identity.role_assignments')
    .select(['user_id', 'role', 'created_at'])
    .where('centre_id', '=', centreId)
    .where('status', '=', 'active')
    .where('role', 'in', ['centre_owner', 'centre_staff'])
    .orderBy('created_at')
    .execute();
  const staff = rows.find((r) => r.role === 'centre_staff');
  const owner = rows.find((r) => r.role === 'centre_owner');
  const pickStaff = role !== 'owner' && staff;
  const chosen = pickStaff ? staff : (owner ?? staff);
  if (!chosen) throw new Problem(409, 'no_staff', 'The centre has no owner or staff to assign.');
  return {
    id: chosen.user_id,
    title: pickStaff
      ? { en: 'Reception', ar: 'الاستقبال' }
      : chosen.role === 'centre_owner'
        ? { en: 'the owner', ar: 'المالك' }
        : { en: 'Reception', ar: 'الاستقبال' },
  };
}

export async function caseEvent(
  sys: Tx,
  e: { caseId: string; centreId: string; kind: string; text: Bi; actorId: string | null },
) {
  await sys
    .insertInto('followup.case_events')
    .values({
      id: uuidv7(),
      case_id: e.caseId,
      centre_id: e.centreId,
      kind: e.kind,
      text_en: e.text.en,
      text_ar: e.text.ar,
      actor_id: e.actorId,
    })
    .execute();
}
