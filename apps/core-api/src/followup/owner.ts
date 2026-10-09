import { sql } from 'kysely';
import { writeAudit } from '../platform/audit';
import type { Database, RlsContext, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { Problem, forbidden } from '../platform/problem';
import { addDays, cairoToday } from '../platform/time';
import * as dto from './dto';
import {
  RULE_CODES,
  RULE_EXAMPLE,
  type RuleCode,
  centreRules,
  ruleText,
  validateChange,
} from './rules';
import {
  type Lang,
  groupMembers,
  groupsInfo,
  hasPerm,
  namesOf,
  person,
  ref,
  requireExtra,
  roleAt,
  sessionsOf,
} from './world';

const OPEN = ['open', 'in_progress', 'awaiting_confirmation'];
type Att = 'present' | 'absent' | 'late' | 'not_recorded' | 'none';

/**
 * The owner web (07 §2c): A01 Today, A13 Students, A05 Sessions, A07 Rules (staff propose, the
 * owner approves — BR-APR-12) and A17 Activity (the append-only audit, FUP-DSH-04). Every path is
 * `/v1/centres/{id}/…`: the AuthGuard already answered 404 to anyone who is not staff there.
 */
export class Owner {
  constructor(private readonly db: Database) {}

  private async ctx(userId: string, centreId: string) {
    const ctx = await this.db.asUser(userId, async (_tx, c) => c);
    if (!roleAt(ctx, centreId)) throw forbidden();
    return ctx;
  }
  private async groupsOf(sys: Tx, centreId: string) {
    return (
      await sys
        .selectFrom('market.groups')
        .select('id')
        .where('centre_id', '=', centreId)
        .orderBy('created_at')
        .execute()
    ).map((g) => g.id);
  }

  /** A01 (FUP-DSH-01). "Eligible" = sessions that took place in the last 2 weeks. */
  async today(userId: string, centreId: string, lang: Lang) {
    await this.ctx(userId, centreId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, centreId);
      const today = cairoToday();
      const groups = await this.groupsOf(sys, centreId);
      const info = await groupsInfo(sys, groups);
      const eligible = (await sessionsOf(sys, groups)).filter((s) => s.date >= addDays(today, -14));
      const recs = await this.recordsBySession(
        sys,
        eligible.map((s) => s.id),
      );
      const confirmed = eligible.filter((s) => recs.get(s.id)?.status === 'confirmed').length;
      const open = await sys
        .selectFrom('followup.cases as c')
        .select(['c.id', 'c.assignee_id', 'c.status', sql<string>`c.due_on::text`.as('due_on')])
        .select((eb) =>
          eb
            .selectFrom('followup.case_attempts as a')
            .select(sql<number>`count(*)::int`.as('n'))
            .whereRef('a.case_id', '=', 'c.id')
            .as('attempts'),
        )
        .where('c.centre_id', '=', centreId)
        .where('c.status', 'in', OPEN)
        .orderBy('c.due_on')
        .execute();
      const overdue = open.filter((c) => dto.caseOverdue(c, c.attempts ?? 0));
      const names = await namesOf(
        sys,
        overdue.map((c) => c.assignee_id),
      );
      const listed = open.filter((c) => c.due_on <= today || c.status === 'open');
      return {
        date: today,
        dueToday: open.filter((c) => c.due_on <= today).length,
        overdue: {
          count: overdue.length,
          owners: [...new Set(overdue.map((c) => c.assignee_id))].map((id) => ref(names, id)),
        },
        missingRecords: { missing: eligible.length - confirmed, eligible: eligible.length },
        recordsComplete: { confirmed, eligible: eligible.length },
        followUpToday: await dto.cases(
          sys,
          listed.map((c) => c.id),
          lang,
        ),
        keepComplete: eligible
          .filter((s) => recs.get(s.id)?.status !== 'confirmed')
          .reverse()
          .map((s) => {
            const g = info.get(s.groupId)!;
            return {
              groupId: s.groupId,
              groupName: g.name[lang],
              teacher: person(g.teacherUserId, g.teacherName),
              sessionDate: s.date,
              startsAt: s.startsAt,
              status: recs.get(s.id) ? ('draft' as const) : ('missing' as const),
            };
          }),
      };
    });
  }

  private async recordsBySession(sys: Tx, ids: string[]) {
    if (!ids.length) return new Map<string, { id: string; status: string }>();
    const rows = await sys
      .selectFrom('records.session_records')
      .select(['id', 'status', 'group_session_id'])
      .where('group_session_id', 'in', ids)
      .execute();
    return new Map(rows.map((r) => [r.group_session_id, { id: r.id, status: r.status }]));
  }

  /** A13 (FUP-DSH-02): one row per student per follow-up group. */
  async students(userId: string, centreId: string, lang: Lang) {
    const ctx = await this.ctx(userId, centreId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, centreId);
      this.records(ctx, centreId);
      const groups = await this.groupsOf(sys, centreId);
      const info = await groupsInfo(sys, groups);
      const members = await groupMembers(sys, groups);
      const out = [];
      for (const gid of groups) {
        const last4 = (await sessionsOf(sys, [gid])).slice(-4);
        const { rows: entries } = await sql<{
          group_session_id: string;
          student_id: string;
          attendance: string;
          score: string | null;
          max_score: string | null;
          observation: string | null;
          confirmed_by: string;
          confirmed_at: Date;
        }>`
          SELECT r.group_session_id, e.student_id, e.attendance, e.score::text, a.max_score::text,
                 e.observation, r.confirmed_by, r.confirmed_at
          FROM records.session_records r JOIN records.record_entries e ON e.session_record_id = r.id
          LEFT JOIN records.assessments a ON a.id = e.assessment_id
          WHERE r.group_id = ${gid} AND r.status = 'confirmed' ORDER BY r.session_date`.execute(
          sys,
        );
        for (const m of members.filter((x) => x.groupId === gid)) {
          const mine = entries.filter((e) => e.student_id === m.studentId);
          const scored = mine.filter((e) => e.score != null && e.max_score).at(-1);
          const c = await sys
            .selectFrom('followup.cases')
            .select(['id', 'status', sql<string>`due_on::text`.as('due_on')])
            .select((eb) =>
              eb
                .selectFrom('followup.case_attempts as a')
                .select(sql<number>`count(*)::int`.as('n'))
                .whereRef('a.case_id', '=', 'followup.cases.id')
                .as('attempts'),
            )
            .where('student_id', '=', m.studentId)
            .where('group_id', '=', gid)
            .where('status', 'in', OPEN)
            .orderBy('created_at', 'desc')
            .executeTakeFirst();
          const note = await sys
            .selectFrom('records.notes')
            .select(['body', 'author_id', 'created_at'])
            .where('student_id', '=', m.studentId)
            .where('group_id', '=', gid)
            .orderBy('created_at', 'desc')
            .executeTakeFirst();
          const obs = mine.filter((e) => e.observation).at(-1);
          const latestNote =
            note && (!obs || note.created_at > obs.confirmed_at)
              ? { body: note.body, authorId: note.author_id, at: note.created_at }
              : obs
                ? { body: obs.observation!, authorId: obs.confirmed_by, at: obs.confirmed_at }
                : null;
          const g = await sys
            .selectFrom('org.guardians as g')
            .leftJoin('identity.users as u', 'u.id', 'g.user_id')
            .select(['u.name', 'u.phone_enc', 'g.phone_encrypted'])
            .where('g.id', '=', m.guardianId)
            .executeTakeFirst();
          const names = latestNote ? await namesOf(sys, [latestNote.authorId]) : new Map();
          out.push({
            student: person(m.studentId, m.name),
            group: { id: gid, name: info.get(gid)!.name[lang] },
            lastSessions: last4.map(
              (s) => (mine.find((e) => e.group_session_id === s.id)?.attendance ?? 'none') as Att,
            ),
            latestScore: scored
              ? { score: Number(scored.score), maxScore: Number(scored.max_score) }
              : null,
            followUp: c
              ? {
                  caseId: c.id,
                  status: c.status as never,
                  overdue: dto.caseOverdue(c, c.attempts ?? 0),
                }
              : null,
            latestNote: latestNote
              ? {
                  body: latestNote.body,
                  author: ref(names, latestNote.authorId),
                  at: latestNote.at.toISOString(),
                }
              : null,
            guardian:
              g && (g.phone_enc || g.phone_encrypted)
                ? { status: 'verified' as const, name: g.name ?? null }
                : { status: 'missing_phone' as const, name: g?.name ?? null },
          });
        }
      }
      return { data: out, nextCursor: null };
    });
  }

  private records(ctx: RlsContext, centreId: string) {
    if (!hasPerm(ctx, centreId, 'records.read'))
      throw forbidden('You need the records.read permission.');
  }

  /** A05 (FUP-REC-12 AC1): the last 2 weeks; only confirmed records count as complete. */
  async sessions(userId: string, centreId: string, lang: Lang) {
    const ctx = await this.ctx(userId, centreId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, centreId);
      this.records(ctx, centreId);
      const today = cairoToday();
      const groups = await this.groupsOf(sys, centreId);
      const info = await groupsInfo(sys, groups);
      const past = (await sessionsOf(sys, groups))
        .filter((s) => s.date >= addDays(today, -14))
        .reverse();
      const recs = await this.recordsBySession(
        sys,
        past.map((s) => s.id),
      );
      const counts = new Map<
        string,
        { present: number; absent: number; late: number; notRecorded: number }
      >();
      const ids = [...recs.values()].map((r) => r.id);
      if (ids.length) {
        const rows = await sys
          .selectFrom('records.record_entries')
          .select(['session_record_id', 'attendance'])
          .where('session_record_id', 'in', ids)
          .execute();
        for (const e of rows) {
          const c = counts.get(e.session_record_id) ?? {
            present: 0,
            absent: 0,
            late: 0,
            notRecorded: 0,
          };
          if (e.attendance === 'not_recorded') c.notRecorded++;
          else c[e.attendance as 'present' | 'absent' | 'late']++;
          counts.set(e.session_record_id, c);
        }
      }
      return {
        data: past.map((s) => {
          const r = recs.get(s.id);
          const g = info.get(s.groupId)!;
          return {
            groupId: s.groupId,
            groupName: g.name[lang],
            teacher: person(g.teacherUserId, g.teacherName),
            sessionDate: s.date,
            startsAt: s.startsAt,
            recordId: r?.id ?? null,
            status: !r
              ? ('not_started' as const)
              : r.status === 'confirmed'
                ? ('confirmed' as const)
                : ('draft' as const),
            attendance: r
              ? (counts.get(r.id) ?? { present: 0, absent: 0, late: 0, notRecorded: 0 })
              : null,
          };
        }),
        nextCursor: null,
      };
    });
  }

  // ── A07 Rules (FUP-RUL-01/02) ──────────────────────────────────────────────────
  private async ruleViews(sys: Tx, centreId: string, lang: Lang, only?: RuleCode) {
    const rules = await centreRules(sys, centreId);
    const versions = await sys
      .selectFrom('followup.rule_versions')
      .selectAll()
      .where('centre_id', '=', centreId)
      .orderBy('version')
      .execute();
    const names = await namesOf(
      sys,
      versions.flatMap((v) => [v.approved_by, v.proposed_by]),
    );
    return rules
      .filter((r) => !only || r.code === only)
      .map((r) => {
        const mine = versions.filter((v) => v.rule_id === r.id);
        const p = mine.find((v) => v.status === 'proposed');
        const pd = p?.definition as { params: Record<string, number>; scope: string } | undefined;
        return {
          code: r.code,
          active: r.active,
          params: r.definition.params,
          scope: r.definition.scope,
          version: r.current_version,
          text: ruleText(r.code, r.definition.params, lang),
          example: RULE_EXAMPLE[r.code][lang],
          proposal:
            p && pd
              ? {
                  active: p.active,
                  params: pd.params,
                  scope: pd.scope,
                  proposedBy: ref(names, p.proposed_by!),
                  at: p.created_at.toISOString(),
                }
              : null,
          history: mine
            .filter((v) => v.status === 'approved' || v.status === 'superseded')
            .map((v) => ({
              version: v.version,
              approvedBy: v.approved_by ? ref(names, v.approved_by) : null,
              at: (v.approved_at ?? v.created_at).toISOString(),
            })),
        };
      });
  }

  async rules(userId: string, centreId: string, lang: Lang) {
    await this.ctx(userId, centreId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, centreId);
      return this.ruleViews(sys, centreId, lang);
    });
  }

  private code(code: string): RuleCode {
    if (!(RULE_CODES as readonly string[]).includes(code))
      throw new Problem(404, 'not_found', 'This rule does not exist.');
    return code as RuleCode;
  }

  /** FUP-RUL-02: the owner's change is a new version at once; a staff change is a proposal. */
  async change(
    userId: string,
    centreId: string,
    rawCode: string,
    b: { active: boolean; params: Record<string, unknown>; scope: string },
    lang: Lang,
    requestId?: string,
  ) {
    const ctx = await this.ctx(userId, centreId);
    const code = this.code(rawCode);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, centreId);
      const rule = (await centreRules(sys, centreId)).find((r) => r.code === code)!;
      const def = await validateChange(sys, centreId, code, b);
      if (roleAt(ctx, centreId) === 'owner') {
        await this.applyVersion(sys, rule, def, b.active, userId, null);
        await writeAudit(sys, {
          actorId: userId,
          actorType: 'user',
          centreId,
          action: 'rule.changed',
          objectType: 'rule',
          objectRef: rule.id,
          after: { rule: code, version: rule.current_version + 1, active: b.active, ...def },
          requestId,
        });
      } else {
        await sys
          .updateTable('followup.rule_versions')
          .set({ status: 'rejected' })
          .where('rule_id', '=', rule.id)
          .where('status', '=', 'proposed')
          .execute();
        await sys
          .insertInto('followup.rule_versions')
          .values({
            id: uuidv7(),
            rule_id: rule.id,
            centre_id: centreId,
            version: rule.current_version + 1,
            definition: JSON.stringify(def),
            active: b.active,
            explanation_template_en: ruleText(code, def.params, 'en'),
            explanation_template_ar: ruleText(code, def.params, 'ar'),
            proposed_by: userId,
            status: 'proposed',
          })
          .execute();
        await writeAudit(sys, {
          actorId: userId,
          actorType: 'user',
          centreId,
          action: 'rule.proposed',
          objectType: 'rule',
          objectRef: rule.id,
          after: { rule: code, active: b.active, ...def },
          requestId,
        });
      }
      return (await this.ruleViews(sys, centreId, lang, code))[0]!;
    });
  }

  private async applyVersion(
    sys: Tx,
    rule: { id: string; centre_id: string; code: RuleCode; current_version: number },
    def: { params: Record<string, number>; scope: string },
    active: boolean,
    approvedBy: string,
    proposalId: string | null,
  ) {
    const version = rule.current_version + 1;
    await sys
      .updateTable('followup.rule_versions')
      .set({ status: 'superseded' })
      .where('rule_id', '=', rule.id)
      .where('status', '=', 'approved')
      .execute();
    if (proposalId)
      await sys
        .updateTable('followup.rule_versions')
        .set({ status: 'approved', approved_by: approvedBy, approved_at: new Date(), version })
        .where('id', '=', proposalId)
        .execute();
    else {
      await sys
        .updateTable('followup.rule_versions')
        .set({ status: 'rejected' })
        .where('rule_id', '=', rule.id)
        .where('status', '=', 'proposed')
        .execute();
      await sys
        .insertInto('followup.rule_versions')
        .values({
          id: uuidv7(),
          rule_id: rule.id,
          centre_id: rule.centre_id,
          version,
          definition: JSON.stringify(def),
          active,
          explanation_template_en: ruleText(rule.code, def.params, 'en'),
          explanation_template_ar: ruleText(rule.code, def.params, 'ar'),
          proposed_by: approvedBy,
          approved_by: approvedBy,
          approved_at: new Date(),
          status: 'approved',
        })
        .execute();
    }
    await sys
      .updateTable('followup.rules')
      .set({ definition: JSON.stringify(def), active, current_version: version })
      .where('id', '=', rule.id)
      .execute();
  }

  async approve(userId: string, centreId: string, rawCode: string, lang: Lang, requestId?: string) {
    const ctx = await this.ctx(userId, centreId);
    const code = this.code(rawCode);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, centreId);
      if (roleAt(ctx, centreId) !== 'owner')
        throw forbidden('Only the owner approves rule changes.');
      const rule = (await centreRules(sys, centreId)).find((r) => r.code === code)!;
      const p = await sys
        .selectFrom('followup.rule_versions')
        .selectAll()
        .where('rule_id', '=', rule.id)
        .where('status', '=', 'proposed')
        .executeTakeFirst();
      if (!p) throw new Problem(409, 'no_proposal', 'Nothing to approve.');
      await this.applyVersion(sys, rule, p.definition as never, p.active, userId, p.id);
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId,
        action: 'rule.approved',
        objectType: 'rule',
        objectRef: rule.id,
        after: { rule: code, version: rule.current_version + 1, proposedBy: p.proposed_by },
        requestId,
      });
      return (await this.ruleViews(sys, centreId, lang, code))[0]!;
    });
  }

  async reject(userId: string, centreId: string, rawCode: string, lang: Lang, requestId?: string) {
    const ctx = await this.ctx(userId, centreId);
    const code = this.code(rawCode);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, centreId);
      if (roleAt(ctx, centreId) !== 'owner')
        throw forbidden('Only the owner decides on rule changes.');
      const rule = (await centreRules(sys, centreId)).find((r) => r.code === code)!;
      const done = await sys
        .updateTable('followup.rule_versions')
        .set({ status: 'rejected' })
        .where('rule_id', '=', rule.id)
        .where('status', '=', 'proposed')
        .returning('id')
        .executeTakeFirst();
      if (!done) throw new Problem(409, 'no_proposal', 'Nothing to reject.');
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId,
        action: 'rule.rejected',
        objectType: 'rule',
        objectRef: rule.id,
        after: { rule: code },
        requestId,
      });
      return (await this.ruleViews(sys, centreId, lang, code))[0]!;
    });
  }

  // ── A17 Activity (FUP-DSH-04): the audit log, readable ─────────────────────────
  async activity(userId: string, centreId: string, lang: Lang) {
    const ctx = await this.ctx(userId, centreId);
    await this.db.asSystem((sys) => requireExtra(sys, centreId));
    // docs/10 §6: owners see their centre's history; the audit is read under RLS (owner policy).
    if (roleAt(ctx, centreId) !== 'owner')
      throw forbidden('Only the owner sees the activity history.');
    const rows = await this.db.asUser(userId, (tx) =>
      tx
        .selectFrom('audit.audit_events')
        .select(['id', 'occurred_at', 'action', 'actor_id', 'after', 'reason'])
        .where('centre_id', '=', centreId)
        .where('action', 'in', Object.keys(ACTIVITY))
        .orderBy('occurred_at', 'desc')
        .limit(200)
        .execute(),
    );
    return this.db.asSystem(async (sys) => {
      const afterOf = (r: (typeof rows)[number]) => (r.after ?? {}) as Record<string, string>;
      const groups = await groupsInfo(
        sys,
        rows.map((r) => afterOf(r).groupId).filter((x): x is string => !!x),
      );
      const names = await namesOf(sys, [
        ...rows.map((r) => r.actor_id),
        ...rows.map((r) => afterOf(r).studentId),
        ...rows.map((r) => afterOf(r).assigneeId),
      ]);
      const since = Date.now() - 7 * 86_400_000;
      const week = rows.filter((r) => r.occurred_at.getTime() >= since);
      return {
        events: rows.map((r) => {
          const a = afterOf(r);
          const spec = ACTIVITY[r.action]!;
          return {
            id: r.id,
            at: r.occurred_at.toISOString(),
            kind: spec.kind,
            text: spec.text(
              {
                student: a.studentId ? (names.get(a.studentId) ?? '') : '',
                group: a.groupId ? (groups.get(a.groupId)?.name[lang] ?? '') : '',
                assignee: a.assigneeId ? (names.get(a.assigneeId) ?? '') : '',
                rule: a.rule ?? '',
                version: a.version ?? '',
                field: a.field ?? '',
                status: a.status ?? '',
                reason: r.reason ?? '',
                date: a.sessionDate ? String(a.sessionDate).slice(0, 10) : '',
              },
              lang,
            ),
            actor: r.actor_id ? ref(names, r.actor_id) : null,
          };
        }),
        week: {
          recordsConfirmed: week.filter((r) => r.action === 'record.confirmed').length,
          followUpsOpened: week.filter((r) => r.action === 'signal.raised').length,
          outcomesRecorded: week.filter((r) => r.action === 'case.outcome').length,
          corrections: week.filter((r) => r.action === 'record.corrected').length,
        },
      };
    });
  }
}

