/**
 * Batch 1 fixtures. FICTIONAL people and places only (Maadi, Cairo) — sample data, like the designs.
 * Text is bilingual: handlers pick the language from `Accept-Language` (mock-only convenience; the
 * real API stores one display name as entered).
 */
import type { Curriculum, PaymentPlan, ReviewTag } from '@link/api-client';

export type L = { en: string; ar: string };

export const curricula: { id: string; code: Curriculum; name: L }[] = [
  { id: 'cur-national', code: 'NATIONAL', name: { en: 'National', ar: 'الوطني' } },
  { id: 'cur-igcse', code: 'IGCSE', name: { en: 'IGCSE', ar: 'IGCSE' } },
  { id: 'cur-american', code: 'AMERICAN', name: { en: 'American', ar: 'الأمريكي' } },
  { id: 'cur-nile', code: 'NILE', name: { en: 'Nile', ar: 'النيل' } },
];

export const schoolYears: { id: string; curriculumId: string; code: string; name: L; short: L }[] =
  [
    {
      id: 'sy-prep3',
      curriculumId: 'cur-national',
      code: 'PREP3',
      name: { en: 'Preparatory 3', ar: 'الثالث الإعدادي' },
      short: { en: 'Prep 3', ar: '٣ إعدادي' },
    },
    {
      id: 'sy-sec1',
      curriculumId: 'cur-national',
      code: 'SEC1',
      name: { en: 'Secondary 1', ar: 'الأول الثانوي' },
      short: { en: 'Sec 1', ar: '١ ثانوي' },
    },
    {
      id: 'sy-sec2',
      curriculumId: 'cur-national',
      code: 'SEC2',
      name: { en: 'Secondary 2', ar: 'الثاني الثانوي' },
      short: { en: 'Sec 2', ar: '٢ ثانوي' },
    },
    {
      id: 'sy-sec3',
      curriculumId: 'cur-national',
      code: 'SEC3',
      name: { en: 'Secondary 3', ar: 'الثالث الثانوي' },
      short: { en: 'Sec 3', ar: '٣ ثانوي' },
    },
    {
      id: 'sy-y10',
      curriculumId: 'cur-igcse',
      code: 'Y10',
      name: { en: 'Year 10', ar: 'السنة العاشرة' },
      short: { en: 'Y10', ar: 'Y10' },
    },
    {
      id: 'sy-y11',
      curriculumId: 'cur-igcse',
      code: 'Y11',
      name: { en: 'Year 11', ar: 'السنة الحادية عشرة' },
      short: { en: 'Y11', ar: 'Y11' },
    },
    {
      id: 'sy-g10',
      curriculumId: 'cur-american',
      code: 'G10',
      name: { en: 'Grade 10', ar: 'الصف العاشر' },
      short: { en: 'G10', ar: 'G10' },
    },
    {
      id: 'sy-g11',
      curriculumId: 'cur-american',
      code: 'G11',
      name: { en: 'Grade 11', ar: 'الصف الحادي عشر' },
      short: { en: 'G11', ar: 'G11' },
    },
  ];

/** Subjects by code (mock simplification: one row per subject, any year). */
export const subjects: { id: string; code: string; name: L }[] = [
  { id: 'sub-math', code: 'MATH', name: { en: 'Maths', ar: 'الرياضيات' } },
  { id: 'sub-phys', code: 'PHYS', name: { en: 'Physics', ar: 'الفيزياء' } },
  { id: 'sub-chem', code: 'CHEM', name: { en: 'Chemistry', ar: 'الكيمياء' } },
  { id: 'sub-eng', code: 'ENG', name: { en: 'English', ar: 'اللغة الإنجليزية' } },
  { id: 'sub-arab', code: 'ARAB', name: { en: 'Arabic', ar: 'اللغة العربية' } },
  { id: 'sub-bio', code: 'BIO', name: { en: 'Biology', ar: 'الأحياء' } },
];

export interface CentreFx {
  id: string;
  slug: string;
  name: L;
  area: L;
  governorate: L;
  address: L;
  lat: number;
  lng: number;
  distanceKm: number;
  verified: boolean;
  /** ISO weekdays open, with Cairo times. */
  hours: { weekday: number; opens: string; closes: string }[];
  ratingDist: [number, number, number, number, number]; // counts for 5,4,3,2,1 stars
}

const satToThu = [6, 7, 1, 2, 3, 4].map((weekday) => ({
  weekday,
  opens: '14:00',
  closes: '21:00',
}));

