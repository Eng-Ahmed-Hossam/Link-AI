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
| Teacher app | `Authorization: Bearer <JWT>`. Access token 15 min; refresh token 30 days, rotated on use (`POST /v1/auth/refresh` with `{refreshToken}`). Both are kept in the device's secure storage. Claims: `sub`, `roles`, `centreIds`, `teacherId`, `guardianId`, `lang`. |
| Web (parent PWA, owner and staff web) | The same tokens in **httpOnly cookies**, never readable by scripts (decided 2026-10-08): `link_at` (access, `Path=/`) and `link_rt` (refresh, `Path=/v1/auth`), `SameSite=Lax`, `Secure` outside local. The web app serves `/v1/*` from its own origin (a proxy to core-api), so no cross-origin credentials. Every cookie-authenticated request carries `X-Link-Auth: cookie` (the CSRF guard: a plain cross-site form cannot set it); `otp/verify` and `refresh` then set the cookies and leave the tokens out of the body. |
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
| Centre join request (C01, public) | 10 / hour per IP, 3 / day per phone (added 2026-10-09) |

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
| POST | `/v1/auth/otp/verify` | public | Verify the code; returns `{user, isNewUser}` plus the tokens (in the body for the app, as cookies for the web) | rate-limited | MKT-ACC-01 |
| POST | `/v1/auth/refresh` | any | Rotate the refresh token | ✓ | MKT-ACC-04 |
| POST | `/v1/auth/logout` | any | Revoke the refresh token | ✓ | MKT-ACC-04 |
| GET | `/v1/me` | any | Profile, roles, language; `centreIds` (owner or staff) and `teacherId` (added 2026-10-08, so the apps open the right workspace) | — read | MKT-ACC-03 |
| PATCH | `/v1/me` | any | Name, language | ✓ | MKT-ACC-03 |
| POST | `/v1/me/roles` | any | Add the role `parent` or `teacher`. `centre_owner` answers 409 `centre_application_required`: owners come from a join request (C01) | ✓ | MKT-ACC-02 |
| POST | `/v1/me/devices` | any | Register a push token (platform, app) | ✓ | MKT-NTF-02 |
| DELETE | `/v1/me/devices/{id}` | any | Remove a push token | ✓ | MKT-NTF-02 |
| GET | `/v1/me/children` | parent | List children | — read | MKT-ACC-05 |
| POST | `/v1/me/children` | parent | Add a child (records `child_data_processing` consent) | ✓ | MKT-ACC-05 |
| PATCH / DELETE | `/v1/children/{id}` | parent | Edit / archive a child | ✓ | MKT-ACC-05 |
| GET | `/v1/me/consents` | any | Current consents (by `user_id`; never cached) | — read | BR-DAT-03 |
| GET | `/v1/feature-flags` | any (signed in) | Feature flags for the caller's own scope only: the global ones merged with their centres and teacher profile: `{flags: {key: boolean}}` (added 2026-10-08; signed-in only since 2026-10-09, E0-09) | — read | OD-58 |
| GET | `/v1/me/invites` | any | Centre invitations waiting for an answer (added 2026-10-09) | — read | MKT-ACC-06 |
| POST | `/v1/me/invites/{id}/accept` | the invited person | Accept. A teacher invite needs this accept; a staff invite starts at the first sign-in. An invited teacher's profile stays hidden from parents until accepted and complete (name and a subject) | ✓ | MKT-ACC-06 |
| GET | `/v1/me/features` | parent | Paid extras on for any centre where the parent's children study: `{followupExtra}` (added 2026-10-08; P09 updates feed) | — read | OD-58 |
| PUT | `/v1/me/consents` | any | Grant or withdraw a consent | ✓ | BR-DAT-03 |
| POST | `/v1/me/data-requests` | any | PDPL access / correction / deletion request (one open per kind: 409 `already_open`) | ✓ | MKT-OPS-09 |
| GET | `/v1/me/data-requests` | any | My data requests and their status (Account → My data) | — | MKT-OPS-09 |

### Reference data
| Method | Path | Who | Purpose | Idem |
|---|---|---|---|---|
| GET | `/v1/curricula` | public | Curricula with school years | — read |
| GET | `/v1/areas` | public | Areas with a verified centre: the home areas a parent can pick (**S3**, MKT-DSC-01) | — read |
| GET | `/v1/subjects?curriculumId&schoolYearId` | public | Subjects | — read |
| GET | `/v1/academic-terms` | public | Terms | — read |

