/**
 * `scenario:demo-followup` — fictional data for the Phase 2 demo (docs/frontend/plan.md, Step 1).
 *
 * Al Nour Centre · Ms Salma · "Secondary 2 · Maths" (grp-salma-ws, Wed & Sat 5 PM) with 18 students.
 * - Mariam was absent last session; the voice note about to be confirmed marks her absent again,
 *   so confirming raises `consecutive_absences` (n = 2). Her guardian is opted in to WhatsApp.
 * - Nour has been absent twice already: an open, overdue case; her guardian replied STOP.
 * - Omar Ali has a score correction 21 → 12 ("typing error") on the unit test (max 30).
 * - "Ahmed Samir" and "Ahmed Samy" make "أحمد" in the voice note ambiguous (T07).
 * - Omar's guardian has SMS consent only; Habiba has no guardian phone on file.
 * Every name and number here is invented.
 */
import type { L } from '../data';

export const DEMO_GROUP_ID = 'grp-salma-ws';
export const DEMO_TEACHER_USER = 'usr-salma';
export const DEMO_TEACHER_ID = 'tch-salma';
export const DEMO_CENTRE_ID = 'cen-nour';

export const groupName: L = { en: 'Secondary 2 · Maths', ar: 'الثاني الثانوي · رياضيات' };

export interface GuardianFx {
  id: string;
  name: L;
  /** E.164, or null when no phone is on file. */
  phone: string | null;
  whatsappOptIn: boolean;
  smsConsent: boolean;
  /** Replied STOP / إيقاف. */
  stopped: boolean;
  userId?: string;
}

export interface StudentFx {
  id: string;
  name: L;
  guardianId: string;
  /** Only for Arabic grammar in message drafts ("غابت" / "غاب"). */
  gender: 'f' | 'm';
}

export const guardians: GuardianFx[] = [
  {
    id: 'gdn-hassan',
    name: { en: 'Hassan Mahmoud', ar: 'حسن محمود' },
    phone: '+201000000001',
    whatsappOptIn: true,
    smsConsent: true,
    stopped: false,
    userId: 'usr-parent',
  },
  {
    id: 'gdn-ali',
    name: { en: 'Ali Mansour', ar: 'علي منصور' },
    phone: '+201000000011',
    whatsappOptIn: false,
    smsConsent: true,
    stopped: false,
  },
  {
    id: 'gdn-khaled',
    name: { en: 'Khaled Ezzat', ar: 'خالد عزت' },
    phone: '+201000000012',
    whatsappOptIn: true,
    smsConsent: false,
    stopped: true,
  },
  {
    id: 'gdn-nabil',
    name: { en: 'Nabil Saeed', ar: 'نبيل سعيد' },
    phone: null,
    whatsappOptIn: false,
    smsConsent: false,
    stopped: false,
  },
];

const FEMALE = new Set([
  'chd-mariam',
  'stu-nour',
  'stu-laila',
  'stu-hana',
  'stu-malak',
  'stu-farida',
  'stu-jana',
  'stu-rana',
  'stu-habiba',
]);
const g = (id: string, en: string, ar: string, guardianId: string): StudentFx => ({
  id,
  name: { en, ar },
  guardianId,
  gender: FEMALE.has(id) ? 'f' : 'm',
});

/** Roster of the demo group: 18 students. Guardians without a fixture of their own share a generic opted-in one. */
export const roster: StudentFx[] = [
  g('chd-mariam', 'Mariam Hassan', 'مريم حسن', 'gdn-hassan'),
  g('stu-omar', 'Omar Ali', 'عمر علي', 'gdn-ali'),
  g('stu-ahmed-samir', 'Ahmed Samir', 'أحمد سمير', 'gdn-generic'),
  g('stu-ahmed-samy', 'Ahmed Samy', 'أحمد سامي', 'gdn-generic'),
  g('stu-nour', 'Nour Khaled', 'نور خالد', 'gdn-khaled'),
  g('stu-youssef', 'Youssef Adel', 'يوسف عادل', 'gdn-generic'),
  g('stu-laila', 'Laila Mostafa', 'ليلى مصطفى', 'gdn-generic'),
  g('stu-ziad', 'Ziad Tarek', 'زياد طارق', 'gdn-generic'),
  g('stu-hana', 'Hana Ibrahim', 'هنا إبراهيم', 'gdn-generic'),
  g('stu-malak', 'Malak Sherif', 'ملك شريف', 'gdn-generic'),
  g('stu-adam', 'Adam Hany', 'آدم هاني', 'gdn-generic'),
  g('stu-farida', 'Farida Wael', 'فريدة وائل', 'gdn-generic'),
  g('stu-mostafa', 'Mostafa Gamal', 'مصطفى جمال', 'gdn-generic'),
  g('stu-jana', 'Jana Ashraf', 'جنى أشرف', 'gdn-generic'),
  g('stu-seif', 'Seif Amr', 'سيف عمرو', 'gdn-generic'),
  g('stu-rana', 'Rana Magdy', 'رنا مجدي', 'gdn-generic'),
  g('stu-hamza', 'Hamza Essam', 'حمزة عصام', 'gdn-generic'),
  g('stu-habiba', 'Habiba Nabil', 'حبيبة نبيل', 'gdn-nabil'),
];

export const genericGuardian: GuardianFx = {
  id: 'gdn-generic',
  name: { en: 'Guardian on file', ar: 'وليّ الأمر المسجّل' },
  phone: '+201000000099',
  whatsappOptIn: true,
  smsConsent: true,
  stopped: false,
};

