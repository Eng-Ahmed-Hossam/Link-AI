// A5 pseudonymised roster import (FUP-ONB-02 checks).
import { describe, expect, it } from 'vitest';
import { applyPlan, parseCsv, planImport } from '../src/roster';
import { testWorld } from './helpers';

const HEAD =
  'group_code,group_name,teacher_first_name,student_code,student_display_name,guardian_label';
const SCHED = 'group_code,weekday,start_time,end_time\nM3,sat,17:00,18:30\nM3,الثلاثاء,17:00,18:30';
const roster = (...rows: string[]) => [HEAD, ...rows].join('\r\n');
const ok = roster(
  'M3,رياضيات ٣ث,سلوى,S01,مريم,ولي أمر ١',
  'M3,رياضيات ٣ث,سلوى,S02,"أحمد س.",ولي أمر ٢',
  'M3,رياضيات ٣ث,سلوى,S03,أحمد م.,ولي أمر ٣',
);
const errors = (p: ReturnType<typeof planImport>) =>
  p.issues.filter((i) => i.level === 'error').map((i) => i.message);

describe('pilot:import (A5)', () => {
  it('parses CSV with a BOM, quotes and CRLF', () => {
    expect(parseCsv('﻿a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('a clean roster plans with no errors and the schedule in ISO weekdays', () => {
    const p = planImport(ok, SCHED);
    expect(errors(p)).toEqual([]);
    expect(p.groups).toEqual([
      {
        code: 'M3',
        name: 'رياضيات ٣ث',
        teacher: 'سلوى',
        students: 3,
        slots: ['Sat 17:00–18:30', 'Tue 17:00–18:30'],
      },
    ]);
  });

  it('duplicate codes, empty fields and an unknown group are errors', () => {
    const p = planImport(
      roster(
        'M3,رياضيات,سلوى,S01,مريم,ولي أمر ١',
        'M3,رياضيات,سلوى,S01,مريم,ولي أمر ١',
        'M3,رياضيات,سلوى,S02,,ولي أمر ٢',
      ),
      'group_code,weekday,start_time,end_time\nM3,sat,17:00,18:00\nX9,sun,10:00,11:00',
    );
    const e = errors(p);
    expect(e).toContain('Student S01 is listed twice in M3.');
    expect(e).toContain('Empty "student_display_name".');
    expect(e).toContain('Unknown group X9 (not in the roster).');
  });

  it('two students with the same display name in one group need a disambiguator', () => {
    const p = planImport(roster('M3,ر,سلوى,S01,أحمد,و ١', 'M3,ر,سلوى,S02,أحمد,و ٢'), SCHED);
    expect(errors(p)).toContain(
      'Group M3: "أحمد" is used by S01, S02. Add a disambiguator, e.g. "أحمد س.".',
    );
  });

  it('no phone numbers or IDs, no family names, a schedule for every group', () => {
    const p = planImport(
      roster('M3,ر,سلوى,S01,مريم,ولي أمر ٠١٠٠١٢٣٤٥٦٧', 'K1,ك,هبة,S02,عمر محمد عبد الله أحمد,و ٢'),
      SCHED,
    );
    const e = errors(p);
    expect(e).toContain(
      '"guardian_label" looks like a phone number or ID. The pilot stores neither.',
    );
    expect(e).toContain('student_display_name: a first name or nickname only, no family name.');
    expect(e).toContain('Group K1 has no schedule row.');
  });

  it('wrong columns are refused', () => {
    expect(errors(planImport('code,name\nA,B', SCHED))[0]).toContain('The columns must be exactly');
  });

  it('apply adds groups, students, guardian labels (no phone) and teachers without a PIN', () => {
    const w = testWorld();
    let n = 10;
    const added = applyPlan(w, planImport(ok, SCHED), () => `usr-p0${++n}`);
    expect(added).toEqual({ groups: 1, students: 3, teachers: [], memberships: 3 }); // سلوى exists
    const g = w.groups.find((x) => x.id === 'grp-p-M3')!;
    expect(g.weekdays).toEqual([2, 6]);
    expect(g.teacherUserId).toBe('usr-p002');
    expect(w.guardians.every((x) => x.phone === null)).toBe(true);
    // Re-import is idempotent; a changed name for a known code is refused.
    expect(applyPlan(w, planImport(ok, SCHED, w), () => 'x')).toEqual({
      groups: 0,
      students: 0,
      teachers: [],
      memberships: 0,
    });
    expect(errors(planImport(roster('M3,رياضيات ٣ث,سلوى,S01,ملك,ولي أمر ١'), SCHED, w))).toContain(
      'Student S01 is already "مريم".',
    );
  });
});
