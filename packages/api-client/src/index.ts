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

export * from './types';

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

const config = { baseUrl: '', locale: 'ar' as 'ar' | 'en', token: null as string | null };

export const setApiBaseUrl = (url: string) => {
  config.baseUrl = url.replace(/\/$/, '');
};
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
