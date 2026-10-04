import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureFollowupStore, freshPilotState } from '@link/mocks/followup';
import { addDays, cairoToday } from '@link/mocks/time';
import type { WorldData } from '@link/mocks/world';
import { createPilotApp, PILOT_CENTRE_ID } from '../src/app';
import { PilotAuth } from '../src/auth';
import { pilotConfig } from '../src/config';
import { PilotStore, type Snapshot } from '../src/store';

/** A small pseudonymised pilot world: one group meeting every day since a week ago. */
export function testWorld(): WorldData {
  const start = addDays(cairoToday(), -7);
  return {
    kind: 'pilot',
    centre: { id: PILOT_CENTRE_ID, name: { ar: 'مركز تجريبي', en: 'مركز تجريبي' } },
    groups: [
      {
        id: 'grp-p-G1',
        name: { ar: 'رياضيات ٣ث', en: 'رياضيات ٣ث' },
        subject: null,
        teacherUserId: 'usr-p002',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startTime: '00:00',
        endTime: '00:30',
      },
    ],
    members: ['S1', 'S2', 'S3'].map((c) => ({ groupId: 'grp-p-G1', studentId: `stu-p-${c}` })),
    students: [
      { id: 'stu-p-S1', name: { ar: 'مريم', en: 'مريم' }, gender: null, guardianId: 'gdn-p-S1' },
      { id: 'stu-p-S2', name: { ar: 'يوسف', en: 'يوسف' }, gender: null, guardianId: 'gdn-p-S2' },
      {
        id: 'stu-p-S3',
        name: { ar: 'أحمد س.', en: 'أحمد س.' },
        gender: null,
        guardianId: 'gdn-p-S3',
      },
    ],
    guardians: ['S1', 'S2', 'S3'].map((c, i) => ({
      id: `gdn-p-${c}`,
      name: { ar: `ولي أمر ${i + 1}`, en: `ولي أمر ${i + 1}` },
      phone: null,
      whatsappOptIn: false,
      smsConsent: false,
      stopped: false,
    })),
    users: [
      {
        id: 'usr-p001',
        name: { ar: 'هالة', en: 'هالة' },
        role: 'owner',
        title: { en: 'Owner', ar: 'المالك' },
        active: true,
      },
      {
        id: 'usr-p002',
        name: { ar: 'سلوى', en: 'سلوى' },
        role: 'teacher',
        title: { en: 'Teacher', ar: 'معلّم' },
        active: true,
      },
      {
        id: 'usr-p003',
        name: { ar: 'منى', en: 'منى' },
        role: 'reception',
        title: { en: 'Reception', ar: 'الاستقبال' },
        active: true,
      },
    ],
    startDate: start,
  };
}

export function tempDir(prefix = 'link-pilot-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Create pilot data in `dir` (like `pilot:init` + import) and return the PIN of every person. */
export function seedPilot(dir: string) {
  const store = new PilotStore(dir);
  const w = testWorld();
  const snap: Snapshot = {
    version: 1,
    meta: {
      version: 1,
      centreName: 'مركز تجريبي',
      startDate: w.startDate!,
      endDate: null,
      createdAt: new Date().toISOString(),
    },
    auth: { pins: {}, lock: {}, sessions: {} },
    fu: freshPilotState(w),
  };
  store.create(snap);
  const auth = new PilotAuth(store, { sessionHours: 12, isActiveUser: () => true });
  const pins = Object.fromEntries(w.users.map((u) => [u.id, auth.setPin(u.id)]));
  store.close();
  return pins as Record<'usr-p001' | 'usr-p002' | 'usr-p003', string>;
}

/** An in-process pilot app on `dir` (no listeners). */
export function openApp(dir: string, extraEnv: Record<string, string> = {}) {
  const cfg = pilotConfig({
    PILOT_DATA_DIR: dir,
    PILOT_BIND: '127.0.0.1',
    PILOT_WEB_PORT: '18443',
    PILOT_TEACHER_PORT: '18444',
    ...extraEnv,
  } as NodeJS.ProcessEnv);
  const store = new PilotStore(dir);
  store.open();
  configureFollowupStore(store.followupStore());
  const app = createPilotApp(cfg, store);
  const base = 'http://127.0.0.1:18443';
  const call = (
    method: string,
    path: string,
    opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) =>
    app.api(
      new Request(base + path, {
        method,
        headers: {
          'content-type': 'application/json',
          'accept-language': 'en',
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      }),
    );
  const signIn = async (userId: string, pin: string) => {
    const r = await call('POST', '/v1/pilot/sessions', { body: { userId, pin } });
    if (r.status !== 200) throw new Error(`sign-in ${r.status}`);
    return r.headers.get('set-cookie')!.split(';')[0]!;
  };
  return { app, store, cfg, call, signIn };
}
