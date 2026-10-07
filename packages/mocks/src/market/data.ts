/**
 * Marketplace operations fixtures (Batches 2–3). FICTIONAL people and places (sample data, like
 * the designs). Halls fit the groups already in `../data.ts`: a group's seat cap is never above its
 * hall's capacity. Names from Figma C06 are kept as sample applicants.
 */
import type { Facility, RentBasis } from '@link/api-client';
import type { L } from '../data';

export interface HallFx {
  id: string;
  centreId: string;
  name: L;
  /** The `room` label the fixture groups use, so a group finds its hall. */
  roomLabel: string;
  capacity: number;
  facilities: Facility[];
  rule: { basis: RentBasis; amountPt: number | null; percent: number | null };
  listed: boolean;
  /** Weekly slots the owner keeps closed, as `weekday|HH:MM`. */
  closed: string[];
  photo: number;
}

export const halls: HallFx[] = [
  // Al Nour (Maadi): the four halls of C02/C05.
  {
    id: 'hall-nour-a',
    centreId: 'cen-nour',
    name: { en: 'Hall A', ar: 'قاعة أ' },
    roomLabel: 'Hall A',
    capacity: 40,
    facilities: ['ac', 'projector', 'sound'],
    rule: { basis: 'per_student_per_session', amountPt: 1500, percent: null },
    listed: true,
    closed: [],
    photo: 0,
  },
  {
    id: 'hall-nour-1',
    centreId: 'cen-nour',
    name: { en: 'Room 1', ar: 'قاعة ١' },
    roomLabel: 'Room 1',
    capacity: 24,
    facilities: ['ac', 'whiteboard'],
    rule: { basis: 'fixed_per_session', amountPt: 25000, percent: null },
    listed: true,
    closed: [],
    photo: 1,
  },
  {
    id: 'hall-nour-2',
    centreId: 'cen-nour',
    name: { en: 'Room 2', ar: 'قاعة ٢' },
    roomLabel: 'Room 2',
    capacity: 30,
    facilities: ['ac', 'smart_board'],
    rule: { basis: 'percent_of_fees', amountPt: null, percent: 20 },
    listed: true,
    closed: ['5|20:00'],
    photo: 2,
  },
  {
    id: 'hall-nour-3',
    centreId: 'cen-nour',
    name: { en: 'Room 3', ar: 'قاعة ٣' },
    roomLabel: 'Room 3',
    capacity: 20,
    facilities: ['fan', 'whiteboard'],
    rule: { basis: 'per_student_per_session', amountPt: 1000, percent: null },
    listed: false,
    closed: [],
    photo: 3,
  },
  // Other centres (J01 "Rooms near you").
  {
    id: 'hall-nile-b',
    centreId: 'cen-nile',
    name: { en: 'Hall B', ar: 'قاعة ب' },
    roomLabel: 'Hall B',
    capacity: 35,
    facilities: ['ac', 'whiteboard'],
    rule: { basis: 'fixed_per_session', amountPt: 30000, percent: null },
    listed: true,
    closed: [],
    photo: 1,
  },
  {
    id: 'hall-nile-c',
    centreId: 'cen-nile',
    name: { en: 'Hall C', ar: 'قاعة ج' },
    roomLabel: 'Hall C',
    capacity: 30,
    facilities: ['ac', 'projector'],
    rule: { basis: 'percent_of_fees', amountPt: null, percent: 18 },
    listed: true,
    closed: [],
    photo: 2,
  },
  {
    id: 'hall-future-1',
    centreId: 'cen-future',
    name: { en: 'Room 1', ar: 'قاعة ١' },
    roomLabel: 'Room 1',
    capacity: 20,
    facilities: ['ac', 'whiteboard'],
    rule: { basis: 'fixed_per_session', amountPt: 25000, percent: null },
    listed: true,
    closed: [],
    photo: 3,
  },
  {
    id: 'hall-elm-1',
    centreId: 'cen-elm',
    name: { en: 'Hall 1', ar: 'قاعة ١' },
    roomLabel: 'Hall 1',
    capacity: 20,
    facilities: ['fan', 'whiteboard'],
    rule: { basis: 'fixed_per_session', amountPt: 20000, percent: null },
    listed: true,
    closed: [],
    photo: 0,
  },
  {
    id: 'hall-horizon-1',
    centreId: 'cen-horizon',
    name: { en: 'Hall 1', ar: 'قاعة ١' },
    roomLabel: 'Hall 1',
    capacity: 30,
    facilities: ['ac', 'projector', 'wheelchair'],
    rule: { basis: 'per_student_per_session', amountPt: 1200, percent: null },
    listed: true,
    closed: [],
    photo: 2,
  },
];