### Leads and centres
| Method | Path | Who | Purpose | Idem | Req |
|---|---|---|---|---|---|
| POST | `/v1/leads` | public | Landing-page "Get started" form → `org.leads` (rate-limited, bot-filtered at the WAF) | ✓ | MKT-WEB-01 |
| POST | `/v1/centre-applications` | public | Join request (C01), stored as a `centre` lead. When that phone number signs in with a code (so the number is verified), the centre is created with `verification = pending` and the caller becomes its `centre_owner` (decided 2026-10-08) | ✓ | MKT-CEN-01 |
| GET | `/v1/centres/{id}` · `/v1/centres/by-slug/{slug}` | public | Public profile | — read | MKT-DSC-04 |
| GET | `/v1/centres/{id}/profile` | owner, staff | The C02 editing view: public fields plus halls, completeness, badges and `locationUnderReview` (added 2026-10-08) | — read | MKT-CEN-02, CF-44 |
| GET | `/v1/centres/{id}/features` | owner, staff | Paid extras for this centre: `{followupExtra}` (added 2026-10-08) | — read | OD-58 |
| PATCH | `/v1/centres/{id}` | centre_owner | Edit profile; a moved map pin (`location`) puts the centre under review (CF-44) | ✓ | MKT-CEN-02 |
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
| PATCH | `/v1/teachers/me` | teacher | Profile, subjects (`subjectIds`), name (`displayName`), availability, settings. The response's `profileStatus` is `invited`, `incomplete` or `active`; parents see only `active` (decided 2026-10-09) | ✓ | MKT-TCH-01 |
| POST | `/v1/teachers/me/verification` | teacher | Start eKYC; returns the provider session | ✓ | MKT-TCH-02 |
| POST | `/v1/teachers/me/documents/upload-url` | teacher | Degree / reference upload | ✓ | MKT-TCH-02 |
| GET | `/v1/teachers/me/features` | teacher | Paid extras on for any centre the teacher works in: `{followupExtra}` (added 2026-10-08; Follow-up tab) | — read | OD-58 |

### Hall booking
| Method | Path | Who | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| GET | `/v1/rooms/search?lat&lng&radiusKm&minCapacity&weekday&from&to&maxRentPt&facilities` | teacher | Find halls (J01) of verified centres. `weekday` is a comma-separated list of ISO weekdays (1 = Monday … 7 = Sunday); without `lat`/`lng` distances are from the sample area (R2a) | — read | — | MKT-HAL-01 |
| POST | `/v1/rooms/{id}/rent-estimate` | teacher | Estimate from slots, students and fee (J02); pure calculation | — read (no write) | teacher → centre (estimate) | BR-BKG-07 |
| POST | `/v1/room-requests` | teacher | Request slot(s). A pending (unverified) centre answers 409 `centre_not_verified` | ✓ | — | MKT-HAL-02 |
| GET | `/v1/room-requests?scope=mine` | teacher | My requests (J03) | — read | — | MKT-HAL-03 |
| GET | `/v1/room-requests?centreId&stage` | owner, staff | Pipeline (C06) | — read | — | MKT-HAL-04 |
| POST | `/v1/room-requests/{id}/stage` | owner, staff | Move to `phone_call` / `meeting`, with an optional time | ✓ | — | MKT-HAL-04 |
| POST | `/v1/room-requests/{id}/approve` | owner, staff | Approve → creates the booking | ✓ | — | MKT-HAL-04 |
| POST | `/v1/room-requests/{id}/decline` | owner, staff | Decline with a reason | ✓ | — | MKT-HAL-04 |
| POST | `/v1/room-requests/{id}/withdraw` | teacher | Withdraw | ✓ | — | MKT-HAL-03 |
| GET | `/v1/room-bookings?scope=mine` | teacher | My bookings: hall, centre, slots and dates, so a group can be opened in a booked slot (J05; added 2026-10-08) | — read | — | MKT-GRP-01 |
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
| POST | `/v1/enrolments/{id}/accept` · `/decline` | teacher | Only when `reviewEachEnrolment` is on; decline → automatic refund. Returns the J06 row | ✓ | parent → teacher (refund on decline) | MKT-ENR-10 |
| POST | `/v1/groups/{id}/waitlist` | parent | Join the waitlist | ✓ | — | MKT-ENR-09 |
| POST | `/v1/waitlist/{id}/accept` | parent | Accept a live offer: `{paymentPlan, method}` → turns the offer into a seat hold and returns the checkout (as `/checkout`) | ✓ | parent → teacher | MKT-ENR-09 |
| DELETE | `/v1/waitlist/{id}` | parent | Leave the waitlist | ✓ | — | MKT-ENR-09 |
| GET | `/v1/payments/{id}` | payer, payee | Receipt (never cached) | — read | parent → teacher | MKT-ENR-06 |