export const centres: CentreFx[] = [
  {
    id: 'cen-nour',
    slug: 'al-nour-maadi',
    name: { en: 'Al Nour Centre', ar: 'مركز النور' },
    area: { en: 'Maadi', ar: 'المعادي' },
    governorate: { en: 'Cairo', ar: 'القاهرة' },
    address: { en: '12 Road 9, Maadi', ar: '١٢ شارع ٩، المعادي' },
    lat: 29.9602,
    lng: 31.2569,
    distanceKm: 1.2,
    verified: true,
    hours: satToThu,
    ratingDist: [96, 19, 6, 3, 2],
  },
  {
    id: 'cen-nile',
    slug: 'nile-academy-degla',
    name: { en: 'Nile Academy', ar: 'أكاديمية النيل' },
    area: { en: 'Degla', ar: 'دجلة' },
    governorate: { en: 'Cairo', ar: 'القاهرة' },
    address: { en: '40 Road 233, Degla', ar: '٤٠ شارع ٢٣٣، دجلة' },
    lat: 29.9665,
    lng: 31.2761,
    distanceKm: 2.4,
    verified: true,
    hours: satToThu,
    ratingDist: [58, 20, 6, 2, 2],
  },
  {
    id: 'cen-future',
    slug: 'future-minds-maadi',
    name: { en: 'Future Minds', ar: 'عقول المستقبل' },
    area: { en: 'Sarayat El Maadi', ar: 'سرايات المعادي' },
    governorate: { en: 'Cairo', ar: 'القاهرة' },
    address: { en: '7 Road 79, Maadi', ar: '٧ شارع ٧٩، المعادي' },
    lat: 29.9531,
    lng: 31.2498,
    distanceKm: 3.1,
    verified: true,
    hours: satToThu,
    ratingDist: [30, 12, 6, 2, 2],
  },
  {
    id: 'cen-elm',
    slug: 'dar-el-elm-zahraa',
    name: { en: 'Dar El Elm', ar: 'دار العلم' },
    area: { en: 'Zahraa El Maadi', ar: 'زهراء المعادي' },
    governorate: { en: 'Cairo', ar: 'القاهرة' },
    address: { en: '3 Street 18, Zahraa El Maadi', ar: '٣ شارع ١٨، زهراء المعادي' },
    lat: 29.9719,
    lng: 31.2934,
    distanceKm: 4.6,
    verified: true,
    hours: satToThu,
    ratingDist: [10, 6, 2, 1, 1],
  },
  {
    id: 'cen-horizon',
    slug: 'horizon-new-cairo',
    name: { en: 'Horizon Centre', ar: 'مركز الأفق' },
    area: { en: 'New Cairo', ar: 'القاهرة الجديدة' },
    governorate: { en: 'Cairo', ar: 'القاهرة' },
    address: { en: '90th Street, New Cairo', ar: 'شارع التسعين، القاهرة الجديدة' },
    lat: 30.0074,
    lng: 31.4913,
    distanceKm: 17.8,
    verified: true,
    hours: satToThu,
    ratingDist: [12, 4, 1, 0, 0],
  },
];

export interface TeacherFx {
  id: string;
  slug: string;
  name: L;
  bio: L;
  yearsExperience: number;
  verified: boolean;
  tagCounts: { tag: ReviewTag; count: number }[];
  ratingDist: [number, number, number, number, number];
  /** Teacher setting `reviewEachEnrolment` (OD-08, default off). Dev panel can flip it. */
  reviewEachEnrolment: boolean;
}

