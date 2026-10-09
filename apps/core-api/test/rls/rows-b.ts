// Follow-up rows of centre B (Nile Academy) for the cross-tenant suites (R3). Sample data only,
// written as the table owner, so no check passes vacuously.
import { demoId } from '../../seeds/demo';
import type { Api } from '../helpers';

/** One of each follow-up row at centre B: Ms Salma's Nile Academy group, Youssef's seat. */
export async function followupRowsOfB(api: Api) {
  const b = {
    record: '',
    entry: '',
    request: '',
    note: '',
    voice: '',
    extraction: '',
    case: '',
    message: '',
  };
  const centre = demoId('cen-nile');
  const group = demoId('grp-salma-nile');
  const student = demoId('stu-youssef');
  const s = await api.db
    .selectFrom('market.group_sessions')
    .select(['id', 'starts_at'])
    .where('group_id', '=', group)
    .orderBy('starts_at')
    .executeTakeFirstOrThrow();
  const id = () => crypto.randomUUID();
  b.record = id();
  await api.db
    .insertInto('records.session_records')
    .values({
      id: b.record,
      group_id: group,
      centre_id: centre,
      teacher_id: demoId('tch-salma'),
      group_session_id: s.id,
      session_date: s.starts_at.toISOString().slice(0, 10),
      created_by: demoId('usr-salma'),
    })
    .execute();
  b.entry = id();
  await api.db
    .insertInto('records.record_entries')
    .values({ id: b.entry, session_record_id: b.record, centre_id: centre, student_id: student })
    .execute();
  b.request = id();
  await api.db
    .insertInto('records.correction_requests')
    .values({
      id: b.request,
      session_record_id: b.record,
      centre_id: centre,
      group_id: group,
      text: 'Sample request at centre B',
      requested_by: demoId('usr-owner-b'),
    })
    .execute();
  b.note = id();
  await api.db
    .insertInto('records.notes')
    .values({
      id: b.note,
      student_id: student,
      centre_id: centre,
      group_id: group,
      author_id: demoId('usr-salma'),
      tag: 'behaviour',
      body: 'Sample note at centre B',
    })
    .execute();
  b.voice = id();
  await api.db
    .insertInto('records.voice_notes')
    .values({
      id: b.voice,
      session_record_id: b.record,
      centre_id: centre,
      teacher_id: demoId('tch-salma'),
      created_by: demoId('usr-salma'),
      duration_s: 10,
      data_class: 'synthetic',
    })
    .execute();
  b.extraction = id();
  await api.db
    .insertInto('records.voice_extractions')
    .values({ id: b.extraction, voice_note_id: b.voice, centre_id: centre })
    .execute();
  const rule = id();
  await api.db
    .insertInto('followup.rules')
    .values({
      id: rule,
      centre_id: centre,
      code: 'consecutive_absences',
      definition: JSON.stringify({ params: { n: 2 }, scope: 'all' }),
      active: true,
      current_version: 1,
    })
    .execute();
  const signal = id();
  await api.db
    .insertInto('followup.signals')
    .values({
      id: signal,
      rule_id: rule,
      rule_code: 'consecutive_absences',
      rule_version: 1,
      student_id: student,
      group_id: group,
      centre_id: centre,
      evidence: JSON.stringify({ recordIds: [b.record] }),
      params: JSON.stringify({ n: 2 }),
      explanation_en: 'x',
      explanation_ar: 'x',
      status: 'case_opened',
    })
    .execute();
  b.case = id();
  await api.db
    .insertInto('followup.cases')
    .values({
      id: b.case,
      signal_id: signal,
      centre_id: centre,
      student_id: student,
      group_id: group,
      assignee_id: demoId('usr-owner-b'),
      due_on: '2026-10-01',
    })
    .execute();
  const enr = await api.db
    .selectFrom('market.enrolments')
    .select('guardian_id')
    .where('student_id', '=', student)
    .executeTakeFirstOrThrow();
  b.message = id();
  await api.db
    .insertInto('messaging.messages')
    .values({
      id: b.message,
      centre_id: centre,
      case_id: b.case,
      group_id: group,
      guardian_id: enr.guardian_id,
      student_id: student,
      purpose: 'attendance_followup',
      draft: 'Sample draft at centre B',
      created_by: demoId('usr-owner-b'),
    })
    .execute();
  return b;
}
