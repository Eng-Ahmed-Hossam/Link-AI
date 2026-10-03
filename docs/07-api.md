# 07 · API

core-api exposes REST over HTTPS, described in **OpenAPI 3.1**. The OpenAPI document is the contract. `packages/api-client` is generated from it, and CI fails if the code and the document drift apart.

## 1. Conventions

### Versioning
- The major version is in the path: `/v1/...`.
- Within a version, only add things: new endpoints, new optional fields, new enum values that clients must tolerate.
- A breaking change needs `/v2` for the affected resources. A deprecated endpoint returns `Deprecation` and `Sunset` headers for at least 90 days.

### Format
| Item | Rule |
|---|---|
| Paths | Kebab-case, plural nouns: `/v1/room-requests/{id}` |
| JSON fields | `camelCase` (the database uses `snake_case`) |
| IDs | UUID strings |
| Money | `{ "amountPt": 55000, "currency": "EGP" }` — integer piasters, never floats |
| Rates | Decimal strings: `"5.00"` |
| Timestamps | ISO 8601 in UTC: `2026-10-03T14:05:00Z` |
| Dates | `YYYY-MM-DD`, in Africa/Cairo for schedules |
| Language | `Accept-Language: ar` or `en`. The default is the user's saved language. Error messages and labels are localised. |
| Caching | `ETag` on GET. `If-None-Match` → `304`. |

### Authentication
| Caller | Mechanism |
|---|---|
| Apps and web | `Authorization: Bearer <JWT>`. Access token 15 min; refresh token 30 days, rotated on use. Claims: `sub`, `roles`, `centreIds`, `teacherId`, `guardianId`, `lang`. |
| Ops console | SSO (OIDC) behind an IP allow-list. Ops tokens carry `link_ops` and fine-grained permissions (`ops.verify`, `ops.moderate`, `ops.finance`). |
| ai-service → core-api | Service token (mTLS / workload identity) **plus** an on-behalf-of user context. ai-service acts as the teacher with the teacher's permissions. |
| Provider webhooks | No JWT. The adapter verifies the provider's signature (HMAC / signed payload) before anything else. |

Every request sets the RLS context from the token. See [10-security-privacy.md](10-security-privacy.md) §2.

### Idempotency
- **Required** on every `POST` and `PATCH` that creates, changes state or touches money: `Idempotency-Key: <uuid>`.
- The first response is stored for 24 h (`idem:{key}`; money endpoints also keep a durable copy in `platform.idempotency_keys`).
- Same key + same body → the stored response is returned, with `Idempotent-Replayed: true`.
- Same key + different body → `422` with `code: idempotency_key_reused`.
- Webhooks are deduplicated on the provider's event ID (`ledger.provider_events`).

### Pagination
- Cursor-based: `?limit=20&cursor=<opaque>`. The default limit is 20 and the maximum is 100.
- Response: `{ "data": [...], "nextCursor": "…" | null }`.
- Sorting uses `?sort=field` or `?sort=-field`, on fields each endpoint documents.

### Errors
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details, `Content-Type: application/problem+json`:

```json
{
  "type": "https://docs.link.eg/errors/seat-unavailable",
  "title": "No seat left in this group",
  "status": 409,
  "code": "seat_unavailable",
  "detail": "The group is full. You can join the waitlist.",
  "requestId": "req_01J…",
  "errors": [{ "field": "groupId", "code": "full" }]
}
```

| Status | Use |
|---|---|
| 400 | Malformed request |
| 401 | Missing or invalid token |
| 403 | Authenticated but not allowed (permission or RLS) |
| 404 | Not found — **also** used when a row exists but RLS hides it, so nothing leaks |
| 409 | State conflict (seat taken, slot overlap, wrong status) |
| 422 | Validation failed (score above max, bad rate, reused idempotency key) |
| 429 | Rate limited. `Retry-After` is set. |
| 502 / 503 / 504 | Provider or dependency failure. Safe to retry with the same idempotency key. |

