import { sql } from 'kysely';
import type { Database } from '../platform/db';
import type { Job } from '../worker/jobs';

/**
 * Scheduled work for the student features (docs/10 §4 retention; docs/03 STU-TOP-01 snapshots).
 * Both are rerun-safe: deleting what is past its time, and snapshotting with ON CONFLICT DO NOTHING.
 */
export class StudentJobs {
  constructor(private readonly db: Database) {}

  /** Access codes (HMAC only) after 24 h; removed devices after 90 days; notifications after 90 days. */
  retention(now = new Date()) {
    const day = 86_400_000;
    return this.db.asSystem(async (sys) => {
      const codesBefore = new Date(now.getTime() - day);
      const devicesBefore = new Date(now.getTime() - 90 * day);
      // A code still named by a device keeps the device; the link is dropped first.
      await sys
        .updateTable('identity.student_devices')
        .set({ access_code_id: null })
        .where(
          'access_code_id',
          'in',
          sys
            .selectFrom('identity.student_access_codes')
            .select('id')
            .where('created_at', '<', codesBefore),
        )
        .execute();
      const codes = await sys
        .deleteFrom('identity.student_access_codes')
        .where('created_at', '<', codesBefore)
        .executeTakeFirst();
      const old = sys
        .selectFrom('identity.student_devices')
        .select('id')
        .where('revoked_at', '<', devicesBefore);
      await sys
        .updateTable('identity.auth_sessions')
        .set({ student_device_id: null })
        .where('student_device_id', 'in', old)
        .execute();
      const devices = await sys
        .deleteFrom('identity.student_devices')
        .where('revoked_at', '<', devicesBefore)
        .executeTakeFirst();
      const notes = await sys
        .deleteFrom('messaging.in_app_notifications')
        .where('created_at', '<', new Date(now.getTime() - 90 * day))
        .executeTakeFirst();
      return {
        codes: Number(codes.numDeletedRows),
        devices: Number(devices.numDeletedRows),
        notifications: Number(notes.numDeletedRows),
      };
    });
  }

  /** On the 1st (Cairo): every student's topic scores, as they stand, for the month that ended. */
  snapshot(now = new Date()) {
    const c = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const m = new Date(c.getFullYear(), c.getMonth() - 1, 1);
    const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    return this.db.asSystem(async (sys) => {
      const r = await sql`
        INSERT INTO analytics.topic_score_snapshots
          (id, student_id, group_id, centre_id, topic_node_id, month, score, score_display, band, quiz_count)
        SELECT platform.uuidv7(), s.student_id, s.group_id, s.centre_id, s.topic_node_id, ${month}::date,
               s.score, s.score_display, s.band, s.quiz_count
        FROM analytics.student_topic_scores s
        ON CONFLICT (student_id, group_id, topic_node_id, month) DO NOTHING`.execute(sys);
      return { month, rows: Number(r.numAffectedRows ?? 0) };
    });
  }
}

export function studentJobs(d: { jobs: StudentJobs }): Job[] {
  return [
    { name: 'student-retention', dailyAt: '04:30', run: () => d.jobs.retention() },
    { name: 'topic-snapshots', dailyAt: '01:30', monthDay: 1, run: () => d.jobs.snapshot() },
  ];
}