### Webhooks (provider → Link)
| Method | Path | Verified by | Effect | Idem | Money |
|---|---|---|---|---|---|
| POST | `/v1/webhooks/payments/{provider}` | Provider signature | Dedupe → update payment → post ledger → emit `payment.*`. A bad or missing signature is `401 invalid_signature`; nothing is stored. Locally the fake provider is `fake-pay` (provider value `fake`). A late event never moves a payment backwards (`succeeded` stays `succeeded`) | event ID | parent → teacher; teacher → centre (top-ups) |
| POST | `/v1/webhooks/payouts/{provider}` | Provider signature | Payout status → P6 settled / failed | event ID | teacher; centre |
| POST | `/v1/webhooks/ekyc/{provider}` | Provider signature | Verification result | event ID | — |
| POST | `/v1/webhooks/messaging/{channel}` | Provider signature (messaging-gateway) | Delivery status, inbound replies (Phase 2) | event ID | — |

Webhooks return `200` quickly after storing the event. Processing happens in the same transaction or right after; it never depends on the provider retrying.

### Teacher money (teacher-only endpoints)
The money endpoints in this table are for teachers only — including the four under `/v1/me/` (payout account, balance, payouts, statements). Other `/v1/me/*` endpoints (profile, devices, children, consents, data requests) are open to any signed-in user. Centre money is in the next table.

| Method | Path | Who | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| GET | `/v1/me/payout-account` | teacher | Payout account (masked) (**S3**) | — read | teacher | MKT-TCH-03 |
| PUT | `/v1/me/payout-account` | teacher | Replace the payout account (re-verified): `{kind: bank\|wallet, number, holderName}`; an IBAN needs valid check digits (422 `invalid_iban` / `invalid_wallet`) (**S3**) | ✓ | teacher | MKT-TCH-03 |
| GET | `/v1/me/balance` | teacher | Pending, available, rent reserve, next payout (live, never cached) | — read | teacher | BR-OUT-01 |
| GET | `/v1/me/payouts` | teacher | Payout history (**S3**) | — read | teacher | MKT-LED-05 |
| GET | `/v1/teachers/me/rent-due` | teacher | Rent still owed after the 1st (OD-12) (**S3**) | — read | teacher → centre | BR-RNT-05 |
| GET | `/v1/me/statements.csv?month` | teacher | CSV export | — read | teacher | MKT-LED-07 |
| GET | `/v1/teachers/me/earnings?month=2026-10` | teacher | J07 statement | — read | teacher | MKT-LED-07 |
| GET | `/v1/rent-invoices?bookingId\|teacherId` · `/v1/rent-invoices/{id}` | teacher (payer), centre_owner (payee) | Invoices | — read | teacher → centre | MKT-LED-03 |
| POST | `/v1/rent-invoices/{id}/checkout` | teacher | Pay a shortfall: card, wallet or Fawry; P4 on the webhook (**S3**) | ✓ | teacher → centre | MKT-LED-04 |

### Centre money (`/v1/centres/{id}/*`, owner of that centre only)
One owner can own several centres; each centre has its own payout account, balance and payouts.

| Method | Path | Who | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| GET | `/v1/centres/{id}/payout-account` | centre_owner | Payout account (masked) (**S3**) | — read | centre | MKT-CEN-05 |
| PUT | `/v1/centres/{id}/payout-account` | centre_owner | Replace the payout account (re-verified) (**S3**) | ✓ | centre | MKT-CEN-05 |
| GET | `/v1/centres/{id}/balance` | centre_owner | Available, next payout (live, never cached) | — read | centre | MKT-LED-08 |
| GET | `/v1/centres/{id}/payouts` | centre_owner | Payout history (**S3**) | — read | centre | MKT-LED-08 |
| GET | `/v1/centres/{id}/statements.csv?month` | centre_owner | CSV export | — read | centre | MKT-LED-08 |
| GET | `/v1/centres/{id}/rent-income?month=2026-10` | centre_owner | C07 statement | — read | teacher → centre | MKT-LED-08 |
| GET | `/v1/rent-invoices?centreId` | centre_owner | Invoices for this centre | — read | teacher → centre | MKT-LED-08 |
| GET | `/v1/payouts/{id}` | payee (teacher or centre_owner) | Payout detail | — read | teacher or centre (the payee) | MKT-LED-05 |

### Reviews
| Method | Path | Who | Purpose | Idem | Req |
|---|---|---|---|---|---|
| POST | `/v1/reviews` | parent (verified) | Create a review or private feedback | ✓ | MKT-REV-01 |
| PATCH | `/v1/reviews/{id}` | author | Edit and resubmit (when `needs_edit`) | ✓ | BR-REV-05 |
| GET | `/v1/me/reviews-received?centreId&visibility&status` | teacher, owner, staff | C04 tabs: `visibility=public` · `visibility=private` · `status=reported`. Owners and staff pass `centreId` | — read | MKT-REV-03 |
| POST | `/v1/reviews/{id}/reply` | target | Public reply | ✓ | MKT-REV-03 |
| POST | `/v1/reviews/{id}/report` | target | Report | ✓ | MKT-REV-03 |