`code` values are stable and documented. Clients switch on `code`, never on `title`.

### Rate limits (starting values)
| Bucket | Limit |
|---|---|
| OTP request per phone | 3 / 10 min, 10 / day |
| OTP request per IP | 20 / hour |
| OTP verify per phone | 5 tries per code |
| Authenticated user | 120 requests / min |
| Public search per IP | 60 requests / min |

### Real-time
- Assistant replies (Phase 2) stream over **SSE**: `GET /v1/assistant/threads/{id}/stream`.
- Everything else is request/response plus push notifications.

---

## 2. Phase 1 endpoints

"Who" uses role names from [10-security-privacy.md](10-security-privacy.md).

**Idem** — every state-changing row says one of: **✓** = `Idempotency-Key` required · **— read** = GET, nothing changes · **rate-limited** = not replayable by design (OTP) · **event ID** = webhook, deduplicated on the provider's event ID.

**Money** — every row that moves or shows money says whose money it is: **teacher**, **centre**, **parent → teacher** (fees), **teacher → centre** (rent), or **Link**. "—" = no money.

### Auth and account
| Method | Path | Who | Purpose | Idem | Req |
|---|---|---|---|---|---|
| POST | `/v1/auth/otp/request` | public | Send a 6-digit SMS code | rate-limited | MKT-ACC-01 |
| POST | `/v1/auth/otp/verify` | public | Verify the code; returns tokens | rate-limited | MKT-ACC-01 |
| POST | `/v1/auth/refresh` | any | Rotate the refresh token | ✓ | MKT-ACC-04 |
| POST | `/v1/auth/logout` | any | Revoke the refresh token | ✓ | MKT-ACC-04 |
| GET | `/v1/me` | any | Profile, roles, language | — read | MKT-ACC-03 |
| PATCH | `/v1/me` | any | Name, language | ✓ | MKT-ACC-03 |
| POST | `/v1/me/roles` | any | Add the role `parent`, `teacher` or `centre_owner` | ✓ | MKT-ACC-02 |
| POST | `/v1/me/devices` | any | Register a push token (platform, app) | ✓ | MKT-NTF-02 |
| DELETE | `/v1/me/devices/{id}` | any | Remove a push token | ✓ | MKT-NTF-02 |
| GET | `/v1/me/children` | parent | List children | — read | MKT-ACC-05 |
| POST | `/v1/me/children` | parent | Add a child (records `child_data_processing` consent) | ✓ | MKT-ACC-05 |
| PATCH / DELETE | `/v1/children/{id}` | parent | Edit / archive a child | ✓ | MKT-ACC-05 |
| GET | `/v1/me/consents` | any | Current consents (by `user_id`; never cached) | — read | BR-DAT-03 |
| PUT | `/v1/me/consents` | any | Grant or withdraw a consent | ✓ | BR-DAT-03 |
| POST | `/v1/me/data-requests` | any | PDPL access / correction / deletion request | ✓ | MKT-OPS-09 |

### Reference data
| Method | Path | Who | Purpose | Idem |
|---|---|---|---|---|
| GET | `/v1/curricula` | public | Curricula with school years | — read |
| GET | `/v1/subjects?curriculumId&schoolYearId` | public | Subjects | — read |
| GET | `/v1/academic-terms` | public | Terms | — read |

