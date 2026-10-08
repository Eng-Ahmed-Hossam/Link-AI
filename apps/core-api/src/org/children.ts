import { sql } from 'kysely';
import { writeAudit } from '../platform/audit';
import type { Database, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { Problem, forbidden } from '../platform/problem';
import { Reference } from '../ref/reference';

/**
 * Text version of the child-data consent shown when a child is added. A placeholder label until
 * the consent pack is approved (no real data before that, docs/13); the version is stored on every
 * event, so the approved text gets its own label.
 */
export const CHILD_CONSENT_VERSION = 'draft-2026-10';

type Kind =
  | 'terms'
  | 'privacy'
  | 'child_data_processing'
  | 'share_phone_with_teacher'
  | 'whatsapp_updates'
  | 'sms_updates'
  | 'focus_plans'
  | 'ai_training_use';

/** Children and consents of the signed-in parent (MKT-ACC-05, BR-DAT-03). GUARDIAN RLS. */
export class Children {
  constructor(
    private readonly db: Database,
    private readonly ref: Reference,
  ) {}

  list(userId: string, lang: 'ar' | 'en') {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId) return [];
      const rows = await tx
        .selectFrom('org.students')
        .select(['id', 'display_name', 'curriculum_id', 'school_year_id'])
        .where('archived_at', 'is', null)
        .orderBy('created_at')
        .execute();
      return Promise.all(rows.map((r) => this.view(tx, r, lang)));
    });
  }

  add(
    userId: string,
    body: { displayName: string; curriculumId: string; schoolYearId: string },
    lang: 'ar' | 'en',
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId) throw forbidden('Only parents add children. Choose “Parent” first.');
      const year = await tx
        .selectFrom('ref.school_years')
        .select('id')
        .where('id', '=', body.schoolYearId)
        .where('curriculum_id', '=', body.curriculumId)
        .executeTakeFirst();
      if (!year)
        throw new Problem(422, 'validation_failed', 'Pick a school year of this curriculum.', {
          errors: [{ field: 'schoolYearId', code: 'not_in_curriculum' }],
        });
      const id = uuidv7();
      const now = new Date();
      await tx
        .insertInto('org.students')
        .values({
          id,
          display_name: body.displayName,
          curriculum_id: body.curriculumId,
          school_year_id: body.schoolYearId,
          created_by_guardian_id: ctx.guardianId,
        })
        .execute();
      await tx
        .insertInto('org.student_guardians')
        .values({
          student_id: id,
          guardian_id: ctx.guardianId,
          consent_version: CHILD_CONSENT_VERSION,
          consent_at: now,
        })
        .execute();
      await tx
        .insertInto('org.consent_events')
        .values({
          id: uuidv7(),
          user_id: userId,
          guardian_id: ctx.guardianId,
          student_id: id,
          kind: 'child_data_processing',
          granted: true,
          version: CHILD_CONSENT_VERSION,
          source: 'add_child',
        })
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: 'child.added',
        objectType: 'student',
        objectRef: id,
        requestId,
      });
      return this.view(
        tx,
        {
          id,
          display_name: body.displayName,
          curriculum_id: body.curriculumId,
          school_year_id: body.schoolYearId,
        },
        lang,
      );
    });
  }

  private async view(
    tx: Tx,
    r: { id: string; display_name: string; curriculum_id: string; school_year_id: string },
    lang: 'ar' | 'en',
  ) {
    return {
      id: r.id,
      displayName: r.display_name,
      curriculum: await this.ref.curriculumRef(tx, r.curriculum_id, lang),
      schoolYear: await this.ref.schoolYearRef(tx, r.school_year_id, lang),
    };
  }

  /** Latest event per (student, kind) for this person. Never cached (CLAUDE.md). */
  consents(userId: string) {
    return this.db.asUser(userId, (tx) => latestConsents(tx, userId));
  }

  putConsent(
    userId: string,
    body: { kind: Kind; granted: boolean; version: string; studentId?: string },
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (body.studentId) {
        // GUARDIAN RLS hides other families' children, so "not visible" = not their guardian.
        const mine = await tx
          .selectFrom('org.students')
          .select('id')
          .where('id', '=', body.studentId)
          .executeTakeFirst();
        if (!mine) throw forbidden('You are not a guardian of this child.');
      }
      const id = uuidv7();
      await tx
        .insertInto('org.consent_events')
        .values({
          id,
          user_id: userId,
          guardian_id: ctx.guardianId,
          student_id: body.studentId ?? null,
          kind: body.kind,
          granted: body.granted,
          version: body.version,
          source: 'settings',
        })
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        action: body.granted ? 'consent.granted' : 'consent.withdrawn',
        objectType: 'consent_event',
        objectRef: id,
        after: { kind: body.kind, studentId: body.studentId ?? null, version: body.version },
        requestId,
      });
      return latestConsents(tx, userId);
    });
  }
}

async function latestConsents(tx: Tx, userId: string) {
  const rows = await tx
    .selectFrom('org.consent_events')
    .select(['kind', 'student_id', 'granted', 'version', 'created_at'])
    .distinctOn(['student_id', 'kind'])
    .where('user_id', '=', userId)
    .orderBy('student_id')
    .orderBy('kind')
    .orderBy(sql`created_at`, 'desc')
    .execute();
  return rows.map((r) => ({
    kind: r.kind as Kind,
    studentId: r.student_id,
    granted: r.granted,
    version: r.version,
    at: new Date(r.created_at).toISOString(),
  }));
}