### Ops (`/v1/ops/*`, ops console only; role `link_ops` + permission)
Every route checks, in order: the caller's address against `OPS_IP_ALLOWLIST` (403 `ops_ip_not_allowed`; empty = closed in production), an active `link_ops` role and the route's permission (403 `ops_permission_required`). Ops sign in with a phone code like everyone (CF-56). Built in S2: the rows marked **S2**; the rest come with their features.

| Method | Path | Permission | Purpose | Idem | Money | Req |
|---|---|---|---|---|---|---|
| GET | `/v1/ops/me` | any ops | The ops user and the permissions their bundles grant (**S2**) | — read | — | MKT-OPS-08 |
| POST | `/v1/ops/centres/{id}/stage` | ops.verify | Move a join request: `new` \| `call_scheduled` \| `visit_booked` (**S2**) | ✓ | — | MKT-OPS-01 |
| POST | `/v1/ops/notes` | any ops | Internal note on a centre, teacher, lead, refund, review or data request (**S2**) | ✓ | — | MKT-OPS-01 |
| POST | `/v1/ops/leads/{id}/status` | ops.verify | A landing-page lead: `contacted` \| `discarded` (**S2**) | ✓ | — | MKT-OPS-01, MKT-WEB-01 |
| GET | `/v1/ops/data-requests/{id}/export` | ops.verify | An access request: the person's own data as JSON, audited (**S2**) | — read | — | MKT-OPS-09 |
| GET | `/v1/ops/centre-applications?stage` | ops.verify | L01 pipeline (includes new leads) (**S2**) | — read | — | MKT-OPS-01 |
| PUT | `/v1/ops/verifications/{subjectType}/{subjectId}/checks/{checkCode}` | ops.verify | Record a check (**S2**) | ✓ | — | MKT-OPS-01, MKT-OPS-02 |
| POST | `/v1/ops/centres/{id}/approve` · `/reject` · `/revoke` | ops.verify | Decide (**S2**) | ✓ | — | MKT-OPS-01 |
| GET | `/v1/ops/teachers?verification=pending` | ops.verify | Queue (**S2**) | — read | — | MKT-OPS-02 |
| POST | `/v1/ops/teachers/{id}/verify` · `/reject` · `/revoke` | ops.verify | Decide (**S2**) | ✓ | — | MKT-OPS-02 |
| GET | `/v1/ops/reviews/queue` | ops.moderate | L02 queue (**S2**) | — read | — | MKT-OPS-03 |
| POST | `/v1/ops/reviews/{id}/decision` | ops.moderate | `publish` \| `hide` \| `request_edit` (**S2**) | ✓ | — | MKT-OPS-03 |
| GET | `/v1/ops/refunds?status` · `/v1/ops/disputes?status` | ops.finance | L03 queue (refunds: **S2**) | — read | parent → teacher | MKT-OPS-04 |
| POST | `/v1/ops/refunds/{id}/approve` · `/reject` | ops.finance | Decide (**S2**) | ✓ | parent → teacher | MKT-OPS-04 |
| POST | `/v1/ops/disputes/{id}/resolve` | ops.finance | Resolve with an outcome | ✓ | parent → teacher | MKT-OPS-04 |
| GET | `/v1/ops/reconciliation/issues?status` | ops.finance | Mismatches, orphans | — read | Link | MKT-OPS-05 |
| POST | `/v1/ops/reconciliation/issues/{id}/resolve` | ops.finance | Match, refund or close | ✓ | Link | MKT-OPS-05 |
| GET | `/v1/ops/commission-rules` | ops.finance | List rules | — read | Link | MKT-OPS-06 |
| POST | `/v1/ops/commission-rules` | ops.finance | Add a rule (overlaps rejected) | ✓ | Link | MKT-OPS-06 |
| PUT | `/v1/ops/reference/{curricula\|school-years\|subjects\|academic-terms}/{id}` | ops.verify | Edit reference data | ✓ | — | MKT-OPS-07 |
| GET | `/v1/ops/audit?objectType&objectRef` | any ops | Audit lookup (**S2**) | — read | — | MKT-OPS-08 |
| GET | `/v1/ops/data-requests?status` | ops.verify | PDPL requests queue (**S2**) | — read | — | MKT-OPS-09 |
| POST | `/v1/ops/data-requests/{id}/complete` | ops.verify | Mark done, with what was exported, corrected or anonymised (**S2**) | ✓ | — | MKT-OPS-09 |
| POST | `/v1/ops/ledger/adjustments` | ops.finance | Post a balanced adjustment (P11); `reason` required | ✓ | teacher, centre or Link (the accounts posted) | MKT-OPS-10 |
| GET | `/v1/ops/payouts?status` | ops.finance | Payout runs and failures (**S3**) | — read | teacher; centre | MKT-OPS-11 |
| GET | `/v1/ops/payout-batches` | ops.finance | Weekly batches with totals (**S3**) | — read | teacher; centre | MKT-OPS-11 |
| POST | `/v1/ops/payout-batches/run` | ops.finance | Make this week's batch now (the worker does it Thursday 09:00; safe twice) (**S3**) | ✓ | teacher; centre | MKT-OPS-11 |
| POST | `/v1/ops/payout-batches/{id}/export` | ops.finance | The batch as a CSV for the bank or InstaPay (full account numbers; audited) (**S3**) | — | teacher; centre | MKT-OPS-11 |
| POST | `/v1/ops/payouts/{id}/settle` · `/fail` | ops.finance | The transfer went through (P6 settled) or bounced (P6 failed, the account to fix) (**S3**) | ✓ | teacher or centre | MKT-OPS-11, BR-OUT-06 |
| GET | `/v1/ops/payout-accounts` · POST `…/{id}/verify` · `…/{id}/reject` | ops.finance | New or changed payout accounts to check (BR-OUT-03) (**S3**) | ✓ | — | BR-OUT-03 |
| POST | `/v1/ops/payouts/{id}/retry` | ops.finance | Retry a failed payout (same payout, new attempt) (**S3**) | ✓ | teacher or centre (the payee) | MKT-OPS-11 |

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