### Leads and centres
| Method | Path | Who | Purpose | Idem | Req |
|---|---|---|---|---|---|
| POST | `/v1/leads` | public | Landing-page "Get started" form → `org.leads` (rate-limited, bot-filtered at the WAF) | ✓ | MKT-WEB-01 |
| POST | `/v1/centre-applications` | centre_owner | Join request (C01) | ✓ | MKT-CEN-01 |
| GET | `/v1/centres/{id}` · `/v1/centres/by-slug/{slug}` | public | Public profile | — read | MKT-DSC-04 |
| PATCH | `/v1/centres/{id}` | centre_owner | Edit profile | ✓ | MKT-CEN-02 |
| POST | `/v1/centres/{id}/photos/upload-url` | centre_owner | Signed upload URL | ✓ | MKT-CEN-02 |
| GET | `/v1/centres/{id}/rooms` | owner, staff | List halls | — read | MKT-CEN-03 |
| POST | `/v1/centres/{id}/rooms` | centre_owner | Add a hall | ✓ | MKT-CEN-03 |
| PATCH | `/v1/rooms/{id}` | centre_owner | Edit hall, rent rule, listed | ✓ | MKT-CEN-03 |
| PUT | `/v1/rooms/{id}/open-slots` | centre_owner | Replace the weekly open slots | ✓ | MKT-CEN-03 |
| GET | `/v1/centres/{id}/schedule?week=2026-W40` | owner, staff | Hall schedule (C03) | — read | MKT-CEN-04 |
| PUT | `/v1/centres/{id}/settings/auto-approve` | centre_owner | Auto-approve rules | ✓ | MKT-HAL-05 |
| GET | `/v1/centres/{id}/staff` | centre_owner | List staff | — read | MKT-ACC-06 |
| POST | `/v1/centres/{id}/staff` | centre_owner | Invite staff by phone, with permissions | ✓ | MKT-ACC-06 |
| PATCH | `/v1/centres/{id}/staff/{userId}` | centre_owner | Change a staff member's permissions | ✓ | MKT-ACC-06 |
| DELETE | `/v1/centres/{id}/staff/{userId}` | centre_owner | Remove staff | ✓ | MKT-ACC-06 |

### Teachers
| Method | Path | Who | Purpose | Idem | Req |
|---|---|---|---|---|---|
| GET | `/v1/teachers/{id}` · `/v1/teachers/by-slug/{slug}` | public | Public profile | — read | MKT-DSC-05 |
| GET | `/v1/teachers/me` | teacher | Own profile | — read | MKT-TCH-01 |
| PATCH | `/v1/teachers/me` | teacher | Profile, subjects, availability, settings | ✓ | MKT-TCH-01 |
| POST | `/v1/teachers/me/verification` | teacher | Start eKYC; returns the provider session | ✓ | MKT-TCH-02 |
| POST | `/v1/teachers/me/documents/upload-url` | teacher | Degree / reference upload | ✓ | MKT-TCH-02 |

### Hall booking
| Method | Path | Who | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| GET | `/v1/rooms/search?lat&lng&radiusKm&minCapacity&weekday&from&to&maxRentPt&facilities` | teacher | Find halls (J01) | — read | — | MKT-HAL-01 |
| POST | `/v1/rooms/{id}/rent-estimate` | teacher | Estimate from slots, students and fee (J02); pure calculation | — read (no write) | teacher → centre (estimate) | BR-BKG-07 |
| POST | `/v1/room-requests` | teacher | Request slot(s) | ✓ | — | MKT-HAL-02 |
| GET | `/v1/room-requests?scope=mine` | teacher | My requests (J03) | — read | — | MKT-HAL-03 |
| GET | `/v1/room-requests?centreId&stage` | owner, staff | Pipeline (C06) | — read | — | MKT-HAL-04 |
| POST | `/v1/room-requests/{id}/stage` | owner, staff | Move to `phone_call` / `meeting`, with an optional time | ✓ | — | MKT-HAL-04 |
| POST | `/v1/room-requests/{id}/approve` | owner, staff | Approve → creates the booking | ✓ | — | MKT-HAL-04 |
| POST | `/v1/room-requests/{id}/decline` | owner, staff | Decline with a reason | ✓ | — | MKT-HAL-04 |
| POST | `/v1/room-requests/{id}/withdraw` | teacher | Withdraw | ✓ | — | MKT-HAL-03 |
| GET | `/v1/room-bookings/{id}` | teacher, owner, staff | Booking detail | — read | — | MKT-HAL-04 |
| POST | `/v1/room-bookings/{id}/end` | teacher, centre_owner | End at the period end | ✓ | — | MKT-HAL-06 |

