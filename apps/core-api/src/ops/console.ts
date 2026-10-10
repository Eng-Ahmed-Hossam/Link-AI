import { sql } from 'kysely';
import { writeAudit } from '../platform/audit';
import type { Database, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, notFound } from '../platform/problem';
import { addDays, cairoToday, isoWeekday } from '../platform/time';
import type { Phones } from '../identity/phone';
import type { Money } from '../payments/money';
import type { OpsPermission } from './access';
import { approveRefundRequest, denyRefundRequest } from './refunds';

/**
 * The ops console's work (S2; MKT-OPS-01..04, -08, -09). Everything except refunds runs as
 * `app_ops` with the caller's RLS context (`db.asOps`): the audit row and the event are written
 * in the same transaction as the change. Refund decisions go through the money paths (SYSTEM),
 * with the ops user recorded as the decider. Every list that shows personal data is audited as
 * a view (MKT-OPS-08 AC2).
 */

type Lang = 'ar' | 'en';
type CheckCode =
  | 'owner_call'
  | 'address_pin_match'
  | 'site_visit_or_video'
  | 'owner_id'
  | 'owner_profile_approval'
  | 'ekyc_id'
  | 'degree'
  | 'reference';
type CheckStatus = 'pending' | 'done' | 'failed' | 'waived';

/** BR-VER-01: the five checks before a centre goes live (in L01's order). */
export const CENTRE_CHECKS: CheckCode[] = [
  'owner_call',
  'address_pin_match',
  'site_visit_or_video',
  'owner_id',
  'owner_profile_approval',
];
/** BR-VER-03/04: the ID check (eKYC, manual review first), then the optional badges. */
export const TEACHER_CHECKS: CheckCode[] = ['ekyc_id', 'degree', 'reference'];