### P-8. Parent home area and shared location (decided 2026-10-09, R2b)
`GET /v1/me` adds `homeArea` (string \| null) for parents; `PATCH /v1/me` takes `homeArea` (an area where a verified centre is, else `422 unknown_area`; `null` clears it). `GET /v1/search/centres` and `/v1/search/teachers` take `lat`, `lng` only when the parent has tapped "Use my location" and the browser shared it (rounded to about 100 m, never stored). Without them, a signed-in parent's distances are measured from the centre of the verified centres in their home area, otherwise from the Maadi sample point.

## 2b. Proposed — from frontend Batch 5 (Phase 2, teacher app)

**Status: built in core-api (R3, 2026-10-09)** and in OpenAPI (`apps/core-api/src/contract/followup-routes.ts`); the response types in `packages/api-client/src/followup.ts` are now the generated ones. The mock (`packages/mocks/src/followup/`) keeps the same shapes. What R3 added or changed on the way:

- **The Follow-up extra is checked on the server.** When `followup.extra` is off for the centre, every endpoint below and in §2c answers **403 `extra_not_enabled`** (a centre the caller cannot see stays 404, 10 §2); a voice upload is refused and no rule runs (`evaluate` returns nothing). The marketplace endpoints are unaffected.
- `PUT /v1/voice-notes/{id}/audio?exp=…&sig=…` is the signed `uploadUrl` (HMAC, 15 minutes, audio ≤ 15 MB). The audio goes to S3 with SSE-KMS (aws-local locally); `uploaded` emits `voice.uploaded` and the `voice` consumer hands it to ai-service. A note of class `consented_real` is never sent to a provider outside this machine (`data_safety_refused`).
- `POST /v1/internal/voice-results/{id}` — ai-service → core-api only (loopback and `x-link-internal-token`); not for apps. A name matched to someone off the roster becomes unknown; an ambiguous match with fewer than two candidates becomes unknown (never guess).
- `POST /v1/session-records/{id}/correction-requests` (owner asks the teacher, FUP-REC-08) and `POST /v1/correction-requests/{id}/close` (the teacher).
- 422 `score_out_of_range` is also enforced by the database (a trigger), and a confirmed record changes only through a correction.

