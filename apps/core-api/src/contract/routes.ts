import { z } from 'zod';
import * as s from './schemas';

/**
 * One entry per endpoint (07 §2). Controllers mount these with `@Endpoint(routes.x)`; the OpenAPI
 * document is generated from this list, so a route cannot exist without its contract.
 */
export interface RouteDef {
  /** OpenAPI operationId. */
  name: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** OpenAPI path, `{param}` style. */
  path: string;
  summary: string;
  tag: string;
  /** Requirement / rule IDs (07 tables, 01). */
  rules: string[];
  /** `public` = no token; `user` = signed in (any role; handlers check the rest). */
  auth: 'public' | 'user';
  /** 07 "Idem ✓": an Idempotency-Key is required and the first response is replayed. */
  idempotent?: boolean;
  /** Money endpoints also keep a durable copy in platform.idempotency_keys (07 §1). */
  money?: boolean;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  /** `null` = 204 No Content. */
  response: z.ZodType | null;
  status?: number;
  /** Problem codes this route can return (documented in OpenAPI). */
  errors?: { status: number; code: string }[];
}

const def = <T extends RouteDef>(r: T) => r;

export const routes = {
  // ── Auth and account ─────────────────────────────────────────────────────────
  otpRequest: def({
    name: 'requestOtp',
    method: 'post',
    path: '/v1/auth/otp/request',
    summary: 'Send a 6-digit SMS code (5 minutes; resend after 60 s)',
    tag: 'auth',
    rules: ['MKT-ACC-01'],
    auth: 'public',
    body: s.OtpRequestBody,
    response: s.OtpRequestResult,
    errors: [
      { status: 422, code: 'invalid_phone' },
      { status: 429, code: 'rate_limited' },
      { status: 429, code: 'resend_too_soon' },
    ],
  }),
  otpVerify: def({
    name: 'verifyOtp',
    method: 'post',
    path: '/v1/auth/otp/verify',
    summary:
      'Verify the code; returns the user and the tokens (body for the app, cookies for the web)',
    tag: 'auth',
    rules: ['MKT-ACC-01', 'MKT-ACC-02'],
    auth: 'public',
    body: s.OtpVerifyBody,
    response: s.OtpVerifyResult,
    errors: [
      { status: 422, code: 'invalid_phone' },
      { status: 422, code: 'otp_invalid' },
      { status: 422, code: 'otp_expired' },
      { status: 429, code: 'otp_locked' },
    ],
  }),
  refresh: def({
    name: 'refreshTokens',
    method: 'post',
    path: '/v1/auth/refresh',
    summary: 'Rotate the refresh token (30 days); reuse of an old one revokes the chain',
    tag: 'auth',
    rules: ['MKT-ACC-04'],
    auth: 'public',
    body: s.RefreshBody,
    response: s.TokenPair,
    errors: [{ status: 401, code: 'refresh_invalid' }],
  }),
  logout: def({
    name: 'logout',
    method: 'post',
    path: '/v1/auth/logout',
    summary: 'Revoke the refresh token and clear the cookies',
    tag: 'auth',
    rules: ['MKT-ACC-04'],
    auth: 'public',
    body: s.RefreshBody,
    response: null,
  }),
  me: def({
    name: 'getMe',
    method: 'get',
    path: '/v1/me',
    summary: 'Profile, roles, language, centres and teacher ID',
    tag: 'account',
    rules: ['MKT-ACC-03'],
    auth: 'user',
    response: s.Me,
  }),
  updateMe: def({
    name: 'updateMe',
    method: 'patch',
    path: '/v1/me',
    summary: 'Name and language',
    tag: 'account',
    rules: ['MKT-ACC-03'],
    auth: 'user',
    idempotent: true,
    body: s.UpdateMeBody,
    response: s.Me,
  }),
  addRole: def({
    name: 'addRole',
    method: 'post',
    path: '/v1/me/roles',
    summary: 'Add the role parent, teacher or centre_owner',
    tag: 'account',
    rules: ['MKT-ACC-02'],
    auth: 'user',
    idempotent: true,
    body: s.AddRoleBody,
    response: s.Me,
  }),
  consents: def({
    name: 'getConsents',
    method: 'get',
    path: '/v1/me/consents',
    summary: 'Current consents (latest event per kind; never cached)',
    tag: 'account',
    rules: ['BR-DAT-03'],
    auth: 'user',
    response: s.ConsentList,
  }),
  putConsent: def({
    name: 'putConsent',
    method: 'put',
    path: '/v1/me/consents',
    summary: 'Grant or withdraw one consent',
    tag: 'account',
    rules: ['BR-DAT-03'],
    auth: 'user',
    idempotent: true,
    body: s.PutConsentBody,
    response: s.ConsentList,
    errors: [{ status: 403, code: 'forbidden' }],
  }),
  children: def({
    name: 'listChildren',
    method: 'get',
    path: '/v1/me/children',
    summary: 'My children',
    tag: 'account',
    rules: ['MKT-ACC-05'],
    auth: 'user',
    response: s.ChildPage,
  }),
  addChild: def({
    name: 'addChild',
    method: 'post',
    path: '/v1/me/children',
    summary: 'Add a child (records the child_data_processing consent)',
    tag: 'account',
    rules: ['MKT-ACC-05', 'BR-DAT-03'],
    auth: 'user',
    idempotent: true,
    body: s.NewChildBody,
    response: s.Child,
    status: 201,
  }),
  myFeatures: def({
    name: 'getParentFeatures',
    method: 'get',
    path: '/v1/me/features',
    summary: 'Paid extras on for any centre where my children study',
    tag: 'features',
    rules: ['OD-58'],
    auth: 'user',
    response: s.CentreFeatures,
  }),
  featureFlags: def({
    name: 'getFeatureFlags',
    method: 'get',
    path: '/v1/feature-flags',
    summary: 'Feature flags for the caller: global, merged with their centre and teacher scopes',
    tag: 'features',
    rules: ['E0-09'],
    auth: 'public',
    response: s.FeatureFlags,
  }),

  // ── Reference data ───────────────────────────────────────────────────────────
  curricula: def({
    name: 'listCurricula',
    method: 'get',
    path: '/v1/curricula',
    summary: 'Curricula with their school years',
    tag: 'reference',
    rules: ['MKT-DSC-01'],
    auth: 'public',
    response: s.CurriculumList,
  }),
  subjects: def({
    name: 'listSubjects',
    method: 'get',
    path: '/v1/subjects',
    summary: 'Subjects, optionally for one curriculum and school year',
    tag: 'reference',
    rules: ['MKT-DSC-01'],
    auth: 'public',
    query: s.SubjectsQuery,
    response: s.SubjectList,
  }),

  // ── Centres ──────────────────────────────────────────────────────────────────
  centreApplication: def({
    name: 'applyCentre',
    method: 'post',
    path: '/v1/centre-applications',
    summary:
      'C01 join request. The centre and the owner role are created, verification pending, when this phone signs in',
    tag: 'centres',
    rules: ['MKT-CEN-01'],
    auth: 'public',
    idempotent: true,
    body: s.CentreApplicationBody,
    response: s.CentreApplicationResult,
    status: 201,
    errors: [
      { status: 422, code: 'consent_required' },
      { status: 422, code: 'invalid_phone' },
    ],
  }),
  staff: def({
    name: 'listStaff',
    method: 'get',
    path: '/v1/centres/{id}/staff',
    summary: 'Staff of this centre',
    tag: 'centres',
    rules: ['MKT-ACC-06'],
    auth: 'user',
    params: s.CentreParams,
    response: s.StaffList,
  }),
  inviteStaff: def({
    name: 'inviteStaff',
    method: 'post',
    path: '/v1/centres/{id}/staff',
    summary: 'Invite staff by phone, with permissions (owner only)',
    tag: 'centres',
    rules: ['MKT-ACC-06'],
    auth: 'user',
    idempotent: true,
    params: s.CentreParams,
    body: s.InviteStaffBody,
    response: s.StaffList,
    status: 201,
    errors: [
      { status: 403, code: 'forbidden' },
      { status: 422, code: 'invalid_phone' },
    ],
  }),
  centreFeatures: def({
    name: 'getCentreFeatures',
    method: 'get',
    path: '/v1/centres/{id}/features',
    summary: 'Paid extras for this centre',
    tag: 'features',
    rules: ['OD-58'],
    auth: 'user',
    params: s.CentreParams,
    response: s.CentreFeatures,
  }),
  teacherFeatures: def({
    name: 'getTeacherFeatures',
    method: 'get',
    path: '/v1/teachers/me/features',
    summary: 'Paid extras on for any centre the teacher works in',
    tag: 'features',
    rules: ['OD-58'],
    auth: 'user',
    response: s.CentreFeatures,
  }),
} satisfies Record<string, RouteDef>;

export type RouteName = keyof typeof routes;
export const allRoutes: RouteDef[] = Object.values(routes);
