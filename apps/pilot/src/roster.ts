/**
 * Pseudonymised roster import (A5, FUP-ONB-02 checks). Pure functions: parse two CSV files, check
 * them, and merge them into the pilot world. `cli/import.ts` prints the dry run and applies.
 *
 * roster.csv:   group_code, group_name, teacher_first_name, student_code, student_display_name, guardian_label
 * schedule.csv: group_code, weekday, start_time, end_time   (the rule needs scheduled sessions)
 *
 * No phone numbers and no national IDs: any field with 8 or more digits is refused.
 */
import type { WorldData, WorldGroup, WorldUser } from '@link/mocks/world';

export const ROSTER_COLUMNS = [
  'group_code',
  'group_name',
  'teacher_first_name',
  'student_code',
  'student_display_name',
  'guardian_label',
] as const;
export const SCHEDULE_COLUMNS = ['group_code', 'weekday', 'start_time', 'end_time'] as const;

/** RFC 4180 CSV (quotes, commas and newlines inside quotes, UTF-8 BOM, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const BOM = String.fromCharCode(0xfeff);
  const s = text.startsWith(BOM) ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export interface Issue {
  level: 'error' | 'warning';
  file: 'roster' | 'schedule';
  row: number | null;
  message: string;
}

const WEEKDAYS: Record<string, number> = {
  mon: 1,
  monday: 1,
  الاثنين: 1,
  الإثنين: 1,
  tue: 2,
  tuesday: 2,
  الثلاثاء: 2,
  wed: 3,
  wednesday: 3,
  الأربعاء: 3,
  الاربعاء: 3,
  thu: 4,
  thursday: 4,
  الخميس: 4,
  fri: 5,
  friday: 5,
  الجمعة: 5,
  sat: 6,
  saturday: 6,
  السبت: 6,
  sun: 7,
  sunday: 7,
  الأحد: 7,
  الاحد: 7,
};
const toLatinDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
const digitsIn = (s: string) => (toLatinDigits(s).match(/\d/g) ?? []).length;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const safeCode = (s: string) => /^[A-Za-z0-9_-]{1,32}$/.test(s);
const time = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(toLatinDigits(s.trim()));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
};

export interface RosterRow {
  groupCode: string;
  groupName: string;
  teacher: string;
  studentCode: string;
  studentName: string;
  guardianLabel: string;
}
export interface ScheduleRow {
  groupCode: string;
  weekday: number;
  startTime: string;
  endTime: string;
}
export interface Plan {
  issues: Issue[];
  roster: RosterRow[];
  schedule: ScheduleRow[];
  groups: { code: string; name: string; teacher: string; students: number; slots: string[] }[];
  teachers: string[];
}

function table<C extends readonly string[]>(
  text: string,
  cols: C,
  file: Issue['file'],
  issues: Issue[],
): Record<C[number], string>[] {
  const rows = parseCsv(text);
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  if (head.join(',') !== cols.join(',')) {
    issues.push({
      level: 'error',
      file,
      row: 1,
      message: `The columns must be exactly: ${cols.join(', ')}`,
    });
    return [];
  }
  return rows.slice(1).map((r, i) => {
    if (r.length !== cols.length)
      issues.push({
        level: 'error',
        file,
        row: i + 2,
        message: `Expected ${cols.length} values, found ${r.length}.`,
      });
    return Object.fromEntries(cols.map((c, j) => [c, (r[j] ?? '').trim()])) as Record<
      C[number],
      string
    >;
  });
}

/** Check both files. Errors block `--apply`; warnings are shown. */
export function planImport(rosterCsv: string, scheduleCsv: string, existing?: WorldData): Plan {
  const issues: Issue[] = [];
  const raw = table(rosterCsv, ROSTER_COLUMNS, 'roster', issues);
  const rawS = table(scheduleCsv, SCHEDULE_COLUMNS, 'schedule', issues);
  const roster: RosterRow[] = [];
  const err = (file: Issue['file'], row: number | null, message: string) =>
    issues.push({ level: 'error', file, row, message });
  const warn = (file: Issue['file'], row: number | null, message: string) =>
    issues.push({ level: 'warning', file, row, message });

  raw.forEach((r, i) => {
    const row = i + 2;
    for (const c of ROSTER_COLUMNS) if (!r[c]) err('roster', row, `Empty "${c}".`);
    for (const c of ROSTER_COLUMNS)
      if (digitsIn(r[c]) >= 8)
        err('roster', row, `"${c}" looks like a phone number or ID. The pilot stores neither.`);
    if (r.group_code && !safeCode(r.group_code))
      err('roster', row, 'group_code: letters, digits, - and _ only (up to 32).');
    if (r.student_code && !safeCode(r.student_code))
      err('roster', row, 'student_code: letters, digits, - and _ only (up to 32).');
    if (words(r.student_display_name) > 3)
      err('roster', row, 'student_display_name: a first name or nickname only, no family name.');
    else if (words(r.student_display_name) === 3)
      warn('roster', row, `"${r.student_display_name}": check this is not a full name.`);
    if (words(r.teacher_first_name) > 2)
      err('roster', row, 'teacher_first_name: a first name only.');
    roster.push({
      groupCode: r.group_code,
      groupName: r.group_name,
      teacher: r.teacher_first_name,
      studentCode: r.student_code,
      studentName: r.student_display_name,
      guardianLabel: r.guardian_label,
    });
  });

  // Duplicate codes; one name per student code; one name and teacher per group.
  const byStudent = new Map<string, RosterRow>();
  const byGroup = new Map<string, RosterRow>();
  const seen = new Set<string>();
  roster.forEach((r, i) => {
    const row = i + 2;
    const key = `${r.groupCode}|${r.studentCode}`;
    if (seen.has(key))
      err('roster', row, `Student ${r.studentCode} is listed twice in ${r.groupCode}.`);
    seen.add(key);
    const s = byStudent.get(r.studentCode);
    if (s && s.studentName !== r.studentName)
      err(
        'roster',
        row,
        `Duplicate code ${r.studentCode}: "${s.studentName}" and "${r.studentName}".`,
      );
    if (s && s.guardianLabel !== r.guardianLabel)
      err('roster', row, `Student ${r.studentCode} has two guardian labels.`);
    if (!s) byStudent.set(r.studentCode, r);
    const g = byGroup.get(r.groupCode);
    if (g && g.groupName !== r.groupName)
      err(
        'roster',
        row,
        `Group ${r.groupCode} has two names: "${g.groupName}" and "${r.groupName}".`,
      );
    if (g && g.teacher !== r.teacher)
      err('roster', row, `Group ${r.groupCode} has two teachers: ${g.teacher} and ${r.teacher}.`);
    if (!g) byGroup.set(r.groupCode, r);
  });
  // Same display name twice in one group: the teacher could not tell them apart (FUP-VOI-04).
  for (const code of byGroup.keys()) {
    const names = new Map<string, string[]>();
    for (const r of roster.filter((x) => x.groupCode === code))
      names.set(r.studentName, [...(names.get(r.studentName) ?? []), r.studentCode]);
    for (const [name, codes] of names)
      if (codes.length > 1)
        err(
          'roster',
          null,
          `Group ${code}: "${name}" is used by ${codes.join(', ')}. Add a disambiguator, e.g. "${name} س.".`,
        );
  }

  const schedule: ScheduleRow[] = [];
  rawS.forEach((r, i) => {
    const row = i + 2;
    const wd =
      WEEKDAYS[r.weekday.trim().toLowerCase()] ??
      (/^[1-7]$/.test(r.weekday) ? Number(r.weekday) : null);
    const st = time(r.start_time);
    const en = time(r.end_time);
    if (
      !byGroup.has(r.group_code) &&
      !existing?.groups.some((g) => g.id === groupIdOf(r.group_code))
    )
      err('schedule', row, `Unknown group ${r.group_code} (not in the roster).`);
    if (!wd)
      err('schedule', row, `Unknown weekday "${r.weekday}" (use sat, sun, … or السبت، الأحد، …).`);
    if (!st || !en) err('schedule', row, 'Times as HH:MM, 24-hour (e.g. 17:00).');
    else if (en <= st) err('schedule', row, 'end_time must be after start_time.');
    if (wd && st && en)
      schedule.push({ groupCode: r.group_code, weekday: wd, startTime: st, endTime: en });
  });
  for (const [code] of byGroup)
    if (
      !schedule.some((s) => s.groupCode === code) &&
      !existing?.groups.some((g) => g.id === groupIdOf(code))
    )
      err('schedule', null, `Group ${code} has no schedule row.`);
  for (const code of new Set(schedule.map((s) => s.groupCode))) {
    const times = new Set(
      schedule.filter((s) => s.groupCode === code).map((s) => `${s.startTime}-${s.endTime}`),
    );
    if (times.size > 1)
      err('schedule', null, `Group ${code}: one start and end time for every weekday.`);
  }

  // Against what is already imported: same codes must keep their names (no silent change).
  if (existing) {
    for (const r of byStudent.values()) {
      const s = existing.students.find((x) => x.id === studentIdOf(r.studentCode));
      if (s && s.name.ar !== r.studentName)
        err('roster', null, `Student ${r.studentCode} is already "${s.name.ar}".`);
    }
  }

  const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    issues,
    roster,
    schedule,
    groups: [...byGroup.values()].map((g) => ({
      code: g.groupCode,
      name: g.groupName,
      teacher: g.teacher,
      students: roster.filter((r) => r.groupCode === g.groupCode).length,
      slots: schedule
        .filter((s) => s.groupCode === g.groupCode)
        .map((s) => `${DAY[s.weekday]} ${s.startTime}–${s.endTime}`),
    })),
    teachers: [...new Set(roster.map((r) => r.teacher))],
  };
}