| Method | Path | Body → response (draft types) | Rules the mock enforces |
|---|---|---|---|
| GET | `/v1/teachers/me/today` | → `TeacherToday` (`nextSession`, `reminders[]` with source record, `recordDue`, `needsYou[]`) | Reminders only from confirmed records (FUP-REC-01) |
| GET | `/v1/teachers/me/groups` | → `TeacherGroup[]` (marketplace fields + `followup` or null) | CF-30 |
| GET | `/v1/groups/{id}/roster` | → `RosterRow[]` (last 4 sessions, latest score, notes, open flags) | `none` = no confirmed record (BR-APR-07) |
| GET / POST | `/v1/groups/{id}/session-records` | POST `{groupSessionId}` → `SessionRecord` (201 new draft, 200 existing) | Only sessions that took place or today |
| GET / PATCH | `/v1/session-records/{id}` | PATCH `SaveRecordBody` → `SessionRecord` | Draft only (409 `record_confirmed`); 422 `score_out_of_range` (block, never cap), `score_for_absent`, `assessment_required` |
| POST | `/v1/session-records/{id}/confirm` | Idempotency-Key required → `SessionRecord` with `signals[]` | Same key replays; 409 `identity_unresolved`; runs the rules (FUP-RUL-03) |
| POST | `/v1/record-entries/{id}/corrections` | `CorrectionBody` → `Correction` | Confirmed records only; reason required; re-runs rules, `resolved_by_correction` |
| POST | `/v1/voice-notes` | `{sessionRecordId, durationS}` + Idempotency-Key → `VoiceNote` (`uploadUrl`) | Key = the device's queue id: a retry never creates a second note |
| PUT | `uploadUrl` (signed) | audio bytes | — |
| POST | `/v1/voice-notes/{id}/uploaded` | → `VoiceNote` | — |
| GET | `/v1/voice-notes/{id}/extraction` | → 202 `{status, etaSeconds}` while processing, then `VoiceExtraction` | 503 `stt_unavailable` (FUP-VOI-06); with real STT also 503 `stt_failed` and `stt_timeout` (no answer within 3 minutes): the app shows "Type the note instead" and keeps the audio |
| POST | `/v1/voice-notes/{id}/retry` | → `VoiceNote` | Proposed (Part B). The note's author; sends the kept audio to speech-to-text again. 409 `not_uploaded`, 409 `not_real_stt` (fixture mode) |
| POST | `/v1/voice-extractions/{id}/resolve-identity` | `{itemId, studentId}` → `VoiceExtraction` | Only a listed candidate (422 `not_a_candidate`) |
| POST | `/v1/voice-extractions/{id}/discard-item` | `{itemId}` → `VoiceExtraction` | A discarded item is never saved and no longer blocks confirm |
| GET | `/v1/students/{id}` | → `StudentDetail` | Trends per assessment series only (FUP-REC-11) |
| POST | `/v1/students/{id}/notes` | `{groupId, tag, body}` → `Note` | ≤ 500 characters; internal |
| POST | `/v1/notes/{id}/suggest-for-parent` | → `Note` (`suggested_for_parent`) | Goes to staff; no message is created |

Owner-side endpoints (cases, messages, assistant, demo controls) are in §2c.

## 2c. Proposed — from frontend Batch 6 (Phase 2, owner web, messages, assistant)

**Status: built in core-api (R3, 2026-10-09)**, in OpenAPI, same shapes as the mock (`packages/mocks/src/followup/`). Every `/v1/centres/{id}/*` call checks that the caller is staff of that centre (403 otherwise; 404 for a centre the caller cannot see, 10 §2); every call here answers 403 `extra_not_enabled` when the centre's Follow-up extra is off. Added in R3:

- `POST /v1/messages/{id}/sent-manually` — "I sent it" (OD-56): only an approved message on the manual path; records who and when. It never sets `delivered`.
- `POST /v1/webhooks/messaging/{provider}` — provider → Link (`whatsapp-fake` locally), verified by `x-whatsapp-fake-signature: sha256=<HMAC>`; deduped on the provider event ID. **A message's delivery status changes only here** (BR-APR-11), forward only. An inbound `STOP` writes a `whatsapp_updates` consent withdrawal at once.
- `GET /v1/me/centre-groups` — the parent's centres and groups with the extra on (P09 filter).
- Approve needs `messages.approve` **and** the tick; the text is locked after approval (a database trigger, not only the API).
- **Ask Link** (`/v1/assistant/*`) answers **503 `assistant_unavailable`** unless a local language model is configured (`OLLAMA_URL`); the scripted assistant of the mock is never used in live mode. With a local model: read tier only, student names replaced by `<S#>` tokens before the model, `act` returns `needs_approval` and never acts. Threads (§3) are not built.