/** Sample teachers who are not (yet) on the parent-facing directory: room applicants (C06). */
export interface ApplicantFx {
  id: string;
  name: L;
  subjectId: string;
  rating: number | null;
  reviewCount: number;
  verifiedId: boolean;
  isNew: boolean;
}
export const applicants: ApplicantFx[] = [
  {
    id: 'apl-omar',
    name: { en: 'Mr Omar Fathi', ar: 'أ. عمر فتحي' },
    subjectId: 'sub-phys',
    rating: 4.6,
    reviewCount: 22,
    verifiedId: true,
    isNew: false,
  },
  {
    id: 'apl-dina',
    name: { en: 'Ms Dina Samy', ar: 'أ. دينا سامي' },
    subjectId: 'sub-bio',
    rating: null,
    reviewCount: 0,
    verifiedId: false,
    isNew: true,
  },
  {
    id: 'apl-tamer',
    name: { en: 'Mr Tamer Aly', ar: 'أ. تامر علي' },
    subjectId: 'sub-phys',
    rating: 4.2,
    reviewCount: 9,
    verifiedId: true,
    isNew: false,
  },
  {
    id: 'apl-heba',
    name: { en: 'Ms Heba Nour', ar: 'أ. هبة نور' },
    subjectId: 'sub-chem',
    rating: 4.7,
    reviewCount: 31,
    verifiedId: true,
    isNew: false,
  },
  {
    id: 'apl-youssef',
    name: { en: 'Mr Youssef Magdy', ar: 'أ. يوسف مجدي' },
    subjectId: 'sub-math',
    rating: 4.5,
    reviewCount: 15,
    verifiedId: true,
    isNew: false,
  },
  {
    id: 'apl-tarek',
    name: { en: 'Mr Tarek Aziz', ar: 'أ. طارق عزيز' },
    subjectId: 'sub-phys',
    rating: 4.8,
    reviewCount: 40,
    verifiedId: true,
    isNew: false,
  },
];

/** Room requests at the start of the demo: Al Nour's pipeline (C06) and Ms Salma's own (J03). */
export interface RequestFx {
  id: string;
  hallId: string;
  teacherKey: string;
  subjectId: string;
  schoolYearId: string;
  weekdays: number[];
  start: string;
  end: string;
  expectedStudents: number;
  /** Days from today. */
  startsInDays: number;
  stage: 'requested' | 'phone_call' | 'meeting' | 'approved';
  /** The booked call or meeting: days from today and the time. */
  stageAt?: { inDays: number; time: string };
  createdDaysAgo: number;
}
export const requests: RequestFx[] = [
  {
    id: 'req-omar',
    hallId: 'hall-nour-2',
    teacherKey: 'apl-omar',
    subjectId: 'sub-phys',
    schoolYearId: 'sy-sec2',
    weekdays: [7, 2],
    start: '18:00',
    end: '20:00',
    expectedStudents: 25,
    startsInDays: 10,
    stage: 'requested',
    createdDaysAgo: 1,
  },
  {
    id: 'req-dina',
    hallId: 'hall-nour-a',
    teacherKey: 'apl-dina',
    subjectId: 'sub-bio',
    schoolYearId: 'sy-sec3',
    weekdays: [1],
    start: '18:00',
    end: '20:00',
    expectedStudents: 40,
    startsInDays: 14,
    stage: 'requested',
    createdDaysAgo: 2,
  },
  {
    id: 'req-tamer',
    hallId: 'hall-nour-1',
    teacherKey: 'apl-tamer',
    subjectId: 'sub-phys',
    schoolYearId: 'sy-sec1',
    weekdays: [3],
    start: '16:00',
    end: '18:00',
    expectedStudents: 10,
    startsInDays: 12,
    stage: 'requested',
    createdDaysAgo: 3,
  },
  {
    id: 'req-heba',
    hallId: 'hall-nour-1',
    teacherKey: 'apl-heba',
    subjectId: 'sub-chem',
    schoolYearId: 'sy-sec2',
    weekdays: [6, 2],
    start: '14:00',
    end: '16:00',
    expectedStudents: 18,
    startsInDays: 9,
    stage: 'phone_call',
    stageAt: { inDays: 2, time: '14:00' },
    createdDaysAgo: 4,
  },
  {
    id: 'req-youssef',
    hallId: 'hall-nour-2',
    teacherKey: 'apl-youssef',
    subjectId: 'sub-math',
    schoolYearId: 'sy-sec1',
    weekdays: [4],
    start: '16:00',
    end: '18:00',
    expectedStudents: 28,
    startsInDays: 11,
    stage: 'meeting',
    stageAt: { inDays: 3, time: '11:00' },
    createdDaysAgo: 5,
  },
  {
    id: 'req-tarek',
    hallId: 'hall-nour-1',
    teacherKey: 'apl-tarek',
    subjectId: 'sub-phys',
    schoolYearId: 'sy-sec2',
    weekdays: [7, 2],
    start: '16:00',
    end: '18:00',
    expectedStudents: 20,
    startsInDays: 6,
    stage: 'approved',
    createdDaysAgo: 8,
  },
  // Ms Salma's requests (J03): one open, one at the call stage.
  {
    id: 'req-salma-future',
    hallId: 'hall-future-1',
    teacherKey: 'tch-salma',
    subjectId: 'sub-math',
    schoolYearId: 'sy-sec3',
    weekdays: [1],
    start: '18:00',
    end: '20:00',
    expectedStudents: 18,
    startsInDays: 12,
    stage: 'requested',
    createdDaysAgo: 2,
  },
  {
    id: 'req-salma-elm',
    hallId: 'hall-elm-1',
    teacherKey: 'tch-salma',
    subjectId: 'sub-math',
    schoolYearId: 'sy-sec2',
    weekdays: [6],
    start: '14:00',
    end: '16:00',
    expectedStudents: 15,
    startsInDays: 9,
    stage: 'phone_call',
    stageAt: { inDays: 1, time: '14:00' },
    createdDaysAgo: 3,
  },
];