### Groups and sessions
| Method | Path | Who | Purpose | Idem | Req |
|---|---|---|---|---|---|
| POST | `/v1/groups` | teacher | Create a group | ✓ | MKT-GRP-01 |
| GET | `/v1/groups/{id}` | public | Public group view, with seats left per upcoming session | — read | MKT-ENR-01 |
| PATCH | `/v1/groups/{id}` | teacher | Edit fees, seats, status | ✓ | MKT-GRP-02 |
| POST | `/v1/groups/{id}/close` | teacher | Close | ✓ | MKT-GRP-04 |
| GET | `/v1/teachers/me/groups` | teacher | My groups (J05) | — read | MKT-GRP-01 |
| GET | `/v1/groups/{id}/sessions?from&to` | teacher, owner, enrolled parent | Calendar, with status and seats used per session | — read | MKT-GRP-03 |
| POST | `/v1/sessions/{id}/cancel` | teacher | Cancel one session in advance | ✓ | MKT-GRP-03 |
| POST | `/v1/sessions/{id}/not-held` | teacher, owner, staff (`bookings.manage`) | Mark a held session "did not take place", with a reason; only before its rent invoice (OD-44) | ✓ | MKT-GRP-03 |

### Discovery
| Method | Path | Who | Purpose | Idem | Req |
|---|---|---|---|---|---|
| GET | `/v1/search/groups?curriculumId&schoolYearId&subjectId&lat&lng&radiusKm&minRating&maxFeePt&seatsOpen&verifiedOnly&sort` | public | Groups for a child | — read | MKT-DSC-01, MKT-DSC-02 |
| GET | `/v1/search/centres?…` | public | Centres (list and map) | — read | MKT-DSC-02, MKT-DSC-03 |
| GET | `/v1/search/teachers?…` | public | Teachers | — read | MKT-DSC-01 |
| GET | `/v1/map/centres?bbox=minLng,minLat,maxLng,maxLat&…` | public | Map pins with counts | — read | MKT-DSC-03 |
| GET | `/v1/centres/{id}/reviews` · `/v1/teachers/{id}/reviews` | public | Published public reviews | — read | MKT-DSC-04, MKT-DSC-05 |

### Enrolment and payment
| Method | Path | Who | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| POST | `/v1/enrolments` | parent | Hold a seat in every covered session: `{groupId, studentId, paymentPlan, firstSessionId \| sessionId, sharePhone}` → `201` with `holdExpiresAt` and `sessionIds[]`, or `409 seat_unavailable` naming the full session | ✓ | — | MKT-ENR-02 |
| POST | `/v1/enrolments/{id}/checkout` | parent | `{method}` → `{checkoutUrl}` or `{fawryReference, expiresAt}`. Can be called again after a failed attempt while the hold is live (new payment, new Idempotency-Key) | ✓ | parent → teacher | MKT-ENR-03, MKT-ENR-04, MKT-ENR-05, MKT-ENR-12 |
| GET | `/v1/enrolments/{id}` | parent, teacher, owner | Status: one of the 8 states in [08](08-payments-ledger.md) §4 (never cached) | — read | — | MKT-ENR-06 |
| GET | `/v1/me/enrolments` | parent | My children's enrolments (P09) | — read | — | MKT-ENR-07 |
| POST | `/v1/enrolments/{id}/cancel` | parent | Cancel → `cancelled` (the only way to reach it), seat released. While `pending_payment`: nothing to refund. Before the first session: refund request (auto-eligible) created | ✓ | parent → teacher (refund) | MKT-ENR-08 |
| POST | `/v1/enrolments/{id}/plan/cancel` | parent | Stop the next renewal | ✓ | parent → teacher | BR-PMT-05 |
| POST | `/v1/enrolments/{id}/refund-requests` | parent | Dispute after the first session | ✓ | parent → teacher (refund) | BR-REF-03 |
| GET | `/v1/teachers/me/enrolments?status` | teacher | New enrolments (J06) | — read | — | MKT-ENR-10 |
| POST | `/v1/enrolments/{id}/accept` · `/decline` | teacher | Only when `reviewEachEnrolment` is on; decline → automatic refund | ✓ | parent → teacher (refund on decline) | MKT-ENR-10 |
| POST | `/v1/groups/{id}/waitlist` | parent | Join the waitlist | ✓ | — | MKT-ENR-09 |
| POST | `/v1/waitlist/{id}/accept` | parent | Accept a live offer: `{paymentPlan, method}` → turns the offer into a seat hold and returns the checkout (as `/checkout`) | ✓ | parent → teacher | MKT-ENR-09 |
| DELETE | `/v1/waitlist/{id}` | parent | Leave the waitlist | ✓ | — | MKT-ENR-09 |
| GET | `/v1/payments/{id}` | payer, payee | Receipt (never cached) | — read | parent → teacher | MKT-ENR-06 |