| Method | Path | Body → response (draft types) | Rules the mock enforces |
|---|---|---|---|
| GET | `/v1/centres/{id}/today` | → `OwnerToday` (due, overdue with owners, missing and complete records over eligible sessions, follow-up list, keep-complete list) | Overdue = past due with no contact attempt (FUP-CAS-05); "missing" counts eligible sessions with no confirmed record, never absences |
| GET | `/v1/cases` · `/v1/cases/{id}` | → `Page<FollowupCase>` · `FollowupCase` (signal with evidence, rule text and version, assignee, due, timeline, attempts) | Reception gets the case by default, due the same day (FUP-CAS-02) |
| POST | `/v1/cases/{id}/dismiss` | `{reason}` → `FollowupCase` | 422 `reason_required`; the signal stays in history (FUP-CAS-04) |
| POST | `/v1/cases/{id}/reopen` | → `FollowupCase` | Dismissed or resolved only |
| POST | `/v1/cases/{id}/attempts` | `{method, result, learned?, nextStep?, keepOpen}` → `FollowupCase` | 422 `validation_failed` without method and result; `keepOpen` (default) → `awaiting_confirmation`; 409 `case_closed` |
| POST | `/v1/cases/{id}/seat-check` | → `{text, seatsLeft, groupId}` | Logged on the case timeline; changes nothing else |
| GET | `/v1/messages` · `/v1/messages/{id}` | → `Page<ParentMessage>` · `ParentMessage` (text, tone, grounded facts with sources, masked phone, status history, `blockedReason`) | Phone shown masked only |
| POST | `/v1/messages/drafts` | `{caseId, tone?}` → `ParentMessage` (`draft`) | Facts only from confirmed records (FUP-MSG-01) |
| PATCH | `/v1/messages/{id}` | `{text?, tone?}` → `ParentMessage` | Draft only: 409 `message_locked` after approval |
| POST | `/v1/messages/{id}/approve` | `{checked: true, channel?}` → `ParentMessage` (`queued` or `not_sendable`) | Permission `messages.approve`; 422 without the tick; STOP / no opt-in → `not_sendable` with the reason (FUP-MSG-03 AC2) |
| POST | `/v1/messages/{id}/revise` | → new `ParentMessage` (`draft`) | The approved one keeps its status (locked) |
| GET | `/v1/centres/{id}/students` | → `Page<CentreStudentRow>` (last 4 sessions, latest score, open follow-up, latest internal note, guardian status) | Search by student or guardian is client-side over this page (FUP-DSH-02) |
| GET | `/v1/centres/{id}/sessions` | → `Page<CentreSessionRow>` | Only confirmed records count as complete; detail reuses `GET /v1/session-records/{id}` with corrections |
| GET | `/v1/centres/{id}/rules` | → `RuleView[]` (code, active, params, scope, version, history, proposal, readable text and example) | 03 §3 defaults; only `consecutive_absences` on |
| PUT | `/v1/centres/{id}/rules/{code}` | `RuleChangeBody` → `RuleView` | Owner: new version. Staff: a proposal, version unchanged. Parameters must be whole numbers ≥ 1 (422, never adjusted) |
| POST | `/v1/centres/{id}/rules/{code}/approve` · `/reject` | → `RuleView` | Owner only (403); 409 `no_proposal` |
| GET | `/v1/centres/{id}/staff` · POST `/v1/centres/{id}/staff` | → `StaffMember[]` · `{phone, role, permissions?}` → `StaffMember[]` | Invite: owner only; Egyptian mobile (422 `invalid_phone`). Same path as §2 (renamed from `/staff/invites` on 2026-10-08) |
| GET | `/v1/centres/{id}/activity` | → `ActivityLog` (`events[]`, `week` counts) | Append-only audit events (FUP-DSH-04); filters by kind |
| GET | `/v1/me/updates` | → `Page<ParentUpdate>` | Parent: approved messages for their own children only, never drafts (FUP-MSG-08, OD-41) |
| GET | `/v1/assistant/briefing` | → `{text, items[]}` (case, reason, draft id, latest sent status, blocked reason) | Staff of the centre only |
| POST | `/v1/assistant/turns` | `{text}` → `text/event-stream` of `AssistantEvent` (`tier`, `token`, `draft`, `list`, `needs_approval`, `done`) | Acts as the signed-in user; tiers read / draft / act — act never acts, it returns `needs_approval`; more than one student match → it asks (never guesses); drafts only from confirmed facts |
| POST | `/v1/assistant/transcribe` | audio bytes → `{text, language}` | Mock returns a fixture; Step 2 sends it through ai-service |

**Demo-only (`APP_ENV=local`, never in production builds):** `GET /__demo/state[/{lang}]`, `POST /__demo/reset`, `POST /__demo/settings` (`phase2`, `marketplace`, `offline`, `sttDown`, `confirmFault`), `POST /__demo/new-day`, `POST /__demo/provider` (`advance` \| `fail` — the only way a message status moves, BR-APR-11), `POST /__demo/reply` (an inbound guardian reply with summary and intent). docs/14 §5.2. In live mode (R3) `provider` and `reply` do not change Link's data themselves: they ask `whatsapp-fake`, which sends the signed webhook; `POST /__demo/voice-result` returns a fixture extraction when ai-service is not running.

## 2d. Proposed — concierge pilot and CF-34/CF-39 (2026-10-04)

**Status: pilot server only** (`apps/pilot`, ADR-0008, OD-50). The pilot mounts the §2b/§2c follow-up handlers except Ask Link, the parent feed, seat checks, phone invites, sign-in mocks and every `/__demo` or `/__mock` route; it adds the endpoints below. Same-origin only; sessions are server-side (httpOnly cookie).