/** Bookings whose rent was not covered by the teacher's balance this month (C07 "Due"). */
export const rentDue: Record<string, number> = {
  'tch-nada': 5,
  'tch-ahmed': 5,
};

/** Private feedback (C04): seen only by the centre's staff (BR-REV-02). */
export const privateFeedback: {
  id: string;
  target: 'centre' | 'teacher';
  targetId: string;
  stars: number;
  body: L;
  schoolYearId: string;
  daysAgo: number;
}[] = [
  {
    id: 'pf-1',
    target: 'centre',
    targetId: 'cen-nour',
    stars: 3,
    body: {
      en: 'The waiting area is crowded at 5 PM. Could the next group wait upstairs?',
      ar: 'منطقة الانتظار زحمة الساعة ٥. ممكن المجموعة اللي بعدها تستنى فوق؟',
    },
    schoolYearId: 'sy-sec2',
    daysAgo: 3,
  },
  {
    id: 'pf-2',
    target: 'teacher',
    targetId: 'tch-salma',
    stars: 4,
    body: {
      en: 'Please send the homework a day earlier when there is a quiz.',
      ar: 'ياريت الواجب يتبعت قبلها بيوم لما يكون فيه كويز.',
    },
    schoolYearId: 'sy-sec2',
    daysAgo: 6,
  },
];

/** Ms Salma's profile (J04): verification and availability. */
export const teacherSelf: Record<
  string,
  {
    about: L;
    subjects: L;
    nationalId: 'verified' | 'pending' | 'missing';
    degree: 'verified' | 'pending' | 'missing';
    referencesAdded: number;
    openToSlots: boolean;
    payoutAccount: string;
    availability: { weekday: number; am: boolean; pm: boolean }[];
  }
> = {
  'tch-salma': {
    about: {
      en: 'Maths for Secondary 2–3: short quizzes every session and exam technique.',
      ar: 'رياضيات للصفين الثاني والثالث الثانوي: كويز قصير كل حصة ومهارات الامتحان.',
    },
    subjects: { en: 'Maths • Secondary 2–3', ar: 'رياضيات • ٢–٣ ثانوي' },
    nationalId: 'verified',
    degree: 'verified',
    referencesAdded: 1,
    openToSlots: true,
    payoutAccount: 'Vodafone Cash •••• 7781',
    availability: [6, 7, 1, 2, 3, 4].map((weekday) => ({
      weekday,
      am: weekday === 6,
      pm: weekday !== 6,
    })),
  },
};

/** Centre payout accounts (masked) and the C02 "About" text. */
export const centreExtra: Record<string, { about: L; payoutAccount: string; photos: number }> = {
  'cen-nour': {
    about: {
      en: '4 air-conditioned halls in Maadi for Secondary 1–3. Front desk open Sat–Thu, 2–9 PM.',
      ar: '٤ قاعات مكيّفة في المعادي للمرحلة الثانوية. الاستقبال مفتوح من السبت للخميس، ٢–٩ مساءً.',
    },
    payoutAccount: 'CIB •••• 1188',
    photos: 3,
  },
};
