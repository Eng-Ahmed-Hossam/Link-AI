/**
 * DRAFT API client for the Batch 1 screens. Replaced by the OpenAPI-generated client (E0-13).
 * Every state-changing call sends an Idempotency-Key (07 §1).
 */
import { useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  CentreProfile,
  CheckoutResult,
  ConsentState,
  Child,
  Invite,
  CreateEnrolmentBody,
  CreateReviewBody,
  CurriculumRef,
  Enrolment,
  GroupSummary,
  Me,
  OtpRequestResult,
  OtpVerifyResult,
  PaymentMethod,
  PutConsentBody,
  ProblemDetails,
  ReviewCreated,
  Role,
  SchoolYearRef,
  SearchCentresResult,
  SearchQuery,
  SubjectRef,
  TeacherCard,
  TeacherProfile,
  UpdateMeBody,
  WaitlistEntry,
  WaitlistAcceptBody,
  Page,
} from './types';
import type {
  CaseAttempt,
  CorrectionRequest,
  CentreGroup,
  DeliveryStatus,
  PilotMe,
  PilotPerson,
  PilotStaffRow,
  PilotVoiceStatus,
  Correction,
  CorrectionBody,
  FollowupCase,
  Note,
  NoteTag,
  ParentMessage,
  RosterRow,
  SaveRecordBody,
  SessionRecord,
  StudentDetail,
  TeacherGroup,
  TeacherToday,
  VoiceExtraction,
  VoiceNote,
  ActivityLog,
  AssistantEvent,
  CentreSessionRow,
  CentreStudentRow,
  OwnerToday,
  ParentUpdate,
  RuleChangeBody,
  RuleView,
  StaffMember,
  StaffPermission,
} from './followup';
import type {
  OpsPayout,
  OpsPayoutAccount,
  PayoutAccount,
  PayoutAccountBody,
  PayoutBatch,
  PayoutExport,
  PayoutRow,
  PayoutRun,
  RentDue,
} from './payouts';
import type {
  AuditRow,
  CentreApplications,
  CentreStage,
  DataExport,
  DataRequest,
  DataRequestKind,
  OpsDataRequest,
  OpsMe,
  OpsNote,
  OpsNoteSubject,
  OpsRefund,
  OpsTeacher,
  ReviewQueueItem,
  VerificationCheckCode,
  VerificationCheckStatus,
} from './ops';
import type {
  AutoApproveRules,
  CentreApplicationBody,
  CentreFeatures,
  CentreProfileEdit,
  CentreSchedule,
  Earnings,
  GroupPatch,
  Hall,
  HallPatch,
  NewGroupBody,
  RentEstimate,
  RentEstimateBody,
  RentIncome,
  ReviewTab,
  ReviewsReceived,
  RoomRequest,
  RoomRequestBody,
  RoomSearchQuery,
  RoomSearchResult,
  TeacherBooking,
  TeacherEnrolment,
  TeacherSelf,
  TeacherSelfPatch,
  NewHallBody,
} from './market';

export * from './types';
export * from './followup';
export * from './market';
export * from './flags';
export * from './ops';
export * from './payouts';
export { setApiBaseUrl, apiUrl } from './config';
export { config as apiConfig } from './config';
import { config } from './config';

export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.title);
  }
  get code() {
    return this.problem.code;
  }
  /** No response at all: show the offline state, not the error state (11 §4). */
  get isNetwork() {
    return this.problem.code === 'network_error';
  }
}

/**
 * Where API calls go (docs/14):
 * - `mock`: in-process MSW (browser worker, or the fetch wrapper on native); state per device.
 * - `mock-server`: the same handlers over HTTP (`pnpm mock:server`); one shared state for all apps.
 * - `live`: core-api.
 * `useMocks = "false"` (the older switch) means `live`.
 */
export type ApiMode = 'mock' | 'mock-server' | 'live';
export const MOCK_SERVER_URL = 'http://localhost:4010';
export function resolveApiMode(mode: string | undefined, useMocks?: string): ApiMode {
  if (mode === 'mock' || mode === 'mock-server' || mode === 'live') return mode;
  return useMocks === 'false' ? 'live' : 'mock';
}

export const setApiLocale = (locale: 'ar' | 'en') => {
  config.locale = locale;
};
export const setAuthToken = (token: string | null) => {
  config.token = token;
};

/** Live mode: how the session travels and where rotated tokens go (07 §1, MKT-ACC-04). */
export function configureAuth(opts: {
  transport: 'bearer' | 'cookie';
  refreshToken?: string | null;
  onTokens?: (t: { accessToken: string; refreshToken: string }) => void;
  onAuthLost?: () => void;
}) {
  config.auth = opts.transport;
  config.refreshToken = opts.refreshToken ?? null;
  config.onTokens = opts.onTokens ?? null;
  config.onAuthLost = opts.onAuthLost ?? null;
}
export const setRefreshToken = (token: string | null) => {
  config.refreshToken = token;
};

export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

type Params = Record<string, string | number | boolean | undefined | null>;

const networkError = () =>
  new ApiError({ type: 'about:blank', title: 'Network error', status: 0, code: 'network_error' });