export const teachers: TeacherFx[] = [
  {
    id: 'tch-salma',
    slug: 'salma-fathy-maths',
    name: { en: 'Ms Salma Fathy', ar: 'أ. سلمى فتحي' },
    yearsExperience: 9,
    verified: true,
    bio: {
      en: 'Maths teacher focused on algebra and exam technique for Secondary 2–3. Small groups.',
      ar: 'معلّمة رياضيات تركّز على الجبر ومهارات الامتحان للصفين الثاني والثالث الثانوي. مجموعات صغيرة.',
    },
    tagCounts: [
      { tag: 'explains_clearly', count: 41 },
      { tag: 'patient', count: 28 },
      { tag: 'exam_prep', count: 22 },
      { tag: 'homework_feedback', count: 17 },
    ],
    ratingDist: [52, 9, 2, 1, 0],
    reviewEachEnrolment: false,
  },
  {
    id: 'tch-karim',
    slug: 'karim-adel-maths',
    name: { en: 'Mr Karim Adel', ar: 'أ. كريم عادل' },
    yearsExperience: 12,
    verified: true,
    bio: {
      en: 'Maths for Secondary 1–3 with weekly practice sheets.',
      ar: 'رياضيات للمرحلة الثانوية مع أوراق تدريب أسبوعية.',
    },
    tagCounts: [
      { tag: 'exam_prep', count: 19 },
      { tag: 'explains_clearly', count: 15 },
    ],
    ratingDist: [30, 8, 2, 1, 0],
    reviewEachEnrolment: false,
  },
  {
    id: 'tch-ahmed',
    slug: 'ahmed-samy-physics',
    name: { en: 'Mr Ahmed Samy', ar: 'أ. أحمد سامي' },
    yearsExperience: 7,
    verified: true,
    bio: {
      en: 'Physics with experiments you can try at home.',
      ar: 'فيزياء بتجارب يمكن تجربتها في البيت.',
    },
    tagCounts: [
      { tag: 'explains_clearly', count: 18 },
      { tag: 'patient', count: 11 },
    ],
    ratingDist: [24, 9, 3, 1, 0],
    reviewEachEnrolment: false,
  },
  {
    id: 'tch-nada',
    slug: 'nada-kamal-chemistry',
    name: { en: 'Ms Nada Kamal', ar: 'أ. ندى كمال' },
    yearsExperience: 5,
    verified: true,
    bio: { en: 'Chemistry for Secondary 3.', ar: 'كيمياء للصف الثالث الثانوي.' },
    tagCounts: [{ tag: 'organised', count: 9 }],
    ratingDist: [20, 6, 2, 1, 0],
    reviewEachEnrolment: false,
  },
];

export interface GroupFx {
  id: string;
  teacherId: string;
  centreId: string;
  room: L;
  subjectId: string;
  curriculumId: string;
  schoolYearId: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  sessionFeePt: number;
  monthlyFeePt: number;
  sessionsPerMonth: number;
  offersMonthlyRecurring: boolean;
  seatCap: number;
  /** Seats already taken by other (fixture) students in upcoming sessions, by index; the last value repeats. */
  takenUpcoming: number[];
}