### Webhooks (provider → Link)
| Method | Path | Verified by | Effect | Idem | Money |
|---|---|---|---|---|---|
| POST | `/v1/webhooks/payments/{provider}` | Provider signature | Dedupe → update payment → post ledger → emit `payment.*` | event ID | parent → teacher; teacher → centre (top-ups) |
| POST | `/v1/webhooks/payouts/{provider}` | Provider signature | Payout status → P6 settled / failed | event ID | teacher; centre |
| POST | `/v1/webhooks/ekyc/{provider}` | Provider signature | Verification result | event ID | — |
| POST | `/v1/webhooks/messaging/{channel}` | Provider signature (messaging-gateway) | Delivery status, inbound replies (Phase 2) | event ID | — |

Webhooks return `200` quickly after storing the event. Processing happens in the same transaction or right after; it never depends on the provider retrying.

### Teacher money (teacher-only endpoints)
The money endpoints in this table are for teachers only — including the four under `/v1/me/` (payout account, balance, payouts, statements). Other `/v1/me/*` endpoints (profile, devices, children, consents, data requests) are open to any signed-in user. Centre money is in the next table.

| Method | Path | Who | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| GET | `/v1/me/payout-account` | teacher | Payout account (masked) | — read | teacher | MKT-TCH-03 |
| PUT | `/v1/me/payout-account` | teacher | Replace the payout account (re-verified) | ✓ | teacher | MKT-TCH-03 |
| GET | `/v1/me/balance` | teacher | Pending, available, rent reserve, next payout (live, never cached) | — read | teacher | BR-OUT-01 |
| GET | `/v1/me/payouts` | teacher | Payout history | — read | teacher | MKT-LED-05 |
| GET | `/v1/me/statements.csv?month` | teacher | CSV export | — read | teacher | MKT-LED-07 |
| GET | `/v1/teachers/me/earnings?month=2026-10` | teacher | J07 statement | — read | teacher | MKT-LED-07 |
| GET | `/v1/rent-invoices?bookingId\|teacherId` · `/v1/rent-invoices/{id}` | teacher (payer), centre_owner (payee) | Invoices | — read | teacher → centre | MKT-LED-03 |
| POST | `/v1/rent-invoices/{id}/checkout` | teacher | Pay a shortfall | ✓ | teacher → centre | MKT-LED-04 |

### Centre money (`/v1/centres/{id}/*`, owner of that centre only)
One owner can own several centres; each centre has its own payout account, balance and payouts.