type V = Record<
  'student' | 'group' | 'assignee' | 'rule' | 'version' | 'field' | 'status' | 'reason' | 'date',
  string
>;
type Kind = 'records' | 'followups' | 'messages' | 'corrections' | 'access';
const both = (en: (v: V) => string, ar: (v: V) => string) => (v: V, lang: Lang) =>
  lang === 'ar' ? ar(v) : en(v);
/** A17 lines, built from the audit row's IDs (no personal data is stored in the audit itself). */
const ACTIVITY: Record<string, { kind: Kind; text: (v: V, lang: Lang) => string }> = {
  'record.draft_created': {
    kind: 'records',
    text: both(
      (v) => `Draft record created • ${v.group} (${v.date})`,
      (v) => `تم إنشاء مسودة سجل • ${v.group} (${v.date})`,
    ),
  },
  'record.confirmed': {
    kind: 'records',
    text: both(
      (v) => `Session record confirmed • ${v.group} (${v.date})`,
      (v) => `تم تأكيد سجل الحصة • ${v.group} (${v.date})`,
    ),
  },
  'record.corrected': {
    kind: 'corrections',
    text: both(
      (v) => `Correction: ${v.student} • ${v.field} — original kept`,
      (v) => `تصحيح: ${v.student} • ${v.field} — الأصل محفوظ`,
    ),
  },
  'record.correction_requested': {
    kind: 'records',
    text: both(
      (v) => `Correction requested from the teacher • ${v.group}`,
      (v) => `طُلب تصحيح من المعلّم • ${v.group}`,
    ),
  },
  'note.saved': {
    kind: 'records',
    text: both(
      (v) => `Note saved for ${v.student}`,
      (v) => `ملاحظة محفوظة عن ${v.student}`,
    ),
  },
  'signal.raised': {
    kind: 'followups',
    text: both(
      (v) =>
        `Rule matched: ${v.rule} (v${v.version}) • ${v.student} → follow-up opened, assigned to ${v.assignee}`,
      (v) =>
        `تطابقت قاعدة: ${v.rule} (الإصدار ${v.version}) • ${v.student} ← فُتحت متابعة وأُسندت إلى ${v.assignee}`,
    ),
  },
  'signal.resolved_by_correction': {
    kind: 'followups',
    text: both(
      () => 'A correction resolved a flag: the rule no longer applies',
      () => 'تصحيح أنهى تنبيهًا: القاعدة لم تعد تنطبق',
    ),
  },
  'case.outcome': {
    kind: 'followups',
    text: both(
      (v) => `Outcome recorded on a follow-up (${v.status})`,
      () => 'تم تسجيل نتيجة متابعة',
    ),
  },
  'case.dismissed': {
    kind: 'followups',
    text: both(
      (v) => `Follow-up dismissed: "${v.reason}" — stays in history, can be reopened`,
      (v) => `تم إغلاق المتابعة: "${v.reason}" — تبقى في السجل ويمكن إعادة فتحها`,
    ),
  },
  'case.reopened': {
    kind: 'followups',
    text: both(
      () => 'Follow-up reopened',
      () => 'أعيد فتح متابعة',
    ),
  },
  'message.drafted': {
    kind: 'messages',
    text: both(
      (v) => `Parent message drafted for ${v.student} (not sent)`,
      (v) => `صياغة رسالة لوليّ أمر ${v.student} (لم تُرسل)`,
    ),
  },
  'message.approved': {
    kind: 'messages',
    text: both(
      (v) => `Parent message approved (${v.status})`,
      () => 'تم اعتماد رسالة لوليّ الأمر',
    ),
  },
  'message.sent_manually': {
    kind: 'messages',
    text: both(
      () => 'Parent message sent by hand ("I sent it")',
      () => 'أُرسلت رسالة لوليّ الأمر يدويًا ("أرسلتها")',
    ),
  },
  'message.status': {
    kind: 'messages',
    text: both(
      (v) => `Provider reported: ${v.status}`,
      (v) => `أبلغ المزوّد: ${STATUS_AR[v.status] ?? v.status}`,
    ),
  },
  'message.reply_received': {
    kind: 'messages',
    text: both(
      () => 'Parent reply received',
      () => 'وصل ردّ من وليّ الأمر',
    ),
  },
  'message.stop_received': {
    kind: 'messages',
    text: both(
      () => 'Parent replied STOP: WhatsApp updates stopped at once',
      () => 'ردّ وليّ الأمر بإيقاف: توقفت رسائل واتساب فورًا',
    ),
  },
  'rule.changed': {
    kind: 'access',
    text: both(
      (v) => `Rule "${v.rule}" changed — version ${v.version}`,
      (v) => `تم تعديل القاعدة "${v.rule}" — الإصدار ${v.version}`,
    ),
  },
  'rule.proposed': {
    kind: 'access',
    text: both(
      (v) => `Rule change proposed for "${v.rule}" (needs the owner)`,
      (v) => `اقتراح تعديل القاعدة "${v.rule}" (يحتاج موافقة المالك)`,
    ),
  },
  'rule.approved': {
    kind: 'access',
    text: both(
      (v) => `Rule change approved for "${v.rule}" — version ${v.version}`,
      (v) => `تمت الموافقة على تعديل "${v.rule}" — الإصدار ${v.version}`,
    ),
  },
  'rule.rejected': {
    kind: 'access',
    text: both(
      (v) => `Rule change rejected for "${v.rule}"`,
      (v) => `رُفض تعديل القاعدة "${v.rule}"`,
    ),
  },
  'staff.invited': {
    kind: 'access',
    text: both(
      () => 'Staff invited — invite pending',
      () => 'دعوة موظف — بانتظار القبول',
    ),
  },
};
const STATUS_AR: Record<string, string> = {
  queued: 'في قائمة الإرسال',
  sent: 'أُرسلت',
  delivered: 'وصلت',
  read: 'قُرئت',
  failed: 'فشل الإرسال',
};
