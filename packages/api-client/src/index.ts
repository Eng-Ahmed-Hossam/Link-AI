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
  Page,
} from './types';
import type {
  CaseAttempt,
  DeliveryStatus,
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
} from './followup';

export * from './types';
export * from './followup';
export * from './demo';
export { setApiBaseUrl, apiUrl } from './config';
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

export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

type Params = Record<string, string | number | boolean | undefined | null>;

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
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  if (method !== 'GET') headers['idempotency-key'] = idempotencyKey ?? newIdempotencyKey();
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}${qs.size ? `?${qs}` : ''}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError({
      type: 'about:blank',
      title: 'Network error',
      status: 0,
      code: 'network_error',
    });
  }
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as ProblemDetails | null;
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
  me: () => request<Me>('GET', '/v1/me'),
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
    request<VoiceExtraction | { status: 'transcribing' }>(
      'GET',
      `/v1/voice-notes/${voiceNoteId}/extraction`,
    ),
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
  invite: (centreId: string, body: { phone: string; role: StaffMember['role'] }) =>
    request<StaffMember[]>('POST', `/v1/centres/${centreId}/staff/invites`, { body }),
  activity: (centreId: string) => request<ActivityLog>('GET', `/v1/centres/${centreId}/activity`),
  reviseMessage: (id: string) => request<ParentMessage>('POST', `/v1/messages/${id}/revise`),
  seatCheck: (caseId: string) =>
    request<{ text: string; seatsLeft: number; groupId: string }>(
      'POST',
      `/v1/cases/${caseId}/seat-check`,
    ),
  parentUpdates: () => request<Page<ParentUpdate>>('GET', '/v1/me/updates'),
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

// Every query and mutation fails with ApiError (07 §1 problem details, or a network error).
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}