export const groupIdOf = (code: string) => `grp-p-${code}`;
export const studentIdOf = (code: string) => `stu-p-${code}`;
const guardianIdOf = (studentCode: string) => `gdn-p-${studentCode}`;

/**
 * Merge a checked plan into the world (in place). New teachers get accounts without a PIN; the owner
 * sets their PIN from Staff & access. Returns what was added.
 */
export function applyPlan(w: WorldData, plan: Plan, newUserId: () => string) {
  if (plan.issues.some((i) => i.level === 'error')) throw new Error('The import has errors.');
  const added = { groups: 0, students: 0, teachers: [] as string[], memberships: 0 };
  const teacherId = (name: string) => {
    let u = w.users.find((x) => x.role === 'teacher' && x.active && x.name.ar === name);
    if (!u) {
      u = {
        id: newUserId(),
        name: { ar: name, en: name },
        role: 'teacher',
        title: { en: 'Teacher', ar: 'معلّم' },
        active: true,
      } satisfies WorldUser;
      w.users.push(u);
      added.teachers.push(name);
    }
    return u.id;
  };
  for (const g of plan.groups) {
    const slots = plan.schedule.filter((s) => s.groupCode === g.code);
    const id = groupIdOf(g.code);
    let grp = w.groups.find((x) => x.id === id);
    if (!grp) {
      grp = {
        id,
        name: { ar: g.name, en: g.name },
        subject: null,
        teacherUserId: teacherId(g.teacher),
        weekdays: [],
        startTime: slots[0]?.startTime ?? '00:00',
        endTime: slots[0]?.endTime ?? '00:00',
      } satisfies WorldGroup;
      w.groups.push(grp);
      added.groups++;
    }
    if (slots.length) {
      grp.weekdays = [...new Set(slots.map((s) => s.weekday))].sort();
      grp.startTime = slots[0]!.startTime;
      grp.endTime = slots[0]!.endTime;
    }
  }
  for (const r of plan.roster) {
    const sid = studentIdOf(r.studentCode);
    if (!w.students.some((s) => s.id === sid)) {
      const gid = guardianIdOf(r.studentCode);
      w.guardians.push({
        id: gid,
        name: { ar: r.guardianLabel, en: r.guardianLabel },
        phone: null,
        whatsappOptIn: false,
        smsConsent: false,
        stopped: false,
      });
      w.students.push({
        id: sid,
        name: { ar: r.studentName, en: r.studentName },
        gender: null,
        guardianId: gid,
      });
      added.students++;
    }
    const gid = groupIdOf(r.groupCode);
    if (!w.members.some((m) => m.groupId === gid && m.studentId === sid)) {
      w.members.push({ groupId: gid, studentId: sid });
      added.memberships++;
    }
  }
  return added;
}
