import { z } from 'zod';
import { Money, Ok } from './market';
import type { RouteDef } from './routes';

/**
 * Ops console contract (07 §2 "Ops", MKT-OPS-01..04, -08, -09) and the person's own data requests
 * (MKT-OPS-09). Every `/v1/ops/*` route names the permission it needs (OD-37): `ops.verify`,
 * `ops.moderate`, `ops.finance`, or `any` for any `link_ops` user. The guard checks the caller's
 * address against OPS_IP_ALLOWLIST first, then the role and the permission.
 */
const named = <T extends z.ZodType>(id: string, s: T) => s.meta({ id });
const def = <T extends RouteDef>(r: T) => r;
const Uuid = z.uuid();
const Id = z.object({ id: Uuid });
const iso = z.string().describe('ISO 8601 timestamp');
const OPS = [
  { status: 403, code: 'ops_ip_not_allowed' },
  { status: 403, code: 'ops_permission_required' },
  { status: 503, code: 'ops_off' },
];

export const OpsPermission = named(
  'OpsPermission',
  z.enum(['ops.verify', 'ops.moderate', 'ops.finance']),
);
export const OpsMe = named(
  'OpsMe',
  z.object({
    id: z.string(),
    name: z.string().nullable(),
    permissions: z.array(OpsPermission),
  }),
);

export const OpsNote = named(
  'OpsNote',
  z.object({ id: z.string(), body: z.string(), authorName: z.string(), createdAt: iso }),
);
export const VerificationCheck = named(
  'VerificationCheck',
  z.object({
    code: z.enum([
      'owner_call',
      'address_pin_match',
      'site_visit_or_video',
      'owner_id',
      'owner_profile_approval',
      'ekyc_id',
      'degree',
      'reference',
    ]),
    status: z.enum(['pending', 'done', 'failed', 'waived']),
    doneByName: z.string().nullable(),
    doneAt: iso.nullable(),
    notes: z.string().nullable(),
  }),
);
export const CentreStage = named(
  'CentreStage',
  z.enum(['new', 'call_scheduled', 'visit_booked', 'live', 'rejected', 'revoked']),
);
export const CentreApplication = named(
  'CentreApplication',
  z.object({
    id: z.string(),
    name: z.string(),
    area: z.string().nullable(),
    governorate: z.string().nullable(),
    address: z.string().nullable(),
    ownerName: z.string().nullable(),
    ownerPhoneLast4: z.string().nullable(),
    stage: CentreStage,
    locationUnderReview: z.boolean(),
    halls: z.number().int(),
    createdAt: iso,
    /** BR-VER-02: ops call a new centre within 2 working days. */
    callDueAt: iso.nullable(),
    checks: z.array(VerificationCheck),
    /** MKT-OPS-01 AC2: "Approve" unlocks only when every check is done. */
    canApprove: z.boolean(),
    notes: z.array(OpsNote),
  }),
);
export const OpsLead = named(
  'OpsLead',
  z.object({
    id: z.string(),
    kind: z.enum(['centre', 'teacher']),
    name: z.string().nullable(),
    centreName: z.string().nullable(),
    area: z.string().nullable(),
    teacherCount: z.number().int().nullable(),
    status: z.enum(['new', 'contacted', 'converted', 'discarded']),
    createdAt: iso,
  }),
);
export const CentreApplications = named(
  'CentreApplications',
  z.object({ centres: z.array(CentreApplication), leads: z.array(OpsLead) }),
);

export const OpsTeacher = named(
  'OpsTeacher',
  z.object({
    id: z.string(),
    name: z.string(),
    phoneLast4: z.string().nullable(),
    verification: z.enum(['not_started', 'pending', 'verified', 'rejected', 'revoked']),
    subjects: z.array(z.string()),
    groups: z.number().int(),
    createdAt: iso,
    checks: z.array(VerificationCheck),
    notes: z.array(OpsNote),
  }),
);

export const ReviewQueueItem = named(
  'ReviewQueueItem',
  z.object({
    id: z.string(),
    stars: z.number().int(),
    body: z.string(),
    tags: z.array(z.string()),
    visibility: z.enum(['public', 'private']),
    status: z.enum(['pending_checks', 'published', 'held', 'needs_edit', 'hidden']),
    /** BR-REV-04 automatic checks that held it (e.g. `contact_details`). */
    flags: z.array(z.string()),
    targetType: z.enum(['centre', 'teacher']),
    targetName: z.string(),
    centreName: z.string(),
    reports: z.array(z.object({ reason: z.string(), createdAt: iso })),
    createdAt: iso,
    /** MKT-OPS-03 AC2: the 48-hour target, from when it entered the queue. */
    dueAt: iso,
  }),
);