| Method | Path | Who | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| GET | `/v1/centres/{id}/payout-account` | centre_owner | Payout account (masked) | — read | centre | MKT-CEN-05 |
| PUT | `/v1/centres/{id}/payout-account` | centre_owner | Replace the payout account (re-verified) | ✓ | centre | MKT-CEN-05 |
| GET | `/v1/centres/{id}/balance` | centre_owner | Available, next payout (live, never cached) | — read | centre | MKT-LED-08 |
| GET | `/v1/centres/{id}/payouts` | centre_owner | Payout history | — read | centre | MKT-LED-08 |
| GET | `/v1/centres/{id}/statements.csv?month` | centre_owner | CSV export | — read | centre | MKT-LED-08 |
| GET | `/v1/centres/{id}/rent-income?month=2026-10` | centre_owner | C07 statement | — read | teacher → centre | MKT-LED-08 |
| GET | `/v1/rent-invoices?centreId` | centre_owner | Invoices for this centre | — read | teacher → centre | MKT-LED-08 |
| GET | `/v1/payouts/{id}` | payee (teacher or centre_owner) | Payout detail | — read | teacher or centre (the payee) | MKT-LED-05 |

### Reviews
| Method | Path | Who | Purpose | Idem | Req |
|---|---|---|---|---|---|
| POST | `/v1/reviews` | parent (verified) | Create a review or private feedback | ✓ | MKT-REV-01 |
| PATCH | `/v1/reviews/{id}` | author | Edit and resubmit (when `needs_edit`) | ✓ | BR-REV-05 |
| GET | `/v1/me/reviews-received?visibility&status` | teacher, owner, staff | C04 tabs | — read | MKT-REV-03 |
| POST | `/v1/reviews/{id}/reply` | target | Public reply | ✓ | MKT-REV-03 |
| POST | `/v1/reviews/{id}/report` | target | Report | ✓ | MKT-REV-03 |

### Ops (`/v1/ops/*`, ops console only; role `link_ops` + permission)
| Method | Path | Permission | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| GET | `/v1/ops/centre-applications?stage` | ops.verify | L01 pipeline (includes new leads) | — read | — | MKT-OPS-01 |
| PUT | `/v1/ops/verifications/{subjectType}/{subjectId}/checks/{checkCode}` | ops.verify | Record a check | ✓ | — | MKT-OPS-01, MKT-OPS-02 |
| POST | `/v1/ops/centres/{id}/approve` · `/reject` · `/revoke` | ops.verify | Decide | ✓ | — | MKT-OPS-01 |
| GET | `/v1/ops/teachers?verification=pending` | ops.verify | Queue | — read | — | MKT-OPS-02 |
| POST | `/v1/ops/teachers/{id}/verify` · `/reject` · `/revoke` | ops.verify | Decide | ✓ | — | MKT-OPS-02 |
| GET | `/v1/ops/reviews/queue` | ops.moderate | L02 queue | — read | — | MKT-OPS-03 |
| POST | `/v1/ops/reviews/{id}/decision` | ops.moderate | `publish` \| `hide` \| `request_edit` | ✓ | — | MKT-OPS-03 |
| GET | `/v1/ops/refunds?status` · `/v1/ops/disputes?status` | ops.finance | L03 queue | — read | parent → teacher | MKT-OPS-04 |
| POST | `/v1/ops/refunds/{id}/approve` · `/reject` | ops.finance | Decide | ✓ | parent → teacher | MKT-OPS-04 |
| POST | `/v1/ops/disputes/{id}/resolve` | ops.finance | Resolve with an outcome | ✓ | parent → teacher | MKT-OPS-04 |
| GET | `/v1/ops/reconciliation/issues?status` | ops.finance | Mismatches, orphans | — read | Link | MKT-OPS-05 |
| POST | `/v1/ops/reconciliation/issues/{id}/resolve` | ops.finance | Match, refund or close | ✓ | Link | MKT-OPS-05 |
| GET | `/v1/ops/commission-rules` | ops.finance | List rules | — read | Link | MKT-OPS-06 |
| POST | `/v1/ops/commission-rules` | ops.finance | Add a rule (overlaps rejected) | ✓ | Link | MKT-OPS-06 |
| PUT | `/v1/ops/reference/{curricula\|school-years\|subjects\|academic-terms}/{id}` | ops.verify | Edit reference data | ✓ | — | MKT-OPS-07 |
| GET | `/v1/ops/audit?objectType&objectRef` | any ops | Audit lookup | — read | — | MKT-OPS-08 |
| GET | `/v1/ops/data-requests?status` | ops.verify | PDPL requests queue | — read | — | MKT-OPS-09 |
| POST | `/v1/ops/data-requests/{id}/complete` | ops.verify | Mark done, with what was exported, corrected or anonymised | ✓ | — | MKT-OPS-09 |
| POST | `/v1/ops/ledger/adjustments` | ops.finance | Post a balanced adjustment (P11); `reason` required | ✓ | teacher, centre or Link (the accounts posted) | MKT-OPS-10 |
| GET | `/v1/ops/payouts?status` | ops.finance | Payout runs and failures | — read | teacher; centre | MKT-OPS-11 |
| POST | `/v1/ops/payouts/{id}/retry` | ops.finance | Retry a failed payout (same payout, new attempt) | ✓ | teacher or centre (the payee) | MKT-OPS-11 |