/** BR-VER-02: two working days (Egypt's weekend is Friday and Saturday). */
export function callDueOn(createdOn: string): string {
  let d = createdOn;
  let toGo = 2;
  while (toGo > 0) {
    d = addDays(d, 1);
    const wd = isoWeekday(d);
    if (wd !== 5 && wd !== 6) toGo--;
  }
  return d;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const HOURS_48 = 48 * 3_600_000;
/** PDPL: a reply within 30 days (10 §3; the limit to confirm with the lawyer, OD-60). */
const DATA_REQUEST_DAYS = 30;

type Decided = { ok: true };
const OK: Decided = { ok: true };

export class OpsConsole {
  constructor(
    private readonly db: Database,
    private readonly money: Money,
    private readonly phones: Phones,
  ) {}

  me(userId: string, permissions: OpsPermission[]) {
    return this.db.asOps(userId, async (tx) => {
      const u = await tx
        .selectFrom('identity.users')
        .select('name')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      return { id: userId, name: u.name, permissions };
    });
  }

  // ── Shared: checks, notes, names ────────────────────────────────────────────────
  private async checksOf(tx: Tx, type: 'centre' | 'teacher', ids: string[]) {
    if (!ids.length) return new Map<string, ReturnType<typeof checkView>[]>();
    const rows = await tx
      .selectFrom('org.verification_checks as v')
      .leftJoin('identity.users as u', 'u.id', 'v.done_by')
      .select(['v.subject_id', 'v.check_code', 'v.status', 'v.done_at', 'v.notes', 'u.name'])
      .where('v.subject_type', '=', type)
      .where('v.subject_id', 'in', ids)
      .execute();
    const codes = type === 'centre' ? CENTRE_CHECKS : TEACHER_CHECKS;
    const out = new Map<string, ReturnType<typeof checkView>[]>();
    for (const id of ids)
      out.set(
        id,
        codes.map((code) => {
          const r = rows.find((x) => x.subject_id === id && x.check_code === code);
          return checkView(code, r);
        }),
      );
    return out;
  }

  private async notesOf(tx: Tx, type: string, ids: string[]) {
    const out = new Map<
      string,
      { id: string; body: string; authorName: string; createdAt: string }[]
    >();
    if (!ids.length) return out;
    const rows = await tx
      .selectFrom('org.ops_notes as n')
      .leftJoin('identity.users as u', 'u.id', 'n.author_id')
      .select(['n.id', 'n.subject_id', 'n.body', 'n.created_at', 'u.name'])
      .where('n.subject_type', '=', type)
      .where('n.subject_id', 'in', ids)
      .orderBy('n.created_at')
      .execute();
    for (const r of rows)
      out.set(r.subject_id, [
        ...(out.get(r.subject_id) ?? []),
        { id: r.id, body: r.body, authorName: r.name ?? '', createdAt: iso(r.created_at)! },
      ]);
    return out;
  }

  private viewed(tx: Tx, userId: string, what: string, count: number) {
    return writeAudit(tx, {
      actorId: userId,
      actorType: 'user',
      action: 'ops.viewed',
      objectType: what,
      objectRef: what,
      after: { rows: count },
    });
  }

  // ── L01: centre join requests (MKT-OPS-01) ──────────────────────────────────────
  centreApplications(userId: string, stage?: string) {
    return this.db.asOps(userId, async (tx) => {
      const rows = await tx
        .selectFrom('org.centres as c')
        .leftJoin('identity.users as u', 'u.id', 'c.owner_id')
        .select([
          'c.id',
          'c.name',
          'c.area',
          'c.governorate',
          'c.address',
          'c.verification',
          'c.location_status',
          'c.ops_stage',
          'c.created_at',
          'u.name as owner_name',
          'u.phone_last4',
          sql<number>`(SELECT count(*)::int FROM market.rooms r WHERE r.centre_id = c.id)`.as(
            'halls',
          ),
        ])
        .where('c.archived_at', 'is', null)
        .orderBy('c.created_at', 'desc')
        .limit(500)
        .execute();
      const stageOf = (r: (typeof rows)[number]) =>
        r.verification === 'verified'
          ? ('live' as const)
          : r.verification === 'rejected'
            ? ('rejected' as const)
            : r.verification === 'revoked'
              ? ('revoked' as const)
              : (r.ops_stage as 'new' | 'call_scheduled' | 'visit_booked');
      const picked = rows.filter((r) => !stage || stageOf(r) === stage);
      const ids = picked.map((r) => r.id);
      const checks = await this.checksOf(tx, 'centre', ids);
      const notes = await this.notesOf(tx, 'centre', ids);
      const centres = picked.map((r) => {
        const cs = checks.get(r.id)!;
        const s = stageOf(r);
        return {
          id: r.id,
          name: r.name,
          area: r.area,
          governorate: r.governorate,
          address: r.address,
          ownerName: r.owner_name,
          ownerPhoneLast4: r.phone_last4,
          stage: s,
          locationUnderReview: r.location_status === 'under_review',
          halls: r.halls,
          createdAt: iso(r.created_at)!,
          callDueAt:
            s === 'new' ? `${callDueOn(cairoToday(new Date(r.created_at)))}T23:59:59+02:00` : null,
          checks: cs,
          canApprove: canApproveCentre(r.verification, r.location_status, cs),
          notes: notes.get(r.id) ?? [],
        };
      });
      const leads =
        !stage || stage === 'new'
          ? (
              await tx
                .selectFrom('org.leads')
                .select([
                  'id',
                  'kind',
                  'name',
                  'centre_name',
                  'area',
                  'teacher_count',
                  'status',
                  'created_at',
                ])
                .where('status', 'in', ['new', 'contacted'])
                .orderBy('created_at', 'desc')
                .limit(200)
                .execute()
            ).map((l) => ({
              id: l.id,
              kind: l.kind as 'centre' | 'teacher',
              name: l.name,
              centreName: l.centre_name,
              area: l.area,
              teacherCount: l.teacher_count,
              status: l.status as 'new' | 'contacted',
              createdAt: iso(l.created_at)!,
            }))
          : [];
      await this.viewed(tx, userId, 'centre_applications', centres.length + leads.length);
      return { centres, leads };
    });
  }

  putCheck(
    userId: string,
    type: 'centre' | 'teacher',
    subjectId: string,
    code: CheckCode,
    status: CheckStatus,
    notes: string | undefined,
    requestId?: string,
  ) {
    const allowed = type === 'centre' ? CENTRE_CHECKS : TEACHER_CHECKS;
    if (!allowed.includes(code))
      throw new Problem(422, 'check_not_for', `The ${code} check is not a ${type} check.`);
    return this.db.asOps(userId, async (tx) => {
      const subject =
        type === 'centre'
          ? await tx
              .selectFrom('org.centres')
              .select('id')
              .where('id', '=', subjectId)
              .executeTakeFirst()
          : await tx
              .selectFrom('org.teachers')
              .select('id')
              .where('id', '=', subjectId)
              .executeTakeFirst();
      if (!subject) throw notFound(type);
      const before = await tx
        .selectFrom('org.verification_checks')
        .select('status')
        .where('subject_type', '=', type)
        .where('subject_id', '=', subjectId)
        .where('check_code', '=', code)
        .executeTakeFirst();
      const done = status === 'pending' ? null : new Date();
      const by = status === 'pending' ? null : userId;
      await tx
        .insertInto('org.verification_checks')
        .values({
          id: uuidv7(),
          subject_type: type,
          subject_id: subjectId,
          check_code: code,
          status,
          done_by: by,
          done_at: done,
          notes: notes || null,
        })
        .onConflict((oc) =>
          oc.columns(['subject_type', 'subject_id', 'check_code']).doUpdateSet({
            status,
            done_by: by,
            done_at: done,
            notes: notes || null,
          }),
        )
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: type === 'centre' ? subjectId : null,
        action: 'verification_check.recorded',
        objectType: type,
        objectRef: subjectId,
        before: { check: code, status: before?.status ?? 'pending' },
        after: { check: code, status },
        reason: notes ?? null,
        requestId,
      });
      return OK;
    });
  }

  setCentreStage(
    userId: string,
    id: string,
    stage: 'new' | 'call_scheduled' | 'visit_booked',
    requestId?: string,
  ) {
    return this.db.asOps(userId, async (tx) => {
      const c = await this.centre(tx, id);
      if (!['pending', 'in_review'].includes(c.verification))
        throw new Problem(409, 'already_decided', `This centre is already ${c.verification}.`);
      await tx
        .updateTable('org.centres')
        .set({ ops_stage: stage, verification: stage === 'new' ? 'pending' : 'in_review' })
        .where('id', '=', id)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: id,
        action: 'centre.stage_changed',
        objectType: 'centre',
        objectRef: id,
        before: { stage: c.ops_stage },
        after: { stage },
        requestId,
      });
      return OK;
    });
  }

  approveCentre(userId: string, id: string, requestId?: string) {
    return this.db.asOps(userId, async (tx) => {
      const c = await this.centre(tx, id);
      const checks = (await this.checksOf(tx, 'centre', [id])).get(id)!;
      if (!canApproveCentre(c.verification, c.location_status, checks))
        throw new Problem(
          409,
          'checks_incomplete',
          c.verification === 'verified' && c.location_status === 'under_review'
            ? 'Record the address and pin check first.'
            : 'Every check must be done before approval (BR-VER-01).',
          {
            missing: checks
              .filter((x) => x.status !== 'done')
              .map((x) => x.code)
              .filter((code) => c.verification !== 'verified' || code === 'address_pin_match'),
          },
        );
      await tx
        .updateTable('org.centres')
        .set({ verification: 'verified', verified_at: new Date(), location_status: 'verified' })
        .where('id', '=', id)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: id,
        action: 'centre.verified',
        objectType: 'centre',
        objectRef: id,
        before: { verification: c.verification, locationStatus: c.location_status },
        after: { verification: 'verified', locationStatus: 'verified' },
        reason: 'Ops console (L01)',
        requestId,
      });
      await enqueue(tx, {
        type: 'centre.verified',
        aggregateType: 'centre',
        aggregateId: id,
        centreId: id,
        data: { centreId: id },
        requestId,
      });
      return OK;
    });
  }

  rejectCentre(userId: string, id: string, reason: string, requestId?: string) {
    return this.decideCentre(userId, id, 'rejected', ['pending', 'in_review'], reason, requestId);
  }

  revokeCentre(userId: string, id: string, reason: string, requestId?: string) {
    return this.decideCentre(userId, id, 'revoked', ['verified'], reason, requestId);
  }

  private decideCentre(
    userId: string,
    id: string,
    to: 'rejected' | 'revoked',
    from: string[],
    reason: string,
    requestId?: string,
  ) {
    return this.db.asOps(userId, async (tx) => {
      const c = await this.centre(tx, id);
      if (!from.includes(c.verification))
        throw to === 'revoked'
          ? new Problem(409, 'not_verified', 'Only a verified centre can be revoked.')
          : new Problem(409, 'already_decided', `This centre is already ${c.verification}.`);
      await tx.updateTable('org.centres').set({ verification: to }).where('id', '=', id).execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: id,
        action: `centre.${to}`,
        objectType: 'centre',
        objectRef: id,
        before: { verification: c.verification },
        after: { verification: to },
        reason,
        requestId,
      });
      await enqueue(tx, {
        type: `centre.${to}`,
        aggregateType: 'centre',
        aggregateId: id,
        centreId: id,
        data: { centreId: id },
        requestId,
      });
      return OK;
    });
  }

  private async centre(tx: Tx, id: string) {
    const c = await tx
      .selectFrom('org.centres')
      .select(['id', 'verification', 'location_status', 'ops_stage'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!c) throw notFound('centre');
    return c;
  }

  addNote(
    userId: string,
    b: { subjectType: string; subjectId: string; body: string },
    requestId?: string,
  ) {
    return this.db.asOps(userId, async (tx) => {
      const id = uuidv7();
      const row = await tx
        .insertInto('org.ops_notes')
        .values({
          id,
          subject_type: b.subjectType,
          subject_id: b.subjectId,
          author_id: userId,
          body: b.body,
        })
        .returning('created_at')
        .executeTakeFirstOrThrow();
      const u = await tx
        .selectFrom('identity.users')
        .select('name')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: b.subjectType === 'centre' ? b.subjectId : null,
        action: 'ops_note.added',
        objectType: b.subjectType,
        objectRef: b.subjectId,
        requestId,
      });
      return { id, body: b.body, authorName: u.name ?? '', createdAt: iso(row.created_at)! };
    });
  }

  leadStatus(userId: string, id: string, status: 'contacted' | 'discarded', requestId?: string) {
    return this.db.asOps(userId, async (tx) => {
      const lead = await tx
        .selectFrom('org.leads')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!lead) throw notFound('lead');
      await tx
        .updateTable('org.leads')
        .set({ status, last_contact_at: new Date() })
        .where('id', '=', id)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: 'lead.status_changed',
        objectType: 'lead',
        objectRef: id,
        before: { status: lead.status },
        after: { status },
        requestId,
      });
      return OK;
    });
  }

  // ── Teacher verification (MKT-OPS-02) ───────────────────────────────────────────
  teachers(userId: string, lang: Lang, verification = 'pending') {
    return this.db.asOps(userId, async (tx) => {
      let q = tx
        .selectFrom('org.teachers as t')
        .innerJoin('identity.users as u', 'u.id', 't.user_id')
        .select([
          't.id',
          't.display_name',
          't.verification',
          't.created_at',
          'u.phone_last4',
          sql<number>`(SELECT count(*)::int FROM market.groups g WHERE g.teacher_id = t.id)`.as(
            'groups',
          ),
        ])
        .orderBy('t.created_at', 'desc')
        .limit(500);
      if (verification === 'pending')
        q = q.where('t.verification', 'in', ['not_started', 'pending']);
      else if (verification !== 'all') q = q.where('t.verification', '=', verification);
      const rows = await q.execute();
      const ids = rows.map((r) => r.id);
      const subjects = ids.length
        ? await tx
            .selectFrom('org.teacher_subjects as ts')
            .innerJoin('ref.subjects as s', 's.id', 'ts.subject_id')
            .select(['ts.teacher_id', 's.name_ar', 's.name_en'])
            .where('ts.teacher_id', 'in', ids)
            .execute()
        : [];
      const checks = await this.checksOf(tx, 'teacher', ids);
      const notes = await this.notesOf(tx, 'teacher', ids);
      await this.viewed(tx, userId, 'teacher_queue', rows.length);
      return rows.map((r) => ({
        id: r.id,
        name: r.display_name,
        phoneLast4: r.phone_last4,
        verification: r.verification as
          'not_started' | 'pending' | 'verified' | 'rejected' | 'revoked',
        subjects: [
          ...new Set(
            subjects
              .filter((s) => s.teacher_id === r.id)
              .map((s) => (lang === 'ar' ? s.name_ar : s.name_en)),
          ),
        ],
        groups: r.groups,
        createdAt: iso(r.created_at)!,
        checks: checks.get(r.id)!,
        notes: notes.get(r.id) ?? [],
      }));
    });
  }

  decideTeacher(
    userId: string,
    id: string,
    to: 'verified' | 'rejected' | 'revoked',
    reason: string | undefined,
    requestId?: string,
  ) {
    return this.db.asOps(userId, async (tx) => {
      const t = await tx
        .selectFrom('org.teachers')
        .select(['id', 'verification'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!t) throw notFound('teacher');
      const from =
        to === 'revoked' ? ['verified'] : ['not_started', 'pending', 'rejected', 'revoked'];
      if (to === 'rejected' && t.verification === 'rejected')
        throw new Problem(409, 'already_decided', 'This teacher is already rejected.');
      if (!from.includes(t.verification))
        throw to === 'revoked'
          ? new Problem(409, 'not_verified', 'Only a verified teacher can be revoked.')
          : new Problem(409, 'already_decided', `This teacher is already ${t.verification}.`);
      await tx
        .updateTable('org.teachers')
        .set({ verification: to, verified_at: to === 'verified' ? new Date() : null })
        .where('id', '=', id)
        .execute();
      // The ID check carries the decision (manual review until the eKYC adapter, OD-19).
      if (to !== 'revoked') {
        const status = to === 'verified' ? 'done' : 'failed';
        await tx
          .insertInto('org.verification_checks')
          .values({
            id: uuidv7(),
            subject_type: 'teacher',
            subject_id: id,
            check_code: 'ekyc_id',
            status,
            done_by: userId,
            done_at: new Date(),
            notes: reason || null,
          })
          .onConflict((oc) =>
            oc
              .columns(['subject_type', 'subject_id', 'check_code'])
              .doUpdateSet({ status, done_by: userId, done_at: new Date(), notes: reason || null }),
          )
          .execute();
      }
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: `teacher.${to}`,
        objectType: 'teacher',
        objectRef: id,
        before: { verification: t.verification },
        after: { verification: to },
        reason: reason ?? null,
        requestId,
      });
      await enqueue(tx, {
        type: `teacher.${to}`,
        aggregateType: 'teacher',
        aggregateId: id,
        data: { teacherId: id },
        requestId,
      });
      return OK;
    });
  }

  // ── L02: review moderation (MKT-OPS-03, BR-REV-05) ──────────────────────────────
  reviewQueue(userId: string) {
    return this.db.asOps(userId, async (tx) => {
      const rows = await tx
        .selectFrom('market.reviews as r')
        .innerJoin('org.centres as c', 'c.id', 'r.centre_id')
        .leftJoin('org.teachers as t', (j) =>
          j.onRef('t.id', '=', 'r.target_id').on('r.target_type', '=', 'teacher'),
        )
        .select([
          'r.id',
          'r.stars',
          'r.body',
          'r.tags',
          'r.visibility',
          'r.status',
          'r.flags',
          'r.target_type',
          'r.created_at',
          'c.name as centre_name',
          't.display_name as teacher_name',
        ])
        .where((w) =>
          w.or([
            w('r.status', 'in', ['held', 'pending_checks']),
            w.exists(
              w
                .selectFrom('market.review_reports as rp')
                .select('rp.id')
                .whereRef('rp.review_id', '=', 'r.id')
                .where('rp.resolved_at', 'is', null),
            ),
          ]),
        )
        .orderBy('r.created_at')
        .limit(200)
        .execute();
      const ids = rows.map((r) => r.id);
      const reports = ids.length
        ? await tx
            .selectFrom('market.review_reports')
            .select(['review_id', 'reason', 'created_at'])
            .where('review_id', 'in', ids)
            .where('resolved_at', 'is', null)
            .orderBy('created_at')
            .execute()
        : [];
      await this.viewed(tx, userId, 'review_queue', rows.length);
      return rows.map((r) => {
        const mine = reports.filter((x) => x.review_id === r.id);
        const heldSince = ['held', 'pending_checks'].includes(r.status) ? r.created_at : null;
        const since = [heldSince, ...mine.map((x) => x.created_at)]
          .filter((d): d is Date => !!d)
          .map((d) => new Date(d).getTime());
        return {
          id: r.id,
          stars: r.stars,
          body: r.body,
          tags: r.tags,
          visibility: r.visibility as 'public' | 'private',
          status: r.status as 'pending_checks' | 'published' | 'held' | 'needs_edit' | 'hidden',
          flags: r.flags,
          targetType: r.target_type as 'centre' | 'teacher',
          targetName: r.target_type === 'teacher' ? (r.teacher_name ?? '') : r.centre_name,
          centreName: r.centre_name,
          reports: mine.map((x) => ({ reason: x.reason, createdAt: iso(x.created_at)! })),
          createdAt: iso(r.created_at)!,
          dueAt: new Date(Math.min(...since) + HOURS_48).toISOString(),
        };
      });
    });
  }

  decideReview(
    userId: string,
    id: string,
    decision: 'publish' | 'hide' | 'request_edit',
    note: string | undefined,
    requestId?: string,
  ) {
    if (decision === 'request_edit' && !note?.trim())
      throw new Problem(422, 'reason_required', 'Say what the parent should change.');
    return this.db.asOps(userId, async (tx) => {
      const r = await tx
        .selectFrom('market.reviews')
        .select(['id', 'status', 'centre_id', 'published_at'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!r) throw notFound('review');
      const status =
        decision === 'publish' ? 'published' : decision === 'hide' ? 'hidden' : 'needs_edit';
      await tx
        .updateTable('market.reviews')
        .set({
          status,
          ...(decision === 'publish' && !r.published_at ? { published_at: new Date() } : {}),
        })
        .where('id', '=', id)
        .execute();
      await tx
        .updateTable('market.review_reports')
        .set({ resolved_at: new Date(), resolution: decision })
        .where('review_id', '=', id)
        .where('resolved_at', 'is', null)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: r.centre_id,
        action: `review.${decision === 'request_edit' ? 'edit_requested' : status}`,
        objectType: 'review',
        objectRef: id,
        before: { status: r.status },
        after: { status },
        reason: note ?? null,
        requestId,
      });
      await enqueue(tx, {
        type: 'review.moderated',
        aggregateType: 'review',
        aggregateId: id,
        centreId: r.centre_id,
        data: { reviewId: id, decision },
        requestId,
      });
      return OK;
    });
  }

  // ── L03: refunds (MKT-OPS-04, BR-REF-07, OD-42) ─────────────────────────────────
  refunds(userId: string, status = 'requested') {
    return this.db.asOps(userId, async (tx) => {
      let q = tx
        .selectFrom('ledger.refunds as r')
        .innerJoin('ledger.payments as p', 'p.id', 'r.payment_id')
        .leftJoin('org.centres as c', 'c.id', 'p.centre_id')
        .leftJoin('market.enrolments as e', 'e.id', 'r.enrolment_id')
        .leftJoin('org.teachers as t', 't.id', 'e.teacher_id')
        .leftJoin('market.group_sessions as s', 's.id', 'e.first_session_id')
        .select([
          'r.id',
          'r.status',
          'r.policy',
          'r.auto_eligible',
          'r.amount_pt',
          'r.reason',
          'r.created_at',
          'r.approved_at',
          'r.updated_at',
          'p.amount_pt as paid_pt',
          'p.commission_pt',
          'p.succeeded_at',
          'c.name as centre_name',
          't.display_name as teacher_name',
          'e.reference',
          'e.status as enrolment_status',
          's.starts_at',
        ])
        .orderBy('r.created_at', status === 'requested' ? 'asc' : 'desc')
        .limit(200);
      if (status !== 'all') q = q.where('r.status', '=', status);
      const rows = await q.execute();
      await this.viewed(tx, userId, 'refund_queue', rows.length);
      const egp = (pt: string | number | null) => ({
        amountPt: Number(pt ?? 0),
        currency: 'EGP' as const,
      });
      return rows.map((r) => ({
        id: r.id,
        status: r.status as 'requested',
        policy: r.policy,
        autoEligible: r.auto_eligible,
        amount: egp(r.amount_pt),
        reason: r.reason,
        centreName: r.centre_name,
        teacherName: r.teacher_name,
        enrolmentRef: r.reference,
        enrolmentStatus: r.enrolment_status,
        paid: egp(r.paid_pt),
        commission: egp(r.commission_pt),
        paidAt: iso(r.succeeded_at),
        firstSessionAt: iso(r.starts_at),
        requestedAt: iso(r.created_at)!,
        decidedAt: r.status === 'requested' ? null : iso(r.approved_at ?? r.updated_at),
      }));
    });
  }

  async approveRefund(userId: string, id: string): Promise<Decided> {
    await approveRefundRequest(this.db, this.money, id, { userId });
    return OK;
  }

  async rejectRefund(userId: string, id: string, reason: string): Promise<Decided> {
    await denyRefundRequest(this.db, id, reason, { userId });
    return OK;
  }

  // ── Audit lookup (MKT-OPS-08) ───────────────────────────────────────────────────
  audit(userId: string, objectType: string, objectRef: string) {
    return this.db.asOps(userId, async (tx) => {
      const rows = await tx
        .selectFrom('audit.audit_events as a')
        .leftJoin('identity.users as u', 'u.id', 'a.actor_id')
        .select([
          'a.id',
          'a.occurred_at',
          'a.actor_type',
          'a.action',
          'a.object_type',
          'a.object_ref',
          'a.reason',
          'u.name',
        ])
        .where('a.object_type', '=', objectType)
        .where('a.object_ref', '=', objectRef)
        .orderBy('a.occurred_at', 'desc')
        .limit(100)
        .execute();
      return rows.map((r) => ({
        id: r.id,
        occurredAt: iso(r.occurred_at)!,
        actorName: r.name,
        actorType: r.actor_type,
        action: r.action,
        objectType: r.object_type,
        objectRef: r.object_ref,
        reason: r.reason,
      }));
    });
  }

  // ── Data-subject requests (MKT-OPS-09) ──────────────────────────────────────────
  dataRequests(userId: string, status = 'open') {
    return this.db.asOps(userId, async (tx) => {
      let q = tx
        .selectFrom('identity.data_requests as d')
        .innerJoin('identity.users as u', 'u.id', 'd.user_id')
        .select([
          'd.id',
          'd.user_id',
          'd.kind',
          'd.details',
          'd.status',
          'd.outcome',
          'd.created_at',
          'd.completed_at',
          'u.name',
          'u.phone_last4',
          sql<string[]>`ARRAY(SELECT DISTINCT ra.role FROM identity.role_assignments ra
            WHERE ra.user_id = d.user_id AND ra.status = 'active' ORDER BY ra.role)`.as('roles'),
        ])
        .orderBy('d.created_at', status === 'open' ? 'asc' : 'desc')
        .limit(200);
      if (status !== 'all') q = q.where('d.status', '=', status);
      const rows = await q.execute();
      await this.viewed(tx, userId, 'data_requests', rows.length);
      return rows.map((r) => ({
        ...dataRequestView(r),
        userName: r.name,
        phoneLast4: r.phone_last4,
        roles: r.roles,
        dueAt: new Date(
          new Date(r.created_at).getTime() + DATA_REQUEST_DAYS * 86_400_000,
        ).toISOString(),
      }));
    });
  }

  /**
   * An access request (PDPL): everything Link holds about the person who asked, as JSON, for ops
   * to send them securely. Gathered as the system (it spans every context); the export itself is
   * audited. Never another person's data: only rows keyed on this user or their guardian profile.
   */
  async exportDataRequest(userId: string, id: string, requestId?: string) {
    const d = await this.db.asOps(userId, async (tx) => {
      const row = await tx
        .selectFrom('identity.data_requests')
        .select(['id', 'user_id', 'kind'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw notFound('data request');
      if (row.kind !== 'access')
        throw new Problem(409, 'not_access_request', 'Only a copy (access) request is exported.');
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: 'data_request.exported',
        objectType: 'data_request',
        objectRef: id,
        requestId,
      });
      return row;
    });
    const subject = d.user_id;
    return this.db.asSystem(async (tx) => {
      const u = await tx
        .selectFrom('identity.users')
        .select(['id', 'name', 'language', 'phone_enc', 'created_at'])
        .where('id', '=', subject)
        .executeTakeFirstOrThrow();
      const rows = async (q: ReturnType<typeof sql<Record<string, unknown>>>) =>
        (await q.execute(tx)).rows;
      const g = await tx
        .selectFrom('org.guardians')
        .select(['id', 'home_area'])
        .where('user_id', '=', subject)
        .executeTakeFirst();
      const gid = g?.id ?? null;
      const sections = {
        roles:
          await rows(sql`SELECT role, centre_id AS "centreId", status, created_at AS "createdAt"
          FROM identity.role_assignments WHERE user_id = ${subject} ORDER BY created_at`),
        consents: await rows(sql`SELECT kind, student_id AS "studentId", granted, version, source,
          created_at AS "at" FROM org.consent_events
          WHERE user_id = ${subject} OR (${gid}::uuid IS NOT NULL AND guardian_id = ${gid}::uuid)
          ORDER BY created_at`),
        children: await rows(sql`SELECT s.id, s.display_name AS "name", c.code AS curriculum,
          y.name_en AS "schoolYear", sg.relation, sg.consent_version AS "consentVersion"
          FROM org.student_guardians sg JOIN org.students s ON s.id = sg.student_id
          JOIN ref.curricula c ON c.id = s.curriculum_id JOIN ref.school_years y ON y.id = s.school_year_id
          WHERE sg.guardian_id = ${gid}::uuid ORDER BY s.created_at`),
        enrolments: await rows(sql`SELECT e.reference, e.status, e.payment_plan AS plan,
          e.price_pt AS "pricePt", ce.name AS centre, t.display_name AS teacher, e.created_at AS "createdAt"
          FROM market.enrolments e JOIN org.centres ce ON ce.id = e.centre_id
          JOIN org.teachers t ON t.id = e.teacher_id
          WHERE e.guardian_id = ${gid}::uuid ORDER BY e.created_at`),
        payments: await rows(sql`SELECT p.kind, p.amount_pt AS "amountPt", p.method, p.status,
          p.card_last4 AS "cardLast4", p.succeeded_at AS "paidAt", p.created_at AS "createdAt"
          FROM ledger.payments p WHERE p.payer_user_id = ${subject} ORDER BY p.created_at`),
        refunds: await rows(sql`SELECT r.amount_pt AS "amountPt", r.policy, r.status, r.reason,
          r.created_at AS "createdAt" FROM ledger.refunds r JOIN ledger.payments p ON p.id = r.payment_id
          WHERE p.payer_user_id = ${subject} ORDER BY r.created_at`),
        reviews:
          await rows(sql`SELECT target_type AS "targetType", stars, tags, body, visibility, status,
          created_at AS "createdAt" FROM market.reviews WHERE guardian_id = ${gid}::uuid ORDER BY created_at`),
        teacherProfile:
          await rows(sql`SELECT display_name AS name, bio_ar AS "bioAr", bio_en AS "bioEn",
          years_experience AS "yearsExperience", verification, created_at AS "createdAt"
          FROM org.teachers WHERE user_id = ${subject}`),
        centresOwned:
          await rows(sql`SELECT name, area, address, verification, created_at AS "createdAt"
          FROM org.centres WHERE owner_id = ${subject}`),
        payoutAccounts: await rows(sql`SELECT owner_type AS "ownerType", kind,
          display_last4 AS "last4", status FROM ledger.payout_accounts pa
          WHERE (owner_type = 'teacher' AND owner_id IN (SELECT id FROM org.teachers WHERE user_id = ${subject}))
             OR (owner_type = 'centre' AND owner_id IN (SELECT id FROM org.centres WHERE owner_id = ${subject}))`),
        dataRequests: await rows(sql`SELECT kind, status, outcome, created_at AS "createdAt",
          completed_at AS "completedAt" FROM identity.data_requests WHERE user_id = ${subject}
          ORDER BY created_at`),
      };
      return {
        generatedAt: new Date().toISOString(),
        dataRequestId: id,
        person: {
          id: u.id,
          name: u.name,
          phone: u.phone_enc ? this.phones.decrypt(u.phone_enc) : null,
          language: u.language,
          homeArea: g?.home_area ?? null,
          createdAt: iso(u.created_at),
        },
        sections: JSON.parse(JSON.stringify(sections)) as Record<string, Record<string, unknown>[]>,
      };
    });
  }

  completeDataRequest(
    userId: string,
    id: string,
    result: 'completed' | 'rejected',
    outcome: string,
    requestId?: string,
  ) {
    return this.db.asOps(userId, async (tx) => {
      const d = await tx
        .selectFrom('identity.data_requests')
        .select(['id', 'status', 'kind'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!d) throw notFound('data request');
      if (d.status !== 'open')
        throw new Problem(409, 'already_decided', `This request is already ${d.status}.`);
      await tx
        .updateTable('identity.data_requests')
        .set({ status: result, outcome, completed_by: userId, completed_at: new Date() })
        .where('id', '=', id)
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: `data_request.${result}`,
        objectType: 'data_request',
        objectRef: id,
        before: { status: 'open' },
        after: { status: result, kind: d.kind },
        reason: outcome,
        requestId,
      });
      await enqueue(tx, {
        type: `data_request.${result}`,
        aggregateType: 'data_request',
        aggregateId: id,
        data: { dataRequestId: id, kind: d.kind },
        requestId,
      });
      return OK;
    });
  }
}