export const groups: GroupFx[] = [
  // Figma P06: Wed & Sat 5:00–6:30 PM, Room 2 — 2 seats left on the next session.
  {
    id: 'grp-salma-ws',
    teacherId: 'tch-salma',
    centreId: 'cen-nour',
    room: { en: 'Room 2', ar: 'قاعة ٢' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [3, 6],
    startTime: '17:00',
    endTime: '18:30',
    sessionFeePt: 15000,
    monthlyFeePt: 55000,
    sessionsPerMonth: 8,
    offersMonthlyRecurring: true,
    seatCap: 20,
    takenUpcoming: [18, 17, 19, 16, 16],
  },
  // One covered session is full (Tue, 6th upcoming) → monthly plans hit 409 naming it (MKT-ENR-02 AC7).
  {
    id: 'grp-salma-st',
    teacherId: 'tch-salma',
    centreId: 'cen-nour',
    room: { en: 'Hall A', ar: 'قاعة أ' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [7, 2],
    startTime: '15:00',
    endTime: '16:30',
    sessionFeePt: 15000,
    monthlyFeePt: 55000,
    sessionsPerMonth: 8,
    offersMonthlyRecurring: true,
    seatCap: 30,
    takenUpcoming: [24, 24, 25, 26, 27, 30, 24],
  },
  // Full in every session → "Full — join waitlist".
  {
    id: 'grp-salma-fri',
    teacherId: 'tch-salma',
    centreId: 'cen-nour',
    room: { en: 'Room 2', ar: 'قاعة ٢' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [5],
    startTime: '11:00',
    endTime: '12:30',
    sessionFeePt: 15000,
    monthlyFeePt: 55000,
    sessionsPerMonth: 4,
    offersMonthlyRecurring: true,
    seatCap: 16,
    takenUpcoming: [16],
  },
  {
    id: 'grp-salma-nile',
    teacherId: 'tch-salma',
    centreId: 'cen-nile',
    room: { en: 'Hall B', ar: 'قاعة ب' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec3',
    weekdays: [7],
    startTime: '19:00',
    endTime: '20:30',
    sessionFeePt: 16000,
    monthlyFeePt: 58000,
    sessionsPerMonth: 4,
    offersMonthlyRecurring: true,
    seatCap: 24,
    takenUpcoming: [12],
  },
  {
    id: 'grp-karim-nour',
    teacherId: 'tch-karim',
    centreId: 'cen-nour',
    room: { en: 'Hall A', ar: 'قاعة أ' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [7, 2],
    startTime: '18:30',
    endTime: '20:00',
    sessionFeePt: 17000,
    monthlyFeePt: 62000,
    sessionsPerMonth: 8,
    offersMonthlyRecurring: true,
    seatCap: 40,
    takenUpcoming: [38, 36, 35],
  },
  {
    id: 'grp-karim-nile',
    teacherId: 'tch-karim',
    centreId: 'cen-nile',
    room: { en: 'Hall C', ar: 'قاعة ج' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [1, 4],
    startTime: '17:00',
    endTime: '18:30',
    sessionFeePt: 17000,
    monthlyFeePt: 62000,
    sessionsPerMonth: 8,
    offersMonthlyRecurring: false,
    seatCap: 30,
    takenUpcoming: [20],
  },
  // Future Minds: every Maths group full → "Waitlist only".
  {
    id: 'grp-karim-future',
    teacherId: 'tch-karim',
    centreId: 'cen-future',
    room: { en: 'Room 1', ar: 'قاعة ١' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [1, 4],
    startTime: '16:00',
    endTime: '17:30',
    sessionFeePt: 14000,
    monthlyFeePt: 50000,
    sessionsPerMonth: 8,
    offersMonthlyRecurring: true,
    seatCap: 18,
    takenUpcoming: [18],
  },
  // Mariam's existing Physics enrolment (P09, P10).
  {
    id: 'grp-ahmed-phys',
    teacherId: 'tch-ahmed',
    centreId: 'cen-nour',
    room: { en: 'Room 3', ar: 'قاعة ٣' },
    subjectId: 'sub-phys',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [1, 4],
    startTime: '17:00',
    endTime: '18:30',
    sessionFeePt: 14000,
    monthlyFeePt: 50000,
    sessionsPerMonth: 8,
    offersMonthlyRecurring: true,
    seatCap: 20,
    takenUpcoming: [15],
  },
  {
    id: 'grp-nada-chem',
    teacherId: 'tch-nada',
    centreId: 'cen-nour',
    room: { en: 'Room 1', ar: 'قاعة ١' },
    subjectId: 'sub-chem',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec3',
    weekdays: [6],
    startTime: '19:00',
    endTime: '20:30',
    sessionFeePt: 16000,
    monthlyFeePt: 60000,
    sessionsPerMonth: 4,
    offersMonthlyRecurring: true,
    seatCap: 24,
    takenUpcoming: [10],
  },
  {
    id: 'grp-elm-math',
    teacherId: 'tch-karim',
    centreId: 'cen-elm',
    room: { en: 'Hall 1', ar: 'قاعة ١' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [3],
    startTime: '18:00',
    endTime: '19:30',
    sessionFeePt: 13000,
    monthlyFeePt: 48000,
    sessionsPerMonth: 4,
    offersMonthlyRecurring: true,
    seatCap: 15,
    takenUpcoming: [15],
  },
  {
    id: 'grp-horizon-math',
    teacherId: 'tch-salma',
    centreId: 'cen-horizon',
    room: { en: 'Hall 1', ar: 'قاعة ١' },
    subjectId: 'sub-math',
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
    weekdays: [5],
    startTime: '13:00',
    endTime: '14:30',
    sessionFeePt: 18000,
    monthlyFeePt: 65000,
    sessionsPerMonth: 4,
    offersMonthlyRecurring: true,
    seatCap: 25,
    takenUpcoming: [5],
  },
];

export interface ReviewFx {
  id: string;
  targetType: 'centre' | 'teacher';
  targetId: string;
  stars: number;
  tags: ReviewTag[];
  body: L;
  schoolYearId: string;
  publishedOn: string; // YYYY-MM-DD
  reply?: { body: L; author: L };
}

export const reviews: ReviewFx[] = [
  {
    id: 'rev-1',
    targetType: 'centre',
    targetId: 'cen-nour',
    stars: 5,
    tags: ['communication', 'organised'],
    schoolYearId: 'sy-sec2',
    publishedOn: '2026-09-21',
    body: {
      en: 'Well organised and they called us the same day a session was moved.',
      ar: 'منظّمين جدًا واتصلوا بينا في نفس اليوم لما الحصة اتنقلت.',
    },
  },
  {
    id: 'rev-2',
    targetType: 'teacher',
    targetId: 'tch-salma',
    stars: 5,
    tags: ['explains_clearly', 'homework_feedback'],
    schoolYearId: 'sy-sec2',
    publishedOn: '2026-09-18',
    body: {
      en: 'Mariam finally understands equations. Clear notes on what to practise.',
      ar: 'مريم أخيرًا فهمت المعادلات. ملاحظات واضحة عن اللي تذاكره.',
    },
  },
  {
    id: 'rev-3',
    targetType: 'teacher',
    targetId: 'tch-salma',
    stars: 4,
    tags: ['exam_prep'],
    schoolYearId: 'sy-sec3',
    publishedOn: '2026-08-30',
    body: {
      en: 'Very good teacher. Groups can feel a bit big before exams.',
      ar: 'مدرّسة ممتازة. المجموعات بتبقى كبيرة شوية قبل الامتحانات.',
    },
    reply: {
      body: {
        en: 'Thank you — I now split exam-week revision into two smaller groups.',
        ar: 'شكرًا — قسّمت مراجعة أسبوع الامتحان لمجموعتين أصغر.',
      },
      author: { en: 'Ms Salma Fathy', ar: 'أ. سلمى فتحي' },
    },
  },
  {
    id: 'rev-4',
    targetType: 'teacher',
    targetId: 'tch-ahmed',
    stars: 5,
    tags: ['patient'],
    schoolYearId: 'sy-sec1',
    publishedOn: '2026-09-10',
    body: { en: 'Patient with every question.', ar: 'صبور جدًا مع كل سؤال.' },
  },
  {
    id: 'rev-5',
    targetType: 'centre',
    targetId: 'cen-nile',
    stars: 4,
    tags: ['location'],
    schoolYearId: 'sy-sec2',
    publishedOn: '2026-09-02',
    body: { en: 'Easy to reach and quiet halls.', ar: 'سهل الوصول والقاعات هادية.' },
  },
];

/** The sample parent (mock sign-in with any code 123456 on this number). */
export const PARENT_PHONE = '+201000000001';
export const parent = { id: 'usr-parent', name: { en: 'Hassan Mahmoud', ar: 'حسن محمود' } };

export const children: { id: string; name: L; curriculumId: string; schoolYearId: string }[] = [
  {
    id: 'chd-mariam',
    name: { en: 'Mariam Hassan', ar: 'مريم حسن' },
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec2',
  },
  {
    id: 'chd-youssef',
    name: { en: 'Youssef Hassan', ar: 'يوسف حسن' },
    curriculumId: 'cur-national',
    schoolYearId: 'sy-sec1',
  },
];

/** Existing enrolments at mock start. Mariam has studied Physics with Mr Ahmed for 4 weeks. */
export const seedEnrolments: {
  id: string;
  reference: string;
  groupId: string;
  studentId: string;
  plan: PaymentPlan;
  /** Days before today the period started. */
  startedDaysAgo: number;
}[] = [
  {
    id: 'enr-mariam-phys',
    reference: 'LNK-20877',
    groupId: 'grp-ahmed-phys',
    studentId: 'chd-mariam',
    plan: 'monthly_recurring',
    startedDaysAgo: 28,
  },
];

/** Sample staff accounts for the Phase 2 demo (sign in with code 123456). Fictional. */
export const staff: {
  id: string;
  phone: string;
  role: 'teacher' | 'centre_owner' | 'centre_staff';
  name: L;
  /** Centre role label for staff (A16). */
  title: L;
  teacherId?: string;
}[] = [
  {
    id: 'usr-salma',
    phone: '+201000000002',
    role: 'teacher',
    name: { en: 'Ms Salma Fathy', ar: 'أ. سلمى فتحي' },
    title: { en: 'Teacher', ar: 'معلّمة' },
    teacherId: 'tch-salma',
  },
  {
    id: 'usr-owner',
    phone: '+201000000003',
    role: 'centre_owner',
    name: { en: 'Tamer Fouad', ar: 'تامر فؤاد' },
    title: { en: 'Owner', ar: 'المالك' },
  },
  {
    id: 'usr-reception',
    phone: '+201000000004',
    role: 'centre_staff',
    name: { en: 'Dina Adel', ar: 'دينا عادل' },
    title: { en: 'Reception', ar: 'الاستقبال' },
  },
  {
    id: 'usr-ahmed',
    phone: '+201000000005',
    role: 'teacher',
    name: { en: 'Mr Ahmed Samy', ar: 'أ. أحمد سامي' },
    title: { en: 'Teacher', ar: 'معلّم' },
    teacherId: 'tch-ahmed',
  },
  {
    id: 'usr-nada',
    phone: '+201000000006',
    role: 'teacher',
    name: { en: 'Ms Nada Kamal', ar: 'أ. ندى كمال' },
    title: { en: 'Teacher', ar: 'معلّمة' },
    teacherId: 'tch-nada',
  },
];