async function send(method: string, url: string, headers: Record<string, string>, body?: string) {
  const h = { ...headers };
  if (config.auth === 'cookie') h['x-link-auth'] = 'cookie';
  else if (config.token) h.authorization = `Bearer ${config.token}`;
  try {
    return await fetch(url, {
      method,
      headers: h,
      body,
      // Same-origin cookies (the browser default): core-api's on the web, the pilot server's in the
      // pilot. Never cross-origin credentials.
      credentials: 'same-origin',
    });
  } catch {
    throw networkError();
  }
}

/**
 * One refresh at a time (several calls can expire together). Resolves true when the session was
 * renewed (or another tab already renewed it), false when the person must sign in again.
 */
let refreshing: Promise<boolean> | null = null;
function renewSession(): Promise<boolean> {
  refreshing ??= (async () => {
    if (config.auth === 'bearer' && !config.refreshToken) return false;
    const res = await send(
      'POST',
      `${config.baseUrl}/v1/auth/refresh`,
      { 'content-type': 'application/json', 'idempotency-key': newIdempotencyKey() },
      JSON.stringify(config.auth === 'bearer' ? { refreshToken: config.refreshToken } : {}),
    ).catch(() => null);
    if (!res) return false;
    // A body nobody reads keeps the fetch open in the browser (the page never goes idle, and the
    // connection stays busy): cancel it whenever the answer is decided by the status alone.
    if (res.status === 409 || !res.ok) {
      await res.body?.cancel().catch(() => {});
      return res.status === 409; // refresh_raced: another tab rotated; cookies are fresh
    }
    const t = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (config.auth === 'bearer' && t.accessToken && t.refreshToken) {
      config.token = t.accessToken;
      config.refreshToken = t.refreshToken;
      config.onTokens?.({ accessToken: t.accessToken, refreshToken: t.refreshToken });
    }
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  {
    params,
    body,
    idempotencyKey,
  }: { params?: Params; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const headers: Record<string, string> = {
    accept: 'application/json',
    'accept-language': config.locale,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  // The same key on a retry after a refresh: the server replays instead of acting twice.
  if (method !== 'GET') headers['idempotency-key'] = idempotencyKey ?? newIdempotencyKey();
  const url = `${config.baseUrl}${path}${qs.size ? `?${qs}` : ''}`;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  let res = await send(method, url, headers, payload);
  // The 401's body, read once (an unread body keeps the browser's fetch open).
  let first401: ProblemDetails | null | undefined;
  // MKT-ACC-04: an access token lasts 15 minutes; renew it once, then retry the call.
  if (res.status === 401 && !path.startsWith('/v1/auth/')) {
    first401 = (await res.json().catch(() => null)) as ProblemDetails | null;
    if (first401?.code === 'token_expired' || config.auth === 'cookie') {
      if (await renewSession()) {
        res = await send(method, url, headers, payload);
        first401 = undefined;
      }
      if (res.status === 401) config.onAuthLost?.();
    }
  }
  if (!res.ok) {
    const problem =
      first401 !== undefined
        ? first401
        : ((await res.json().catch(() => null)) as ProblemDetails | null);
    throw new ApiError(
      problem ?? {
        type: 'about:blank',
        title: res.statusText,
        status: res.status,
        code: 'unknown',
      },
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // Auth (MKT-ACC-01, -02)
  requestOtp: (phoneE164: string) =>
    request<OtpRequestResult>('POST', '/v1/auth/otp/request', { body: { phone: phoneE164 } }),
  verifyOtp: (phoneE164: string, code: string) =>
    request<OtpVerifyResult>('POST', '/v1/auth/otp/verify', { body: { phone: phoneE164, code } }),
  /** MKT-ACC-04: the teacher app passes its refresh token; the web sends the cookie. */
  refresh: (refreshToken?: string) =>
    request<{ accessToken?: string; refreshToken?: string }>('POST', '/v1/auth/refresh', {
      body: refreshToken ? { refreshToken } : {},
    }),
  logout: (refreshToken?: string) =>
    request<void>('POST', '/v1/auth/logout', { body: refreshToken ? { refreshToken } : {} }),
  /** E0-09: global flags, merged with the caller's centre and teacher scopes. */
  featureFlags: () => request<{ flags: Record<string, boolean> }>('GET', '/v1/feature-flags'),
  me: () => request<Me>('GET', '/v1/me'),
  /** Centre invitations waiting for an answer; a teacher invite needs the teacher's accept. */
  myInvites: () => request<Invite[]>('GET', '/v1/me/invites'),
  acceptInvite: (id: string) =>
    request<Invite[]>('POST', `/v1/me/invites/${id}/accept`, { body: {} }),
  addRole: (role: Role) => request<Me>('POST', '/v1/me/roles', { body: { role } }),
  updateMe: (body: UpdateMeBody, idempotencyKey: string) =>
    request<Me>('PATCH', '/v1/me', { body, idempotencyKey }),
  consents: () => request<{ data: ConsentState[] }>('GET', '/v1/me/consents'),
  putConsent: (body: PutConsentBody, idempotencyKey: string) =>
    request<{ data: ConsentState[] }>('PUT', '/v1/me/consents', { body, idempotencyKey }),
  children: () => request<Page<Child>>('GET', '/v1/me/children'),
  addChild: (body: { displayName: string; curriculumId: string; schoolYearId: string }) =>
    request<Child>('POST', '/v1/me/children', { body }),
  // Reference data
  curricula: () =>
    request<(CurriculumRef & { schoolYears: SchoolYearRef[] })[]>('GET', '/v1/curricula'),
  /** S3: the home areas a parent can pick (areas with a verified centre). */
  areas: () => request<{ name: string; governorate: string | null }[]>('GET', '/v1/areas'),
  subjects: (curriculumId?: string, schoolYearId?: string) =>
    request<SubjectRef[]>('GET', '/v1/subjects', { params: { curriculumId, schoolYearId } }),
  // Discovery (MKT-DSC)
  searchCentres: (q: SearchQuery) =>
    request<SearchCentresResult>('GET', '/v1/search/centres', { params: { ...q } }),
  searchTeachers: (q: SearchQuery) =>
    request<Page<TeacherCard>>('GET', '/v1/search/teachers', { params: { ...q } }),
  centreBySlug: (slug: string, q: { schoolYearId?: string; subjectId?: string } = {}) =>
    request<CentreProfile & { groupsForChild: GroupSummary[] }>(
      'GET',
      `/v1/centres/by-slug/${encodeURIComponent(slug)}`,
      {
        params: q,
      },
    ),
  teacherBySlug: (slug: string) =>
    request<TeacherProfile>('GET', `/v1/teachers/by-slug/${encodeURIComponent(slug)}`),
  group: (id: string) => request<GroupSummary>('GET', `/v1/groups/${id}`),
  // Enrolment and payment (MKT-ENR)
  createEnrolment: (body: CreateEnrolmentBody, idempotencyKey: string) =>
    request<Enrolment>('POST', '/v1/enrolments', { body, idempotencyKey }),
  checkout: (enrolmentId: string, method: PaymentMethod, idempotencyKey: string) =>
    request<CheckoutResult>('POST', `/v1/enrolments/${enrolmentId}/checkout`, {
      body: { method },
      idempotencyKey,
    }),
  enrolment: (id: string) => request<Enrolment>('GET', `/v1/enrolments/${id}`),
  myEnrolments: () => request<Page<Enrolment>>('GET', '/v1/me/enrolments'),
  cancelEnrolment: (id: string) => request<Enrolment>('POST', `/v1/enrolments/${id}/cancel`),
  cancelPlan: (id: string) => request<Enrolment>('POST', `/v1/enrolments/${id}/plan/cancel`),
  refundRequest: (id: string, reason: string) =>
    request<Enrolment>('POST', `/v1/enrolments/${id}/refund-requests`, { body: { reason } }),
  joinWaitlist: (groupId: string, studentId: string) =>
    request<WaitlistEntry>('POST', `/v1/groups/${groupId}/waitlist`, { body: { studentId } }),
  /** Accept a live waitlist offer: the seat becomes a hold and the checkout opens (BR-ENR-10). */
  acceptWaitlistOffer: (entryId: string, body: WaitlistAcceptBody, idempotencyKey: string) =>
    request<CheckoutResult>('POST', `/v1/waitlist/${entryId}/accept`, { body, idempotencyKey }),
  leaveWaitlist: (entryId: string) => request<void>('DELETE', `/v1/waitlist/${entryId}`),
  // Reviews (MKT-REV)
  createReview: (body: CreateReviewBody, idempotencyKey: string) =>
    request<ReviewCreated>('POST', '/v1/reviews', { body, idempotencyKey }),
};

/** Phase 2 follow-up endpoints (docs/07 §3; draft shapes in ./followup). */
export const fuApi = {
  teacherToday: () => request<TeacherToday>('GET', '/v1/teachers/me/today'),
  teacherGroups: () => request<TeacherGroup[]>('GET', '/v1/teachers/me/groups'),
  roster: (groupId: string) => request<RosterRow[]>('GET', `/v1/groups/${groupId}/roster`),
  records: (groupId: string) =>
    request<SessionRecord[]>('GET', `/v1/groups/${groupId}/session-records`),
  openRecord: (groupId: string, groupSessionId: string, idempotencyKey?: string) =>
    request<SessionRecord>('POST', `/v1/groups/${groupId}/session-records`, {
      body: { groupSessionId },
      idempotencyKey,
    }),
  record: (id: string) => request<SessionRecord>('GET', `/v1/session-records/${id}`),
  saveDraft: (id: string, body: SaveRecordBody) =>
    request<SessionRecord>('PATCH', `/v1/session-records/${id}`, { body }),
  /** Approval 1. Keep the key across retries: a retry never creates a second record (FUP-REC-07). */
  confirmRecord: (id: string, idempotencyKey: string) =>
    request<SessionRecord>('POST', `/v1/session-records/${id}/confirm`, { idempotencyKey }),
  correct: (entryId: string, body: CorrectionBody) =>
    request<Correction>('POST', `/v1/record-entries/${entryId}/corrections`, { body }),
  createVoiceNote: (body: { sessionRecordId: string; durationS: number }, idempotencyKey: string) =>
    request<VoiceNote>('POST', '/v1/voice-notes', { body, idempotencyKey }),
  voiceUploaded: (id: string) => request<VoiceNote>('POST', `/v1/voice-notes/${id}/uploaded`),
  /** `{ status: 'transcribing' }` (HTTP 202) until the extraction is ready. */
  extraction: (voiceNoteId: string) =>
    request<VoiceExtraction | { status: 'transcribing'; etaSeconds?: number | null }>(
      'GET',
      `/v1/voice-notes/${voiceNoteId}/extraction`,
    ),
  /** B3 "Try again": the server sends the kept audio to speech-to-text again. */
  retryVoice: (voiceNoteId: string) =>
    request<VoiceNote>('POST', `/v1/voice-notes/${voiceNoteId}/retry`),
  resolveIdentity: (extractionId: string, itemId: string, studentId: string) =>
    request<VoiceExtraction>('POST', `/v1/voice-extractions/${extractionId}/resolve-identity`, {
      body: { itemId, studentId },
    }),
  discardItem: (extractionId: string, itemId: string) =>
    request<VoiceExtraction>('POST', `/v1/voice-extractions/${extractionId}/discard-item`, {
      body: { itemId },
    }),
  student: (id: string) => request<StudentDetail>('GET', `/v1/students/${id}`),
  addNote: (studentId: string, body: { groupId: string; tag: NoteTag; body: string }) =>
    request<Note>('POST', `/v1/students/${studentId}/notes`, { body }),
  suggestNote: (noteId: string) => request<Note>('POST', `/v1/notes/${noteId}/suggest-for-parent`),
  cases: () => request<Page<FollowupCase>>('GET', '/v1/cases'),
  case: (id: string) => request<FollowupCase>('GET', `/v1/cases/${id}`),
  addAttempt: (
    id: string,
    body: Pick<CaseAttempt, 'channel' | 'result'> &
      Partial<Pick<CaseAttempt, 'learned' | 'nextAction' | 'followUpOn'>> & { keepOpen?: boolean },
  ) => request<FollowupCase>('POST', `/v1/cases/${id}/attempts`, { body }),
  dismissCase: (id: string, reason: string) =>
    request<FollowupCase>('POST', `/v1/cases/${id}/dismiss`, { body: { reason } }),
  reopenCase: (id: string) => request<FollowupCase>('POST', `/v1/cases/${id}/reopen`),
  messages: () => request<Page<ParentMessage>>('GET', '/v1/messages'),
  message: (id: string) => request<ParentMessage>('GET', `/v1/messages/${id}`),
  draftMessage: (caseId: string, tone?: ParentMessage['tone']) =>
    request<ParentMessage>('POST', '/v1/messages/drafts', { body: { caseId, tone } }),
  editMessage: (id: string, body: { text?: string; tone?: ParentMessage['tone'] }) =>
    request<ParentMessage>('PATCH', `/v1/messages/${id}`, { body }),
  approveMessage: (id: string, body: { checked: boolean; channel?: 'whatsapp' | 'sms' }) =>
    request<ParentMessage>('POST', `/v1/messages/${id}/approve`, { body }),
  /** Pilot (A6): staff sent the approved text from the centre's own WhatsApp. */
  markSentManually: (id: string) =>
    request<ParentMessage>('POST', `/v1/messages/${id}/sent-manually`),
  /** CF-34: the teacher closes an owner's request without a correction. */
  closeCorrectionRequest: (id: string) =>
    request<CorrectionRequest>('POST', `/v1/correction-requests/${id}/close`),
};

/** Owner web (Batch 6). Centre-scoped paths name the centre (07 §1). */
export const ownerApi = {
  today: (centreId: string) => request<OwnerToday>('GET', `/v1/centres/${centreId}/today`),
  students: (centreId: string) =>
    request<Page<CentreStudentRow>>('GET', `/v1/centres/${centreId}/students`),
  sessions: (centreId: string) =>
    request<Page<CentreSessionRow>>('GET', `/v1/centres/${centreId}/sessions`),
  rules: (centreId: string) => request<RuleView[]>('GET', `/v1/centres/${centreId}/rules`),
  changeRule: (centreId: string, code: string, body: RuleChangeBody) =>
    request<RuleView>('PUT', `/v1/centres/${centreId}/rules/${code}`, { body }),
  approveRule: (centreId: string, code: string) =>
    request<RuleView>('POST', `/v1/centres/${centreId}/rules/${code}/approve`),
  rejectRule: (centreId: string, code: string) =>
    request<RuleView>('POST', `/v1/centres/${centreId}/rules/${code}/reject`),
  staff: (centreId: string) => request<StaffMember[]>('GET', `/v1/centres/${centreId}/staff`),
  invite: (
    centreId: string,
    body: { phone: string; role: StaffMember['role']; permissions?: StaffPermission[] },
  ) => request<StaffMember[]>('POST', `/v1/centres/${centreId}/staff`, { body }),
  activity: (centreId: string) => request<ActivityLog>('GET', `/v1/centres/${centreId}/activity`),
  reviseMessage: (id: string) => request<ParentMessage>('POST', `/v1/messages/${id}/revise`),
  seatCheck: (caseId: string) =>
    request<{ text: string; seatsLeft: number; groupId: string }>(
      'POST',
      `/v1/cases/${caseId}/seat-check`,
    ),
  parentUpdates: () => request<Page<ParentUpdate>>('GET', '/v1/me/updates'),
  /** CF-39: P09 with the marketplace off — the child's groups at the centre. */
  centreGroups: () => request<CentreGroup[]>('GET', '/v1/me/centre-groups'),
  /** CF-34: A14 "Ask the teacher to correct" (owner only). */
  requestCorrection: (recordId: string, body: { studentId?: string | null; text: string }) =>
    request<CorrectionRequest>('POST', `/v1/session-records/${recordId}/correction-requests`, {
      body,
    }),
  briefing: () =>
    request<{
      text: string;
      items: {
        caseId: string;
        student: { id: string; displayName: string };
        reason: string;
        draftMessageId: string | null;
        latestSent: { messageId: string; status: DeliveryStatus } | null;
        blocked: string | null;
      }[];
    }>('GET', '/v1/assistant/briefing'),
  transcribe: async (audio: Blob) => {
    const res = await fetch(`${config.baseUrl}/v1/assistant/transcribe`, {
      method: 'POST',
      headers: {
        'accept-language': config.locale,
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: audio,
    });
    if (!res.ok) throw new ApiError((await res.json()) as ProblemDetails);
    return (await res.json()) as { text: string; language: string };
  },
  /**
   * One assistant turn, streamed (SSE over a POST). Events arrive through `onEvent` as the server
   * sends them; resolves when the stream ends.
   */
  assistantTurn: async (text: string, onEvent: (e: AssistantEvent) => void) => {
    let res: Response;
    try {
      res = await fetch(`${config.baseUrl}/v1/assistant/turns`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'accept-language': config.locale,
          'idempotency-key': newIdempotencyKey(),
          ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
        },
        body: JSON.stringify({ text }),
      });
    } catch {
      throw new ApiError({
        type: 'about:blank',
        title: 'Network error',
        status: 0,
        code: 'network_error',
      });
    }
    if (!res.ok || !res.body) throw new ApiError((await res.json()) as ProblemDetails);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) onEvent(JSON.parse(line.slice(6)) as AssistantEvent);
      }
    }
  },
};

/**
 * Pilot mode (LINK_MODE=pilot): sign-in with a 6-digit PIN into a server-side session (httpOnly
 * cookie, same origin), and the owner's people management (A16). No token is kept in the browser.
 */
export const pilotApi = {
  info: () =>
    request<{ mode: 'pilot'; centreName: string; startDate: string; endDate: string | null }>(
      'GET',
      '/v1/pilot/info',
    ),
  people: () => request<PilotPerson[]>('GET', '/v1/pilot/people'),
  signIn: (userId: string, pin: string) =>
    request<{ id: string; name: string; role: PilotPerson['role']; expiresAt: string }>(
      'POST',
      '/v1/pilot/sessions',
      { body: { userId, pin } },
    ),
  signOut: () => request<void>('DELETE', '/v1/pilot/sessions/current'),
  me: () => request<PilotMe>('GET', '/v1/me'),
  users: () => request<PilotStaffRow[]>('GET', '/v1/pilot/users'),
  addUser: (body: { name: string; role: PilotPerson['role']; groupIds?: string[] }) =>
    request<{ user: PilotPerson; pin: string }>('POST', '/v1/pilot/users', { body }),
  setPin: (userId: string) => request<{ pin: string }>('POST', `/v1/pilot/users/${userId}/pin`),
  removeUser: (userId: string) => request<void>('DELETE', `/v1/pilot/users/${userId}`),
  /** The owner records a teacher's signed voice consent (E15-01), or its withdrawal. */
  setVoiceConsent: (userId: string, granted: boolean) =>
    request<{ userId: string; voiceConsent: boolean }>(
      'POST',
      `/v1/pilot/users/${userId}/voice-consent`,
      { body: { granted } },
    ),
  /** 4.2: the owner switches voice on or off for one teacher (on needs the consent first). */
  setTeacherVoice: (userId: string, on: boolean) =>
    request<{ userId: string; voiceOn: boolean }>('POST', `/v1/pilot/users/${userId}/voice`, {
      body: { on },
    }),
  /** 4.2: voice for the whole centre: availability, profile estimate, kill switch. */
  voiceStatus: () => request<PilotVoiceStatus>('GET', '/v1/pilot/voice'),
  setVoicePaused: (paused: boolean) =>
    request<{ paused: boolean; stopped: number }>('POST', '/v1/pilot/voice', { body: { paused } }),
};

/** Phase 1 marketplace operations: the centre web (Batch 2) and the teacher app (Batch 3). */
export const marketApi = {
  // Centre (C01–C07, auto-approve, paid extras)
  applyToJoin: (body: CentreApplicationBody) =>
    request<{ id: string }>('POST', '/v1/centre-applications', { body }),
  centreProfile: (centreId: string) =>
    request<CentreProfileEdit>('GET', `/v1/centres/${centreId}/profile`),
  updateCentreProfile: (centreId: string, body: { about?: string; photos?: number }) =>
    request<CentreProfileEdit>('PATCH', `/v1/centres/${centreId}`, { body }),
  halls: (centreId: string) => request<Hall[]>('GET', `/v1/centres/${centreId}/rooms`),
  /** CF-44: owners add halls. */
  addHall: (centreId: string, body: NewHallBody) =>
    request<Hall>('POST', `/v1/centres/${centreId}/rooms`, { body }),
  /** CF-44: owners move the map pin; the location is under review until ops verify it. */
  moveCentrePin: (centreId: string, body: { lat: number; lng: number; address: string }) =>
    request<CentreProfileEdit>('PATCH', `/v1/centres/${centreId}`, { body: { location: body } }),
  updateHall: (hallId: string, body: HallPatch) =>
    request<Hall>('PATCH', `/v1/rooms/${hallId}`, { body }),
  schedule: (centreId: string) =>
    request<CentreSchedule>('GET', `/v1/centres/${centreId}/schedule`),
  autoApprove: (centreId: string) =>
    request<AutoApproveRules>('GET', `/v1/centres/${centreId}/settings/auto-approve`),
  putAutoApprove: (centreId: string, body: AutoApproveRules) =>
    request<AutoApproveRules>('PUT', `/v1/centres/${centreId}/settings/auto-approve`, { body }),
  centreRequests: (centreId: string) =>
    request<RoomRequest[]>('GET', '/v1/room-requests', { params: { centreId } }),
  moveRequest: (id: string, stage: 'phone_call' | 'meeting', at?: string) =>
    request<RoomRequest>('POST', `/v1/room-requests/${id}/stage`, { body: { stage, at } }),
  approveRequest: (id: string) =>
    request<RoomRequest>('POST', `/v1/room-requests/${id}/approve`, { body: {} }),
  declineRequest: (id: string, reason: string) =>
    request<RoomRequest>('POST', `/v1/room-requests/${id}/decline`, { body: { reason } }),
  rentIncome: (centreId: string) =>
    request<RentIncome>('GET', `/v1/centres/${centreId}/rent-income`),
  /** C04 tabs map to 07's filters: public / private visibility, or reported status. */
  reviewsReceived: (centreId: string, tab: ReviewTab) =>
    request<ReviewsReceived>('GET', '/v1/me/reviews-received', {
      params: tab === 'reported' ? { centreId, status: 'reported' } : { centreId, visibility: tab },
    }),
  replyReview: (id: string, body: string) =>
    request<{ ok: true }>('POST', `/v1/reviews/${id}/reply`, { body: { body } }),
  reportReview: (id: string, reason: string) =>
    request<{ ok: true }>('POST', `/v1/reviews/${id}/report`, { body: { reason } }),
  centreFeatures: (centreId: string) =>
    request<CentreFeatures>('GET', `/v1/centres/${centreId}/features`),
  // Teacher (J01–J07)
  /** J01 (07 §2): `weekday` is a comma-separated list (6 = Saturday … 4 = Thursday). */
  searchRooms: (q: RoomSearchQuery) =>
    request<RoomSearchResult[]>('GET', '/v1/rooms/search', { params: { ...q } }),
  rentEstimate: (body: RentEstimateBody) =>
    request<RentEstimate>('POST', `/v1/rooms/${body.hallId}/rent-estimate`, { body }),
  requestRoom: (body: RoomRequestBody) =>
    request<RoomRequest>('POST', '/v1/room-requests', { body }),
  myRoomRequests: () =>
    request<RoomRequest[]>('GET', '/v1/room-requests', { params: { scope: 'mine' } }),
  withdrawRequest: (id: string) =>
    request<RoomRequest>('POST', `/v1/room-requests/${id}/withdraw`, { body: {} }),
  teacherSelf: () => request<TeacherSelf>('GET', '/v1/teachers/me'),
  updateTeacherSelf: (body: TeacherSelfPatch) =>
    request<TeacherSelf>('PATCH', '/v1/teachers/me', { body }),
  myBookings: () =>
    request<TeacherBooking[]>('GET', '/v1/room-bookings', { params: { scope: 'mine' } }),
  updateGroup: (id: string, body: GroupPatch) =>
    request<{ ok: true }>('PATCH', `/v1/groups/${id}`, { body }),
  createGroup: (body: NewGroupBody) => request<{ id: string }>('POST', '/v1/groups', { body }),
  myEnrolments: () => request<TeacherEnrolment[]>('GET', '/v1/teachers/me/enrolments'),
  acceptEnrolment: (id: string) =>
    request<TeacherEnrolment>('POST', `/v1/enrolments/${id}/accept`, { body: {} }),
  declineEnrolment: (id: string) =>
    request<TeacherEnrolment>('POST', `/v1/enrolments/${id}/decline`, { body: {} }),
  earnings: () => request<Earnings>('GET', '/v1/teachers/me/earnings'),
  // S3: payout account, payouts and rent the teacher still owes (OD-12).
  myPayoutAccount: () => request<PayoutAccount>('GET', '/v1/me/payout-account'),
  putMyPayoutAccount: (body: PayoutAccountBody, idempotencyKey: string) =>
    request<PayoutAccount>('PUT', '/v1/me/payout-account', { body, idempotencyKey }),
  myPayouts: () => request<PayoutRow[]>('GET', '/v1/me/payouts'),
  rentDue: () => request<RentDue[]>('GET', '/v1/teachers/me/rent-due'),
  payRent: (invoiceId: string, method: PaymentMethod, idempotencyKey: string) =>
    request<CheckoutResult>('POST', `/v1/rent-invoices/${invoiceId}/checkout`, {
      body: { method },
      idempotencyKey,
    }),
  centrePayoutAccount: (centreId: string) =>
    request<PayoutAccount>('GET', `/v1/centres/${centreId}/payout-account`),
  putCentrePayoutAccount: (centreId: string, body: PayoutAccountBody, idempotencyKey: string) =>
    request<PayoutAccount>('PUT', `/v1/centres/${centreId}/payout-account`, {
      body,
      idempotencyKey,
    }),
  centrePayouts: (centreId: string) =>
    request<PayoutRow[]>('GET', `/v1/centres/${centreId}/payouts`),
  /** The teacher's centre(s) with the follow-up extra (Follow-up tab). */
  teacherFeatures: () => request<CentreFeatures>('GET', '/v1/teachers/me/features'),
  /** A parent: whether any of their children's centres has the extra (P09 updates feed). */
  parentFeatures: () => request<CentreFeatures>('GET', '/v1/me/features'),
};

export const isExtractionReady = (
  x: VoiceExtraction | { status: 'transcribing' },
): x is VoiceExtraction => 'items' in x;

export const queryKeys = {
  me: ['me'] as const,
  children: ['me', 'children'] as const,
  curricula: ['ref', 'curricula'] as const,
  subjects: (c?: string, y?: string) => ['ref', 'subjects', c, y] as const,
  searchCentres: (q: SearchQuery) => ['search', 'centres', q] as const,
  searchTeachers: (q: SearchQuery) => ['search', 'teachers', q] as const,
  centre: (slug: string, q: object) => ['centre', slug, q] as const,
  teacher: (slug: string) => ['teacher', slug] as const,
  group: (id: string) => ['group', id] as const,
  enrolment: (id: string) => ['enrolment', id] as const,
  myEnrolments: ['me', 'enrolments'] as const,
};

type Opts<T> = Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>;

export const useMe = (opts?: Opts<Me>) =>
  useQuery({ queryKey: queryKeys.me, queryFn: api.me, ...opts });
export const useChildren = (opts?: Opts<Page<Child>>) =>
  useQuery({ queryKey: queryKeys.children, queryFn: api.children, ...opts });
export const useCurricula = () =>
  useQuery({ queryKey: queryKeys.curricula, queryFn: api.curricula, staleTime: Infinity });
export const useSubjects = (curriculumId?: string, schoolYearId?: string) =>
  useQuery({
    queryKey: queryKeys.subjects(curriculumId, schoolYearId),
    queryFn: () => api.subjects(curriculumId, schoolYearId),
    staleTime: Infinity,
  });
/** The subject search starts with (Maths), by its code, so the ID works in every API mode. */
export const DEFAULT_SUBJECT_CODE = 'MATH';
export const useDefaultSubjectId = () => {
  const s = useSubjects();
  return s.data?.find((x) => x.code === DEFAULT_SUBJECT_CODE)?.id ?? s.data?.[0]?.id;
};
export const useSearchCentres = (q: SearchQuery, opts?: Opts<SearchCentresResult>) =>
  useQuery({ queryKey: queryKeys.searchCentres(q), queryFn: () => api.searchCentres(q), ...opts });
export const useSearchTeachers = (q: SearchQuery, opts?: Opts<Page<TeacherCard>>) =>
  useQuery({
    queryKey: queryKeys.searchTeachers(q),
    queryFn: () => api.searchTeachers(q),
    ...opts,
  });
export const useCentre = (slug: string, q: { schoolYearId?: string; subjectId?: string } = {}) =>
  useQuery({ queryKey: queryKeys.centre(slug, q), queryFn: () => api.centreBySlug(slug, q) });
export const useTeacher = (slug: string) =>
  useQuery({ queryKey: queryKeys.teacher(slug), queryFn: () => api.teacherBySlug(slug) });
export const useGroup = (id: string | undefined) =>
  useQuery({ queryKey: queryKeys.group(id ?? ''), queryFn: () => api.group(id!), enabled: !!id });
/** Never cached: enrolment status comes from the server each time (07: "never cached"). */
export const useEnrolment = (id: string | undefined, opts?: Opts<Enrolment>) =>
  useQuery({
    queryKey: queryKeys.enrolment(id ?? ''),
    queryFn: () => api.enrolment(id!),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    ...opts,
  });
export const useMyEnrolments = () =>
  useQuery({ queryKey: queryKeys.myEnrolments, queryFn: api.myEnrolments, staleTime: 0 });

export const useCreateReview = () =>
  useMutation<ReviewCreated, ApiError, { body: CreateReviewBody; key: string }>({
    mutationFn: ({ body, key }) => api.createReview(body, key),
  });

/**
 * The ops console (S2, `/v1/ops/*`; MKT-OPS-01..04, -08, -09) and the person's own data requests.
 * Live only: ops never runs on mock data.
 */
type Ok = { ok: true };
export const opsApi = {
  me: () => request<OpsMe>('GET', '/v1/ops/me'),
  centreApplications: (stage?: CentreStage) =>
    request<CentreApplications>('GET', '/v1/ops/centre-applications', { params: { stage } }),
  putCheck: (
    subjectType: 'centre' | 'teacher',
    subjectId: string,
    code: VerificationCheckCode,
    body: { status: VerificationCheckStatus; notes?: string },
  ) =>
    request<Ok>('PUT', `/v1/ops/verifications/${subjectType}/${subjectId}/checks/${code}`, {
      body,
    }),
  setCentreStage: (id: string, stage: 'new' | 'call_scheduled' | 'visit_booked') =>
    request<Ok>('POST', `/v1/ops/centres/${id}/stage`, { body: { stage } }),
  approveCentre: (id: string) => request<Ok>('POST', `/v1/ops/centres/${id}/approve`, { body: {} }),
  rejectCentre: (id: string, reason: string) =>
    request<Ok>('POST', `/v1/ops/centres/${id}/reject`, { body: { reason } }),
  revokeCentre: (id: string, reason: string) =>
    request<Ok>('POST', `/v1/ops/centres/${id}/revoke`, { body: { reason } }),
  addNote: (subjectType: OpsNoteSubject, subjectId: string, body: string) =>
    request<OpsNote>('POST', '/v1/ops/notes', { body: { subjectType, subjectId, body } }),
  leadStatus: (id: string, status: 'contacted' | 'discarded') =>
    request<Ok>('POST', `/v1/ops/leads/${id}/status`, { body: { status } }),
  teachers: (verification?: 'pending' | 'verified' | 'rejected' | 'revoked' | 'all') =>
    request<OpsTeacher[]>('GET', '/v1/ops/teachers', { params: { verification } }),
  decideTeacher: (id: string, action: 'verify' | 'reject' | 'revoke', reason?: string) =>
    request<Ok>('POST', `/v1/ops/teachers/${id}/${action}`, {
      body: reason ? { reason } : {},
    }),
  reviewQueue: () => request<ReviewQueueItem[]>('GET', '/v1/ops/reviews/queue'),
  decideReview: (id: string, decision: 'publish' | 'hide' | 'request_edit', note?: string) =>
    request<Ok>('POST', `/v1/ops/reviews/${id}/decision`, {
      body: note ? { decision, note } : { decision },
    }),
  refunds: (status?: OpsRefund['status'] | 'all') =>
    request<OpsRefund[]>('GET', '/v1/ops/refunds', { params: { status } }),
  approveRefund: (id: string, idempotencyKey: string) =>
    request<Ok>('POST', `/v1/ops/refunds/${id}/approve`, { body: {}, idempotencyKey }),
  rejectRefund: (id: string, reason: string, idempotencyKey: string) =>
    request<Ok>('POST', `/v1/ops/refunds/${id}/reject`, { body: { reason }, idempotencyKey }),
  audit: (objectType: string, objectRef: string) =>
    request<AuditRow[]>('GET', '/v1/ops/audit', { params: { objectType, objectRef } }),
  dataRequests: (status?: 'open' | 'completed' | 'rejected' | 'all') =>
    request<OpsDataRequest[]>('GET', '/v1/ops/data-requests', { params: { status } }),
  exportDataRequest: (id: string) =>
    request<DataExport>('GET', `/v1/ops/data-requests/${id}/export`),
  completeDataRequest: (id: string, result: 'completed' | 'rejected', outcome: string) =>
    request<Ok>('POST', `/v1/ops/data-requests/${id}/complete`, { body: { result, outcome } }),
  // S3 payouts (ops.finance, MKT-OPS-11)
  payoutBatches: () => request<PayoutBatch[]>('GET', '/v1/ops/payout-batches'),
  runPayouts: (idempotencyKey: string) =>
    request<PayoutRun>('POST', '/v1/ops/payout-batches/run', { body: {}, idempotencyKey }),
  exportPayoutBatch: (id: string) =>
    request<PayoutExport>('POST', `/v1/ops/payout-batches/${id}/export`, { body: {} }),
  payouts: (status?: 'initiated' | 'settled' | 'failed' | 'all') =>
    request<OpsPayout[]>('GET', '/v1/ops/payouts', { params: { status } }),
  settlePayout: (id: string, reference: string | undefined, idempotencyKey: string) =>
    request<Ok>('POST', `/v1/ops/payouts/${id}/settle`, {
      body: reference ? { reference } : {},
      idempotencyKey,
    }),
  failPayout: (id: string, reason: string, idempotencyKey: string) =>
    request<Ok>('POST', `/v1/ops/payouts/${id}/fail`, { body: { reason }, idempotencyKey }),
  retryPayout: (id: string, idempotencyKey: string) =>
    request<Ok>('POST', `/v1/ops/payouts/${id}/retry`, { body: {}, idempotencyKey }),
  payoutAccountsToVerify: () => request<OpsPayoutAccount[]>('GET', '/v1/ops/payout-accounts'),
  decidePayoutAccount: (id: string, decision: 'verify' | 'reject', reason?: string) =>
    request<Ok>('POST', `/v1/ops/payout-accounts/${id}/${decision}`, {
      body: reason ? { reason } : {},
    }),
  // The person's own requests (PDPL), from any app.
  myDataRequests: () => request<DataRequest[]>('GET', '/v1/me/data-requests'),
  createDataRequest: (kind: DataRequestKind, details: string, idempotencyKey: string) =>
    request<DataRequest>('POST', '/v1/me/data-requests', {
      body: { kind, details },
      idempotencyKey,
    }),
};

// Every query and mutation fails with ApiError (07 §1 problem details, or a network error).
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}