function checkView(
  code: CheckCode,
  r:
    { status: string; done_at: Date | null; notes: string | null; name: string | null } | undefined,
) {
  return {
    code,
    status: (r?.status ?? 'pending') as CheckStatus,
    doneByName: r?.name ?? null,
    doneAt: iso(r?.done_at),
    notes: r?.notes ?? null,
  };
}

/**
 * MKT-OPS-01 AC2: a new centre needs every BR-VER-01 check done; a verified centre whose owner
 * moved the pin (CF-44) needs only the address and pin check again.
 */
function canApproveCentre(
  verification: string,
  locationStatus: string,
  checks: { code: CheckCode; status: CheckStatus }[],
) {
  if (verification === 'verified')
    return (
      locationStatus === 'under_review' &&
      checks.find((c) => c.code === 'address_pin_match')?.status === 'done'
    );
  if (!['pending', 'in_review'].includes(verification)) return false;
  return checks.every((c) => c.status === 'done');
}

export function dataRequestView(r: {
  id: string;
  kind: string;
  details: string;
  status: string;
  outcome: string | null;
  created_at: Date;
  completed_at: Date | null;
}) {
  return {
    id: r.id,
    kind: r.kind as 'access' | 'correction' | 'deletion',
    details: r.details,
    status: r.status as 'open' | 'completed' | 'rejected',
    outcome: r.outcome,
    createdAt: iso(r.created_at)!,
    completedAt: iso(r.completed_at),
  };
}
