// The demo world's follow-up history (R3). SAMPLE DATA ONLY: Ms Salma's "Sec 2 · Maths" group at
// Al Nour (Wed & Sat) gets confirmed records for the sessions before the latest one — the latest
// stays open, as in the mock ("the session being recorded now"). One sample student is absent from
// the last two, so the real rules engine raises a flag and its case (Reception, now overdue). A
// practice-quiz series, a "needs revisit" observation and one score correction complete the picture.
// Everything goes through the same evaluator the API uses (FUP-RUL-03); nothing is hand-made.
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { DB } from '../src/db/schema';
import { centreRules, evaluate } from '../src/followup/rules';
import { sessionStudents, sessionsOf } from '../src/followup/world';
import { writeAudit } from '../src/platform/audit';
import { uuidv7 } from '../src/platform/ids';
import { addDays, cairoToday } from '../src/platform/time';
import { demoId } from './demo-id';

export async function seedFollowup(migratorUrl: string) {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: migratorUrl, max: 1 }) }),
  });
  const counts: Record<string, number> = {};
  try {
    await db.transaction().execute(async (tx) => {
      const centre = demoId('cen-nour');
      const group = demoId('grp-salma-ws');
      const teacher = demoId('tch-salma');
      const teacherUser = demoId('usr-salma');
      await centreRules(tx, centre);
      // The same "took place or is today" list the API records from, so on a session day the
      // open session is today's (not two open sessions: the absence streak would break).
      const today = cairoToday();
      const past = await sessionsOf(tx, [group], 'past', today);
      const seeded = past.slice(-5, -1);
      if (seeded.length < 2) return;
      const rosters = [];
      for (const s of seeded) rosters.push(await sessionStudents(tx, s.id));
      // The sample student who misses the last two seeded sessions: on both rosters, first by name.
      const lastTwo = rosters.slice(-2);
      const absentee = lastTwo[0]!.find((x) => lastTwo[1]!.some((y) => y.id === x.id))?.id;
      let n = 0;
      for (const [i, s] of seeded.entries()) {
        const roster = rosters[i]!;
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
          })
          .execute();
        // A practice quiz on the two oldest seeded sessions (one series, so the trend is comparable).
        const quiz = i < 2;
        const assessment = quiz ? demoId(`asm:${s.id}`) : null;
        if (assessment)
          await tx
            .insertInto('records.assessments')
            .values({
              id: assessment,
              group_id: group,
              centre_id: centre,
              session_record_id: id,
              title: 'قواعد الإشارات • كويز تدريبي',
              series: 'sign-rules-practice',
              max_score: '20',
              tagging_mode: 'whole_quiz',
              taken_on: s.date,
            })
            .execute();
        const lastSeeded = i === seeded.length - 1;
        await tx
          .insertInto('records.record_entries')
          .values(
            roster.map((st, k) => {
              const absent = i >= seeded.length - 2 && st.id === absentee;
              const score = quiz && !absent && k < 5 ? 11 + ((k * 3 + i * 2) % 9) : null;
              return {
                id: demoId(`ent:${s.id}:${st.id}`),
                session_record_id: id,
                centre_id: centre,
                student_id: st.id,
                attendance: absent ? 'absent' : 'present',
                participation: absent ? 'not_recorded' : 'normal',
                score: score == null ? null : String(score),
                assessment_id: score == null ? null : assessment,
                observation:
                  lastSeeded && k === 1
                    ? 'بيلخبط في قواعد الإشارات في ضرب السالب. نراجعها بمثالين محلولين.'
                    : null,
                observation_tag: lastSeeded && k === 1 ? 'needs_revisit' : null,
              };
            }),
          )
          .execute();
        await tx
          .updateTable('records.session_records')
          .set({ status: 'confirmed', confirmed_by: teacherUser, confirmed_at: at })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, {
          actorId: teacherUser,
          actorType: 'user',
          centreId: centre,
          action: 'record.confirmed',
          objectType: 'session_record',
          objectRef: id,
          after: { groupId: group, sessionId: s.id, sessionDate: s.date, source: 'tap' },
        });
        await evaluate(tx, {
          groupId: group,
          studentIds: roster.map((x) => x.id),
          trigger: 'record',
          upto: s.date,
        });
        n++;
      }
      counts['records.session_records'] = n;
      // The flag was raised two days ago and nobody followed up yet: overdue on A01 (FUP-CAS-05).
      await sql`UPDATE followup.cases SET due_on = ${addDays(today, -2)}::date WHERE group_id = ${group}`.execute(
        tx,
      );
      counts['followup.cases'] = Number(
        (
          await tx
            .selectFrom('followup.cases')
            .select(sql<number>`count(*)::int`.as('n'))
            .executeTakeFirstOrThrow()
        ).n,
      );
      // One correction (FUP-REC-08): a typing error on the first quiz, the original kept.
      const first = seeded[0]!;
      const fix = await tx
        .selectFrom('records.record_entries')
        .select(['id', 'student_id', 'score'])
        .where('session_record_id', '=', demoId(`rec:${first.id}`))
        .where('score', 'is not', null)
        .orderBy('score', 'desc')
        .executeTakeFirst();
      if (fix) {
        const corr = uuidv7();
        await sql`SELECT set_config('app.correction_id', ${corr}, true)`.execute(tx);
        await tx
          .updateTable('records.record_entries')
          .set({ score: '12' })
          .where('id', '=', fix.id)
          .execute();
        await sql`SELECT set_config('app.correction_id', '', true)`.execute(tx);
        await tx
          .insertInto('records.corrections')
          .values({
            id: corr,
            record_entry_id: fix.id,
            session_record_id: demoId(`rec:${first.id}`),
            centre_id: centre,
            student_id: fix.student_id,
            field: 'score',
            old_value: String(Number(fix.score)),
            new_value: '12',
            reason: 'خطأ في الكتابة',
            corrected_by: teacherUser,
          })
          .execute();
        await writeAudit(tx, {
          actorId: teacherUser,
          actorType: 'user',
          centreId: centre,
          action: 'record.corrected',
          objectType: 'record_entry',
          objectRef: fix.id,
          after: {
            recordId: demoId(`rec:${first.id}`),
            groupId: group,
            field: 'score',
            studentId: fix.student_id,
          },
          reason: 'خطأ في الكتابة',
        });
        counts['records.corrections'] = 1;
      }
    });
  } finally {
    await db.destroy();
  }
  return counts;
}