| Method | Path | Body → response | Rules |
|---|---|---|---|
| GET | `/v1/pilot/info` | → `{mode, centreName, startDate, endDate}` | Public; no personal data |
| GET | `/v1/pilot/people` | → `PilotPerson[]` (id, first name, role) | Public on the centre LAN: the sign-in picker; only people with a PIN |
| POST | `/v1/pilot/sessions` | `{userId, pin}` → person + `Set-Cookie` | 401 `wrong_pin` (`attemptsLeft`), 423 `locked` (`lockedUntil`, after 5 wrong PINs, 15 min), 429 `rate_limited` (30 per address per 15 min) |
| DELETE | `/v1/pilot/sessions/current` | → 204, cookie cleared | — |
| GET | `/v1/me` | → `PilotMe` (`roles`, `centreId`) | 401 without a valid session |
| GET | `/v1/pilot/users` | → `PilotStaffRow[]` (role, groups, `hasPin`, `active`) | Owner and Reception |
| POST | `/v1/pilot/users` | `{name, role, groupIds?}` → `{user, pin}` | Owner only; the PIN is returned once and stored as a hash |
| POST | `/v1/pilot/users/{id}/pin` | → `{pin}` | Owner only; ends that person's sessions |
| DELETE | `/v1/pilot/users/{id}` | → 204 | Owner only; access removed, sessions ended, history kept |
| POST | `/v1/messages/{id}/approve` | as §2c | **Pilot:** status stays `approved` (no channel, no opt-in check: the centre sends, OD-56) |
| POST | `/v1/messages/{id}/sent-manually` | → `ParentMessage` with `sentManually {by, at}` | Pilot only; message must be `approved`; once per message (409 `already_sent`); logs a `whatsapp_manual` / `message_sent` attempt; the status never becomes `delivered` or `read` (BR-APR-11) |
| POST | `/v1/session-records/{id}/correction-requests` | `{studentId?, text}` → `CorrectionRequest` | CF-34. Owner only; confirmed records only; ≤ 500 characters. Both modes |
| POST | `/v1/correction-requests/{id}/close` | → `CorrectionRequest` (`done`) | The group's teacher. A correction on the record also closes it |
| GET | `/v1/me/centre-groups` | → `CentreGroup[]` | CF-39, demo parent P09 with the marketplace off. Not mounted in the pilot |

**Voice notes in the pilot (Part B, ADR-0007, 2026-10-05):**

| Method | Path | Body → response | Rules |
|---|---|---|---|
| GET | `/v1/me` | `PilotMe.voiceNotes` (boolean) | True only when `PILOT_VOICE=1` **and** the signed-in teacher's voice consent is recorded; the app hides the microphone otherwise |
| POST | `/v1/pilot/users/{id}/voice-consent` | `{granted}` → `{userId, voiceConsent}` | Owner only; teachers only. Withdrawal deletes that teacher's recordings and their text at once, and switches voice off for them. Writes `consent.voice_granted` / `consent.voice_withdrawn` |
| POST | `/v1/pilot/users/{id}/voice` | `{on}` → `{userId, voiceOn}` | 4.2. Owner only; teachers only. **Voice is off by default**; `on` needs the consent first (409 `consent_required`). Writes `voice.enabled` / `voice.disabled` |
| GET | `/v1/pilot/voice` | → `PilotVoiceStatus` (`available`, `paused`, `pausedAt`, `profile {key: gpu\|cpu_rules\|cpu_llm, sttDevice, llm, secondsPerMinute}`) | 4.2. Owner and Reception. The profile and its estimate come from ai-service `/ready` |
| POST | `/v1/pilot/voice` | `{paused}` → `{paused, stopped}` | 4.2 kill switch. Owner only. Pausing makes `/v1/me.voiceNotes` false for everyone. Notes handed over but not processed are never processed: their audio is deleted now, their extraction answers 503 `stt_unavailable` with `reason: voice_paused`, and a late ai-service answer gets 409 `voice_paused`. New notes and «Try again» get 503. Writes `voice.paused` / `voice.resumed` |
| GET | `/v1/pilot/users` | `PilotStaffRow.voiceConsent` | — |
| POST | `/v1/voice-notes` | as §2b; `uploadUrl` = `/v1/voice-notes/{id}/audio` | 503 `stt_unavailable` without voice or consent |
| PUT | `/v1/voice-notes/{id}/audio` | audio bytes (`content-type` of the recording) → 200 | The note's author; 413 `bad_audio` (empty or > 15 MB). Stored encrypted (AES-256-GCM) on the laptop; deleted 30 days after upload or at the pilot's end |
| POST | `/v1/internal/voice-results/{id}` | ai-service's result → 204 | Loopback only, header `x-link-internal-token` (random per start); anything else gets 404. Items naming a student outside the group are dropped |

ai-service itself (`127.0.0.1:8090`, bearer token): `POST /v1/jobs` (multipart `audio` + `meta` with `dataClass`, roster, assessment, callback) → 202 `{jobId, etaSeconds}`; `GET /v1/jobs/{id}`; `POST /v1/transcribe` (Ask Link question, demo only); `POST /v1/extract-text` (eval); `GET /health`, `GET /ready`. A `consented_real` job for a non-local provider fails with `data_safety_refused`.

`TeacherToday.correctionRequests` and `SessionRecord.correctionRequests` carry open and done requests (CF-34). `CaseAttempt.channel` gains `whatsapp_manual` (06 `case_attempts`).

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