export const assessments = {
  practice: {
    title: { en: 'Sign rules • Practice quiz', ar: 'قواعد الإشارات • كويز تدريبي' },
    series: 'sign-rules-practice',
    maxScore: 20,
  },
  unitTest: {
    title: { en: 'Unit 1 test', ar: 'اختبار الوحدة الأولى' },
    series: 'unit-tests',
    maxScore: 30,
  },
} as const;

/**
 * Past records, newest first (index 0 = the session before the one being recorded now).
 * Students not listed are present. `null` attendance = not recorded.
 */
export const pastRecords: {
  absent?: string[];
  late?: Record<string, number>;
  notRecorded?: string[];
  assessment?: keyof typeof assessments;
  scores?: Record<string, number>;
  observations?: {
    studentId: string | null;
    text: L;
    tag: 'needs_revisit' | 'understanding' | 'positive';
  }[];
  /** No record at all for this session ("Not recorded" for everyone; never absence). */
  missing?: boolean;
}[] = [
  // S-1: Mariam absent (the first of two). Nour absent (second in a row → existing case).
  {
    absent: ['chd-mariam', 'stu-nour'],
    late: { 'stu-omar': 10 },
    assessment: 'practice',
    scores: {
      'stu-ahmed-samir': 11,
      'stu-ahmed-samy': 15,
      'stu-omar': 13,
      'stu-laila': 18,
      'stu-ziad': 16,
    },
    observations: [
      {
        studentId: 'stu-ahmed-samir',
        tag: 'needs_revisit',
        text: {
          en: 'Mixes up the sign rules when multiplying negatives. Revisit with two worked examples.',
          ar: 'بيلخبط في قواعد الإشارات في ضرب السالب. نراجعها بمثالين محلولين.',
        },
      },
    ],
  },
  // S-2: Nour absent (first). Mariam present.
  {
    absent: ['stu-nour'],
    assessment: 'practice',
    scores: {
      'stu-ahmed-samir': 10,
      'stu-ahmed-samy': 14,
      'stu-omar': 12,
      'stu-laila': 17,
      'stu-ziad': 15,
    },
  },
  // S-3: unit test. Omar's 21 is later corrected to 12 ("typing error").
  {
    assessment: 'unitTest',
    scores: {
      'stu-omar': 21,
      'stu-ahmed-samir': 17,
      'stu-ahmed-samy': 22,
      'chd-mariam': 24,
      'stu-laila': 27,
    },
    observations: [
      {
        studentId: null,
        tag: 'understanding',
        text: {
          en: 'Most of the group is solid on factorising.',
          ar: 'أغلب المجموعة فاهمة التحليل كويس.',
        },
      },
    ],
  },
  // S-4: Habiba not recorded (missing data, not absence).
  { notRecorded: ['stu-habiba'] },
  // S-5: no record at all.
  { missing: true },
];

/** The correction on S-3 (FUP-REC-08 AC2). */
export const omarCorrection = {
  studentId: 'stu-omar',
  recordIndex: 2,
  field: 'score' as const,
  oldValue: '21',
  newValue: '12',
  reason: { en: 'Typing error', ar: 'خطأ في الكتابة' },
};

/** Voice note fixture for the session being recorded now (FUP-VOI-03). Arabic only, as spoken. */
export const voiceTranscript =
  'مريم غابت النهارده، وأحمد جاب ١٤ من ٢٠ في الكويز، ومحتاجين نراجع قواعد الإشارات الجاية';

const spanOf = (part: string) => {
  const start = voiceTranscript.indexOf(part);
  if (start < 0) throw new Error(`span not in transcript: ${part}`);
  return { start, end: start + part.length };
};

/** One high, one medium and one low confidence item; one ambiguous name (OD-36). */
export const voiceItems = [
  {
    id: 'vi-1',
    identity: 'matched' as const,
    studentId: 'chd-mariam',
    candidates: [] as string[],
    mention: 'مريم',
    field: 'attendance' as const,
    value: 'absent',
    confidence: 0.96,
    span: spanOf('مريم غابت النهارده'),
  },
  {
    id: 'vi-2',
    identity: 'ambiguous' as const,
    studentId: null,
    candidates: ['stu-ahmed-samir', 'stu-ahmed-samy'],
    mention: 'أحمد',
    field: 'score' as const,
    value: 14,
    confidence: 0.74,
    span: spanOf('أحمد جاب ١٤ من ٢٠ في الكويز'),
  },
  {
    id: 'vi-3',
    identity: 'group' as const,
    studentId: null,
    candidates: [] as string[],
    mention: null,
    field: 'observation' as const,
    value: 'نراجع قواعد الإشارات الحصة الجاية',
    confidence: 0.52,
    span: spanOf('محتاجين نراجع قواعد الإشارات الجاية'),
  },
];

/** The parent's reply delivered by "Demo controls" (V06). */
export const demoReply = {
  body: 'عندها درس تاني الأربع',
  summary: {
    en: 'Mariam has another lesson on Wednesdays.',
    ar: 'مريم عندها درس تاني يوم الأربع.',
  },
  intent: { en: 'Timetable clash on Wednesdays', ar: 'تعارض في المواعيد يوم الأربع' },
};

/** Rules for Al Nour (03 §3, defaults). Only `consecutive_absences` is on. */
export const rules = [
  { code: 'consecutive_absences' as const, active: true, params: { n: 2 } },
  { code: 'score_decline' as const, active: false, params: { k: 2, drop: 10, minScores: 3 } },
  { code: 'low_participation' as const, active: false, params: { k: 2, m: 3 } },
  { code: 'repeated_concern' as const, active: false, params: { count: 3, windowDays: 30 } },
];
/** FUP-CAS-02 AC2: default assignee Reception, due the same day. */
export const RULE_DEFAULTS = { assigneeUserId: 'usr-reception', dueInDays: 0, version: 1 };