Every ops call is audited, including reads of personal data.

---

---

## 2a. Proposed — from frontend Batch 1

**Status: proposed, not agreed.** The parent PWA (P01–P10) is built on mocks that need these shapes. Nothing here is in OpenAPI yet; the draft TypeScript types in `packages/api-client/src/types.ts` match this section exactly and carry `PLACEHOLDER (<screen>)` comments. The backend team accepts, changes or rejects each row before E1/E7 starts; then OpenAPI is written and the draft types are replaced by generated ones.

### P-1. `PATCH /v1/me` (MKT-ACC-03)
Request (every field optional; at least one):
```json
{ "name": "Hassan Mahmoud", "language": "ar" }
```
Response `200`: the `Me` object.
```json
{ "id": "usr_…", "name": "Hassan Mahmoud", "language": "ar", "roles": ["parent"] }
```
Errors: `422 validation_failed` (name empty or over 80 characters; language not `ar`/`en`).

### P-2. `PUT /v1/me/consents` (BR-DAT-03)
One consent per call. Appends a `consent_events` row with `source: "settings"` (or the source named by the screen); never cached.
```json
{ "kind": "whatsapp_updates", "granted": true, "version": "wa-2026-10", "studentId": "stu_…" }
```
`kind` is one of the `consent_events.kind` values in [06](06-data-model.md). `studentId` is optional context. `version` is the text version the person saw.
Response `200`: the current state of every consent for this person.
```json
{ "data": [ { "kind": "whatsapp_updates", "studentId": "stu_…", "granted": true, "version": "wa-2026-10", "at": "2026-10-03T09:12:00Z" } ] }
```
`GET /v1/me/consents` returns the same shape. Errors: `422 validation_failed`; `403 forbidden` for a `studentId` the caller is not a guardian of.

### P-3. Groups for one child on a centre profile (P04, MKT-DSC-04)
`GET /v1/centres/by-slug/{slug}?schoolYearId&subjectId` (and `/v1/centres/{id}?…`) adds `groupsForChild` when either filter is given: the published groups at this centre that match the child's school year and the searched subject, newest session first.
```json
{ "id": "ctr_…", "slug": "al-nour", "…": "…", "groupsForChild": [ { "…": "GroupSummary, as GET /v1/groups/{id}" } ] }
```
Without filters, `groupsForChild` is `[]`. Alternative the backend may prefer: `GET /v1/centres/{id}/groups?schoolYearId&subjectId` returning `Page<GroupSummary>`.

### P-4. `schoolYear.shortName` (P02 chips)
Every `SchoolYearRef` (in `/v1/curricula`, children, groups, enrolments) gains `shortName` for chips and cards, localised per `Accept-Language`.
```json
{ "id": "sy_…", "code": "nat-sec-2", "name": "Secondary 2", "shortName": "Sec 2" }
```
Needs a `short_name_ar` / `short_name_en` pair on `school_years` ([06](06-data-model.md)).