export const OpsRefund = named(
  'OpsRefund',
  z.object({
    id: z.string(),
    status: z.enum(['requested', 'approved', 'processing', 'succeeded', 'failed', 'rejected']),
    policy: z.string(),
    autoEligible: z.boolean(),
    amount: Money,
    reason: z.string().nullable(),
    centreName: z.string().nullable(),
    teacherName: z.string().nullable(),
    enrolmentRef: z.string().nullable(),
    enrolmentStatus: z.string().nullable(),
    paid: Money,
    commission: Money,
    paidAt: iso.nullable(),
    firstSessionAt: iso.nullable(),
    requestedAt: iso,
    decidedAt: iso.nullable(),
  }),
);

export const AuditRow = named(
  'AuditRow',
  z.object({
    id: z.string(),
    occurredAt: iso,
    actorName: z.string().nullable(),
    actorType: z.string(),
    action: z.string(),
    objectType: z.string(),
    objectRef: z.string(),
    reason: z.string().nullable(),
  }),
);

export const DataRequestKind = named(
  'DataRequestKind',
  z.enum(['access', 'correction', 'deletion']),
);
export const DataRequest = named(
  'DataRequest',
  z.object({
    id: z.string(),
    kind: DataRequestKind,
    details: z.string(),
    status: z.enum(['open', 'completed', 'rejected']),
    outcome: z.string().nullable(),
    createdAt: iso,
    completedAt: iso.nullable(),
  }),
);
export const OpsDataRequest = named(
  'OpsDataRequest',
  DataRequest.extend({
    userName: z.string().nullable(),
    phoneLast4: z.string().nullable(),
    roles: z.array(z.string()),
    /** PDPL: a reply is due within 30 days of the request (OD-60 default; 10 §3). */
    dueAt: iso,
  }),
);

const Reason = z.object({ reason: z.string().trim().min(1).max(500) });
const OptionalReason = z.object({ reason: z.string().trim().max(500).optional() });
const ops = 'user' as const;