### P-5. Search totals (P03, MKT-DSC-02 AC3)
`GET /v1/search/centres` adds `totals` to the page: counts over the **whole** result set (not the page), for "12 centres • 31 Maths teachers within 5 km".
```json
{ "data": [ "…CentreCard" ], "nextCursor": "…", "totals": { "centres": 12, "teachers": 31 } }
```

### P-6. Rating distribution (P04)
Centre and teacher profiles add `ratingDistribution`: published public reviews per star, all five stars always present, from `review_stats`.
```json
{ "rating": { "avg": "4.7", "count": 128 }, "ratingDistribution": [ { "stars": 5, "count": 101 }, { "stars": 4, "count": 20 }, { "stars": 3, "count": 5 }, { "stars": 2, "count": 1 }, { "stars": 1, "count": 1 } ] }
```

### P-7. Enrolment fields the parent screens need (P07–P10)
`GET /v1/enrolments/{id}` and `GET /v1/me/enrolments` add:

| Field | Type | Meaning | Rule |
|---|---|---|---|
| `teacherReviewsEnrolments` | boolean | The teacher's `settings.reviewEachEnrolment` (OD-08) at reservation time, so P08 shows the "teacher confirms" step | MKT-ENR-10 |
| `lastPaymentFailed` | boolean | The latest payment attempt failed while the hold is still live; P08 offers "Try again" with a new Idempotency-Key | BR-ENR-05 |
| `firstSessionStarted` | boolean | `now ≥ starts_at` of the first covered session | BR-REV-01 |
| `canReview` | boolean | Verified parent, first session started, and no review for this target this term | BR-REV-01, BR-REV-02 |
| `holdExpiresAt` | timestamp \| null | Set only while `pending_payment` | BR-ENR-01 |
| `fawry` | `{reference, expiresAt}` \| null | The open Fawry reference, if the method is Fawry | MKT-ENR-04 |
| `refund` | `Refund` \| null | The latest refund, shown apart from the status | MKT-ENR-08 |

```json
{ "id": "enr_…", "status": "pending_payment", "teacherReviewsEnrolments": false, "lastPaymentFailed": true, "firstSessionStarted": false, "canReview": false, "holdExpiresAt": "2026-10-03T09:27:00Z", "fawry": null, "refund": null }
```
`canReview` is computed per enrolment for the pair (teacher, centre): P10 posts one `POST /v1/reviews` per rated target, each with its own text (CF-27), and `409 already_reviewed` covers a target already reviewed this term.

## 3. Later phases (outline only)

| Area | Endpoints (Phase) |
|---|---|
| Session records | `POST /v1/groups/{id}/session-records`, `PATCH /v1/session-records/{id}`, `POST /v1/session-records/{id}/confirm`, `POST /v1/record-entries/{id}/corrections` (2) |
| Voice | `POST /v1/voice-notes` (signed upload URL), `POST /v1/voice-notes/{id}/uploaded`, `GET /v1/voice-notes/{id}/extraction`, `POST /v1/voice-extractions/{id}/resolve-identity` (2) |
| Notes | `POST /v1/students/{id}/notes`, `POST /v1/notes/{id}/suggest-for-parent` (2) |
| Rules and cases | `GET/PUT /v1/centres/{id}/rules`, `POST /v1/rules/{id}/versions/{v}/approve`, `GET /v1/cases`, `POST /v1/cases/{id}/attempts`, `POST /v1/cases/{id}/dismiss`, `POST /v1/cases/{id}/reopen` (2) |
| Messages | `POST /v1/messages/drafts`, `PATCH /v1/messages/{id}`, `POST /v1/messages/{id}/approve` (2) |
| Assistant | `POST /v1/assistant/threads`, `POST /v1/assistant/threads/{id}/turns`, `GET …/stream` (SSE) (2) |
| Analytics | `GET/PUT /v1/topic-maps/{subjectId}`, `POST /v1/assessments/{id}/tags`, `GET /v1/students/{id}/topic-scores`, `GET /v1/groups/{id}/heatmap`, `POST /v1/focus-plans/{id}/approve` (3) |