export const opsRoutes = {
  opsMe: def({
    name: 'getOpsMe',
    method: 'get',
    path: '/v1/ops/me',
    summary: 'The ops user and the permissions their bundles grant (OD-37)',
    tag: 'ops',
    rules: ['MKT-OPS-08'],
    auth: ops,
    ops: 'any',
    response: OpsMe,
    errors: OPS,
  }),
  centreApplications: def({
    name: 'listCentreApplications',
    method: 'get',
    path: '/v1/ops/centre-applications',
    summary: 'L01 pipeline: centres by stage, with checks and notes, plus new leads',
    tag: 'ops',
    rules: ['MKT-OPS-01', 'BR-VER-01', 'BR-VER-02'],
    auth: ops,
    ops: 'ops.verify',
    query: z.object({ stage: CentreStage.optional() }),
    response: CentreApplications,
    errors: OPS,
  }),
  putCheck: def({
    name: 'putVerificationCheck',
    method: 'put',
    path: '/v1/ops/verifications/{subjectType}/{subjectId}/checks/{checkCode}',
    summary: 'Record a verification check (who and when are kept)',
    tag: 'ops',
    rules: ['MKT-OPS-01', 'MKT-OPS-02', 'BR-VER-01'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: z.object({
      subjectType: z.enum(['centre', 'teacher']),
      subjectId: Uuid,
      checkCode: VerificationCheck.shape.code,
    }),
    body: z.object({
      status: VerificationCheck.shape.status,
      notes: z.string().trim().max(500).optional(),
    }),
    response: Ok,
    errors: [...OPS, { status: 404, code: 'not_found' }, { status: 422, code: 'check_not_for' }],
  }),
  centreStage: def({
    name: 'setCentreStage',
    method: 'post',
    path: '/v1/ops/centres/{id}/stage',
    summary: 'Move a join request: New, Call scheduled, Visit booked',
    tag: 'ops',
    rules: ['MKT-OPS-01'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    body: z.object({ stage: z.enum(['new', 'call_scheduled', 'visit_booked']) }),
    response: Ok,
    errors: [...OPS, { status: 404, code: 'not_found' }, { status: 409, code: 'already_decided' }],
  }),
  approveCentre: def({
    name: 'approveCentre',
    method: 'post',
    path: '/v1/ops/centres/{id}/approve',
    summary: 'Verify a centre (every check done): it goes live in search',
    tag: 'ops',
    rules: ['MKT-OPS-01', 'BR-VER-01'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    response: Ok,
    errors: [...OPS, { status: 409, code: 'checks_incomplete' }],
  }),
  rejectCentre: def({
    name: 'rejectCentre',
    method: 'post',
    path: '/v1/ops/centres/{id}/reject',
    summary: 'Reject a join request, with a reason',
    tag: 'ops',
    rules: ['MKT-OPS-01'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    body: Reason,
    response: Ok,
    errors: [...OPS, { status: 409, code: 'already_decided' }],
  }),
  revokeCentre: def({
    name: 'revokeCentre',
    method: 'post',
    path: '/v1/ops/centres/{id}/revoke',
    summary: 'Revoke a verified centre, with a reason (hides it; BR-VER-06)',
    tag: 'ops',
    rules: ['MKT-OPS-01', 'BR-VER-06'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    body: Reason,
    response: Ok,
    errors: [...OPS, { status: 409, code: 'not_verified' }],
  }),
  opsAddNote: def({
    name: 'addOpsNote',
    method: 'post',
    path: '/v1/ops/notes',
    summary: 'An internal note on a request (ops only, never shown outside the console)',
    tag: 'ops',
    rules: ['MKT-OPS-01'],
    auth: ops,
    ops: 'any',
    idempotent: true,
    body: z.object({
      subjectType: z.enum(['centre', 'teacher', 'lead', 'refund', 'review', 'data_request']),
      subjectId: Uuid,
      body: z.string().trim().min(1).max(2000),
    }),
    response: OpsNote,
    status: 201,
    errors: OPS,
  }),
  leadStatus: def({
    name: 'setLeadStatus',
    method: 'post',
    path: '/v1/ops/leads/{id}/status',
    summary: 'A landing-page lead: contacted or discarded',
    tag: 'ops',
    rules: ['MKT-OPS-01', 'MKT-WEB-01'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    body: z.object({ status: z.enum(['contacted', 'discarded']) }),
    response: Ok,
    errors: [...OPS, { status: 404, code: 'not_found' }],
  }),
  opsTeachers: def({
    name: 'listOpsTeachers',
    method: 'get',
    path: '/v1/ops/teachers',
    summary: 'Teacher verification queue (manual ID review until the eKYC adapter, OD-19)',
    tag: 'ops',
    rules: ['MKT-OPS-02', 'BR-VER-03'],
    auth: ops,
    ops: 'ops.verify',
    query: z.object({
      verification: z.enum(['pending', 'verified', 'rejected', 'revoked', 'all']).optional(),
    }),
    response: z.array(OpsTeacher),
    errors: OPS,
  }),
  verifyTeacher: def({
    name: 'verifyTeacher',
    method: 'post',
    path: '/v1/ops/teachers/{id}/verify',
    summary: 'Verify a teacher’s ID (records the ekyc_id check)',
    tag: 'ops',
    rules: ['MKT-OPS-02', 'BR-VER-03'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    body: OptionalReason,
    response: Ok,
    errors: [...OPS, { status: 409, code: 'already_decided' }],
  }),
  rejectTeacher: def({
    name: 'rejectTeacher',
    method: 'post',
    path: '/v1/ops/teachers/{id}/reject',
    summary: 'Reject a teacher’s ID, with a reason',
    tag: 'ops',
    rules: ['MKT-OPS-02'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    body: Reason,
    response: Ok,
    errors: [...OPS, { status: 409, code: 'already_decided' }],
  }),
  revokeTeacher: def({
    name: 'revokeTeacher',
    method: 'post',
    path: '/v1/ops/teachers/{id}/revoke',
    summary: 'Revoke a verified teacher, with a reason (BR-VER-06)',
    tag: 'ops',
    rules: ['MKT-OPS-02', 'BR-VER-06'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    body: Reason,
    response: Ok,
    errors: [...OPS, { status: 409, code: 'not_verified' }],
  }),
  reviewQueue: def({
    name: 'getReviewQueue',
    method: 'get',
    path: '/v1/ops/reviews/queue',
    summary: 'L02: held and reported reviews, with their flags and the 48-hour target',
    tag: 'ops',
    rules: ['MKT-OPS-03', 'BR-REV-04', 'BR-REV-05'],
    auth: ops,
    ops: 'ops.moderate',
    response: z.array(ReviewQueueItem),
    errors: OPS,
  }),
  reviewDecision: def({
    name: 'decideReview',
    method: 'post',
    path: '/v1/ops/reviews/{id}/decision',
    summary: 'Publish as is, hide, or ask the parent to edit and resubmit (BR-REV-05)',
    tag: 'ops',
    rules: ['MKT-OPS-03', 'BR-REV-05'],
    auth: ops,
    ops: 'ops.moderate',
    idempotent: true,
    params: Id,
    body: z.object({
      decision: z.enum(['publish', 'hide', 'request_edit']),
      note: z.string().trim().max(500).optional(),
    }),
    response: Ok,
    errors: [...OPS, { status: 404, code: 'not_found' }, { status: 422, code: 'reason_required' }],
  }),
  opsRefunds: def({
    name: 'listOpsRefunds',
    method: 'get',
    path: '/v1/ops/refunds',
    summary: 'L03: refund requests with the payment, the policy and the commission',
    tag: 'ops',
    rules: ['MKT-OPS-04', 'BR-REF-07', 'OD-42'],
    auth: ops,
    ops: 'ops.finance',
    query: z.object({
      status: z
        .enum(['requested', 'approved', 'processing', 'succeeded', 'failed', 'rejected', 'all'])
        .optional(),
    }),
    response: z.array(OpsRefund),
    errors: OPS,
  }),
  approveRefund: def({
    name: 'approveRefund',
    method: 'post',
    path: '/v1/ops/refunds/{id}/approve',
    summary: 'Approve a refund: the reversing entries (P7/P8) post and the provider sends it',
    tag: 'ops',
    rules: ['MKT-OPS-04', 'BR-REF-07', 'OD-42'],
    auth: ops,
    ops: 'ops.finance',
    idempotent: true,
    money: true,
    params: Id,
    response: Ok,
    errors: [
      ...OPS,
      { status: 409, code: 'already_decided' },
      { status: 409, code: 'nothing_to_refund' },
    ],
  }),
  rejectRefund: def({
    name: 'rejectRefund',
    method: 'post',
    path: '/v1/ops/refunds/{id}/reject',
    summary: 'Deny a refund request, with a reason the parent sees as "not approved"',
    tag: 'ops',
    rules: ['MKT-OPS-04', 'BR-REF-07'],
    auth: ops,
    ops: 'ops.finance',
    idempotent: true,
    money: true,
    params: Id,
    body: Reason,
    response: Ok,
    errors: [...OPS, { status: 409, code: 'already_decided' }],
  }),
  opsAudit: def({
    name: 'getOpsAudit',
    method: 'get',
    path: '/v1/ops/audit',
    summary: 'Audit lookup for one object (newest first, at most 100)',
    tag: 'ops',
    rules: ['MKT-OPS-08'],
    auth: ops,
    ops: 'any',
    query: z.object({
      objectType: z.string().min(1).max(40),
      objectRef: z.string().min(1).max(80),
    }),
    response: z.array(AuditRow),
    errors: OPS,
  }),
  opsDataRequests: def({
    name: 'listOpsDataRequests',
    method: 'get',
    path: '/v1/ops/data-requests',
    summary: 'PDPL requests (access, correction, deletion) with their age against the limit',
    tag: 'ops',
    rules: ['MKT-OPS-09'],
    auth: ops,
    ops: 'ops.verify',
    query: z.object({ status: z.enum(['open', 'completed', 'rejected', 'all']).optional() }),
    response: z.array(OpsDataRequest),
    errors: OPS,
  }),
  completeDataRequest: def({
    name: 'completeDataRequest',
    method: 'post',
    path: '/v1/ops/data-requests/{id}/complete',
    summary: 'Close a request with what was exported, corrected or anonymised (or why not)',
    tag: 'ops',
    rules: ['MKT-OPS-09'],
    auth: ops,
    ops: 'ops.verify',
    idempotent: true,
    params: Id,
    body: z.object({
      result: z.enum(['completed', 'rejected']),
      outcome: z.string().trim().min(1).max(2000),
    }),
    response: Ok,
    errors: [...OPS, { status: 409, code: 'already_decided' }],
  }),

  // ── The person's own requests (any signed-in user; 07 §2a) ────────────────────
  myDataRequests: def({
    name: 'listMyDataRequests',
    method: 'get',
    path: '/v1/me/data-requests',
    summary: 'My data requests and their status',
    tag: 'account',
    rules: ['MKT-OPS-09'],
    auth: 'user',
    response: z.array(DataRequest),
  }),
  createDataRequest: def({
    name: 'createDataRequest',
    method: 'post',
    path: '/v1/me/data-requests',
    summary: 'Ask Link for a copy of my data, a correction, or deletion (PDPL)',
    tag: 'account',
    rules: ['MKT-OPS-09', 'BR-DAT'],
    auth: 'user',
    idempotent: true,
    body: z.object({ kind: DataRequestKind, details: z.string().trim().max(2000).default('') }),
    response: DataRequest,
    status: 201,
    errors: [{ status: 409, code: 'already_open' }],
  }),
} satisfies Record<string, RouteDef>;
