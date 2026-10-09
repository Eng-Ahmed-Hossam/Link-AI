# Real backend plan (R0)

**Status:** R0 approved 2026-10-08 (decisions in §8). R1 built — see §9. R2–R4 not started. **Scope:** replace the mock server with core-api for everything the apps call today, locally (`docker compose` + `pnpm dev`), with real accounts, Postgres, per-centre isolation, server-side rules and provider adapters running against local fakes. **Not in scope:** deployment, real provider accounts, the ops console beyond review moderation, app stores, analytics.

Read for this plan: PRODUCT_BRIEF, docs 05, 06, 07 (§2, §2a–§2d), 08, 10, ADR-0001 to ADR-0009 (0009 for the pilot request email only), `docs/product/sample-only.md`, `docs/product/app-map.md`, the mock handlers (`packages/mocks/src/**/handlers.ts`), `packages/api-client/src/*`, migrations 0001–0003, `infra/local/`.

---

## 0. In one page

| | Today | After R3 |
|---|---|---|
| API | Mock handlers (MSW in the browser, or the mock server on :4010) | **core-api** (NestJS) on :4000, same paths and shapes; the apps flip `API_MODE=live` |
| Data | In memory / localStorage | **Postgres** (PostGIS, RLS per centre) + Redis (cache; state for OTP, idempotency, seat holds) |
| Sign-in | Code `123456`, `mock.<user>` tokens | Phone OTP through `SmsSender` → **sms-sink**; JWT access 15 min + rotated refresh 30 days |
| Payments | `/__mock/payments` page, webhook simulated | `PaymentProvider` → **fake-pay** (hosted page, Fawry reference, signed webhooks), ledger postings |
| WhatsApp | `/__demo/provider` moves the status | `WhatsAppSender` → a new **whatsapp-fake**; status moves only on its webhooks |
| Voice | Fixture or local Whisper via the mock server | Upload to **aws-local** S3 → `voice.uploaded` → **ai-service** (unchanged) → core-api |
| Demo controls | `/__demo/*` on the mock server | The same paths on core-api, **only when `APP_ENV=local`** (a module that is not even registered otherwise) |

What stays: **mock mode** (MSW + mock server) for fast UI tests and the public demo; the **pilot** (`apps/pilot`, PIN sign-in, its own durable store) untouched in this phase; **ai-service** as it is.

**The rule for every stage:** the same Playwright specs run in `mock` and in `live`. A stage is done when its part of the connected story passes in both, and you can click it yourself in live mode.

---

## 1. Endpoint inventory

Every endpoint the apps call today (111 paths in `packages/api-client`, 123 routes in the mock handlers including the demo and mock-provider ones), grouped by area. Rows with several paths share a module, tables and rules. **Module** = owning core-api module (05 §2). **Tables** = what it reads/writes (06). **Rules** = the doc IDs it must enforce. **Stage** = R1, R2 or R3. ⚠ marks a mock path or shape that differs from docs/07 — the docs win, and the mock and client change in the same commit (§2).

### 1.1 Accounts and reference data — R1

| Method | Path | Module | Tables | Rules | Stage |
|---|---|---|---|---|---|
| POST | `/v1/auth/otp/request` | identity | Redis `otp:{phoneHmac}` (hash of the code, tries, resend-after); `platform.audit` | MKT-ACC-01, 07 §1 rate limits (3/10 min, 10/day per phone; 20/h per IP) | R1 |
| POST | `/v1/auth/otp/verify` | identity | `identity.users`, `role_assignments`, `auth_sessions` | MKT-ACC-01 (6 digits, 5 min, 5 tries), MKT-ACC-02 (new user flag) | R1 |
| POST | `/v1/auth/refresh` ⚠ not in mock | identity | `auth_sessions` (rotation chain; reuse revokes the chain) | MKT-ACC-04 | R1 |
| POST | `/v1/auth/logout` ⚠ not in mock | identity | `auth_sessions` | MKT-ACC-04 | R1 |
| GET | `/v1/me` | identity | `users`, `role_assignments` | MKT-ACC-03 | R1 |
| PATCH | `/v1/me` ⚠ client only | identity | `users` | MKT-ACC-03 (07 §2a P-1) | R1 |
| POST | `/v1/me/roles` | identity | `role_assignments` (+ `org.teachers` for `teacher`) | MKT-ACC-02 | R1 |
| GET / POST | `/v1/me/children` | org | `org.students`, `student_guardians`, `guardians`, `consent_events` | MKT-ACC-05, BR-DAT-03 | R1 |
| GET / PUT | `/v1/me/consents` ⚠ client only | org | `consent_events` (never cached) | BR-DAT-03 (07 §2a P-2) | R1 |
| GET | `/v1/me/features` | platform | `platform.feature_flags` (+ the parent's centres) | OD-58 | R1 |
| GET | `/v1/curricula` | reference | `ref.curricula`, `school_years` (+ `short_name_*`, P-4) | MKT-DSC-01 | R1 |
| GET | `/v1/subjects` | reference | `ref.subjects` | MKT-DSC-01 | R1 |
| POST | `/v1/centre-applications` | org | `org.centres` (verification `pending`), `role_assignments` (owner), `org.leads` link | MKT-CEN-01, CF-41 (1 working day) | R1 |
| GET | `/v1/centres/{id}/staff` | identity | `role_assignments`, `users` | MKT-ACC-06, 10 §1 | R1 |
| POST | `/v1/centres/{id}/staff` ⚠ mock: `/staff/invites` | identity | `role_assignments` (`invited`), SMS invite | MKT-ACC-06 AC1 (permissions), owner only | R1 |
| GET | `/v1/centres/{id}/features` ⚠ not in 07 | platform | `feature_flags` (per centre) | OD-58 | R1 |
| GET | `/v1/teachers/me/features` ⚠ not in 07 | platform | `feature_flags` + the teacher's centres | OD-58 | R1 |

### 1.2 Centres, halls, schedule, room requests — R2

| Method | Path | Module | Tables | Rules | Stage |
|---|---|---|---|---|---|
| GET | `/v1/centres/{id}/profile` ⚠ not in 07 (owner view of C02) | org | `centres`, `rooms`, review stats | MKT-CEN-02, CF-44 | R2 |
| PATCH | `/v1/centres/{id}` | org | `centres` (+ `location_status`, CF-44), audit | MKT-CEN-02, CF-44 (owner only; moved pin → `under_review`) | R2 |
| GET / POST | `/v1/centres/{id}/rooms` | rooms | `market.rooms`, `room_open_slots` | MKT-CEN-03, CF-44 (owner adds) | R2 |
| PATCH | `/v1/rooms/{id}` | rooms | `rooms`, `room_open_slots` | MKT-CEN-03 (one rent rule per hall; seats ≥ groups in it) | R2 |
| GET | `/v1/centres/{id}/schedule` | rooms | `rooms`, `room_bookings`, `room_booking_slots`, `groups`, `group_sessions` | MKT-CEN-04 (seats per session) | R2 |
| GET / PUT | `/v1/centres/{id}/settings/auto-approve` | rooms | `centres.settings` | MKT-HAL-05 (off by default) | R2 |
| GET | `/v1/rooms/search` ⚠ params: mock `students, weekdays, maxKm`; 07 `minCapacity, weekday, radiusKm, lat, lng…` | search | `rooms`, `room_open_slots`, `centres.location` (PostGIS) | MKT-HAL-01 | R2 |
| POST | `/v1/rooms/{id}/rent-estimate` | rooms | `rooms`, `ledger.commission_rules` (read) | BR-BKG-07, OD-02 (rate from rules) | R2 |
| GET / POST | `/v1/room-requests` | rooms | `market.teacher_applications` | MKT-HAL-02/03/04 | R2 |
| POST | `/v1/room-requests/{id}/stage` · `/approve` · `/decline` · `/withdraw` | rooms | `teacher_applications`, `room_bookings`, `room_booking_slots` (exclusion constraint: no double booking) | MKT-HAL-03/04/05, CF-46 (approval books), BR-BKG-04/05 | R2 |
| GET | `/v1/teachers/me/bookings` ⚠ not in 07 (07 has `/v1/room-bookings/{id}`) | rooms | `room_bookings` | MKT-GRP-01 (open a group in a booked slot) | R2 |
| GET | `/v1/centres/{id}/rent-income` | rent (ledger) | `ledger_entries`, `rent_invoices`, `payments` | MKT-LED-08, CF-13, OD-01, OD-16 | R2 |

### 1.3 Teachers, groups, discovery — R2

| Method | Path | Module | Tables | Rules | Stage |
|---|---|---|---|---|---|
| GET / PATCH | `/v1/teachers/me` | org | `org.teachers`, `teacher_subjects`, settings (`reviewEachEnrolment`) | MKT-TCH-01/02, OD-08 | R2 (minimal row in R1) |
| POST | `/v1/groups` | groups | `market.groups`, `group_sessions` (generated from the booking's slots) | MKT-GRP-01, seat cap ≤ hall (BR-GRP), CF-05 | R2 |
| PATCH | `/v1/groups/{id}` | groups | `groups` | MKT-GRP-02 (seats ≥ seats taken) | R2 |
| GET | `/v1/groups/{id}` | groups | `groups`, `group_sessions`, seat counts (Redis + DB) | MKT-ENR-01 (seats per session) | R2 |
| GET | `/v1/teachers/me/groups` | groups (+ records summary in R3) | `groups`, `group_sessions` | CF-30 | R2 |
| GET | `/v1/search/centres` · `/v1/search/teachers` | search | read views over `centres`, `teachers`, `groups`, `review_stats` | MKT-DSC-01/02/03 (P-5 totals) | R2 |
| GET | `/v1/centres/by-slug/{slug}` · `/v1/teachers/by-slug/{slug}` | search | public views; `groupsForChild` (P-3), `ratingDistribution` (P-6), `locationUnderReview` | MKT-DSC-04/05, CF-44 | R2 |

### 1.4 Enrolment, payment, money — R2

| Method | Path | Module | Tables | Rules | Stage |
|---|---|---|---|---|---|
| POST | `/v1/enrolments` | enrolment | `market.enrolments`; Redis `seats:` / `holds:` / `hold:` (Lua) | MKT-ENR-02, BR-ENR-01/02/08/09/13, 08 §4 | R2 |
| POST | `/v1/enrolments/{id}/checkout` | payments | `ledger.payments`; `PaymentProvider` → fake-pay | MKT-ENR-03/04/05/12, BR-PMT-02 (monthly = card only), BR-MNY-06 (no card field) | R2 |
| POST | `/v1/webhooks/payments/fake-pay` (new, provider → Link) | payments | `provider_events` (dedupe), `payments`, `ledger_transactions`, `ledger_entries` (P1), `enrolments` | BR-MNY-12 (status only from webhooks), INV-01 | R2 |
| GET | `/v1/enrolments/{id}` · `/v1/me/enrolments` | enrolment | `enrolments`, `payments`, `refunds` (P-7 fields) | MKT-ENR-06/07, BR-REV-01 | R2 |
| POST | `/v1/enrolments/{id}/cancel` · `/plan/cancel` · `/refund-requests` | enrolment, payments | `enrolments`, `refunds`, ledger (P7) | MKT-ENR-08, BR-PMT-05, BR-REF-02/03 | R2 |
| POST | `/v1/groups/{id}/waitlist` | enrolment | `waitlist_entries` (offers count as holds) | MKT-ENR-09, BR-ENR-10 | R2 |
| GET | `/v1/teachers/me/enrolments` | enrolment | `enrolments` | MKT-ENR-10 | R2 |
| POST | `/v1/enrolments/{id}/accept` · `/decline` | enrolment | `enrolments`, refund on decline | MKT-ENR-10, OD-08 | R2 |
| GET | `/v1/teachers/me/earnings` | payments (report) | `ledger_entries`, `payments`, `rent_invoices` | MKT-LED-07, BR-FEE-07, OD-04 (next payout Thursday, computed only) | R2 |

### 1.5 Reviews — R2

| Method | Path | Module | Tables | Rules | Stage |
|---|---|---|---|---|---|
| POST | `/v1/reviews` | reviews | `market.reviews` (status `published`/`held`) | MKT-REV-01, BR-REV-01/02/04, CF-27 | R2 |
| GET | `/v1/me/reviews-received` ⚠ params: mock `centreId, tab`; 07 `visibility, status` | reviews | `reviews`, `review_replies`, `review_reports` | MKT-REV-03 | R2 |
| POST | `/v1/reviews/{id}/reply` · `/report` | reviews | `review_replies`, `review_reports` | BR-REV-06 (no delete or hide), `reviews.reply` | R2 |

### 1.6 Follow-up (the paid extra) — R3

Teacher (07 §2b):

| Method | Path | Module | Tables | Rules |
|---|---|---|---|---|
| GET | `/v1/teachers/me/today` | records | `session_records`, `group_sessions`, `cases` | FUP-REC-01 |
| GET | `/v1/groups/{id}/roster` | records | `record_entries`, `notes`, `signals` | BR-APR-07 |
| GET / POST | `/v1/groups/{id}/session-records` | records | `session_records` | past sessions only |
| GET / PATCH | `/v1/session-records/{id}` | records | `session_records`, `record_entries`, `assessments`, `item_scores` | score never capped (block), `record_confirmed` |
| POST | `/v1/session-records/{id}/confirm` | records → followup | + outbox `record.confirmed` → rules | FUP-REC-05, FUP-RUL-03 |
| POST | `/v1/record-entries/{id}/corrections` | records | `corrections` (append-only) | FUP-REC-08 |
| POST | `/v1/session-records/{id}/correction-requests` · `/v1/correction-requests/{id}/close` | records | `correction_requests` | CF-34 |
| POST | `/v1/voice-notes` · `/{id}/uploaded` · `/{id}/retry` | voice | `voice_notes`; S3 (aws-local, SSE); outbox `voice.uploaded` | FUP-VOI-01/06, 30-day deletion |
| GET | `/v1/voice-notes/{id}/extraction` | voice | `voice_extractions` | 503 `stt_unavailable` |
| POST | `/v1/voice-extractions/{id}/resolve-identity` · `/discard-item` | voice | `voice_extractions` | FUP-VOI-04, never guess a student |
| POST | `/v1/internal/voice-results/{id}` | voice | ai-service callback (service token + on-behalf-of) | 09 §2 |
| GET | `/v1/students/{id}` · POST `/{id}/notes` · POST `/v1/notes/{id}/suggest-for-parent` | records | `notes` | FUP-REC-10/11 |

Owner, Reception, parent (07 §2c):

| Method | Path | Module | Tables | Rules |
|---|---|---|---|---|
| GET | `/v1/centres/{id}/today` · `/students` · `/sessions` · `/activity` | followup, records, audit | read models | FUP-DSH-01/02/03/04 |
| GET / PUT | `/v1/centres/{id}/rules[/{code}]` · POST `…/approve` · `…/reject` | followup | `rules`, `rule_versions` | FUP-RUL-01/02 (staff propose, owner approves) |
| GET | `/v1/cases` · `/v1/cases/{id}` | followup | `signals`, `cases`, `case_attempts` | FUP-CAS-01/02 |
| POST | `/v1/cases/{id}/attempts` · `/dismiss` · `/reopen` · `/seat-check` | followup | `cases`, `case_attempts` | FUP-CAS-03/04/05 |
| GET | `/v1/messages` · `/v1/messages/{id}` | messaging | `messaging.messages` | masked phone |
| POST | `/v1/messages/drafts` · PATCH `/{id}` · POST `/{id}/approve` · `/revise` · `/sent-manually` | messaging | `messages`, outbox `message.approved` → gateway | FUP-MSG-01/02/03, BR-APR-11, `messages.approve`, opt-in/STOP |
| POST | `/v1/webhooks/messaging/whatsapp-fake` (new) | messaging (gateway) | `messages` status history, `inbound_messages` | BR-APR-11, dedupe on event id |
| GET | `/v1/me/updates` | messaging | `messages` (approved, own children) | FUP-MSG-08, OD-41, `followupExtra` |
| GET | `/v1/me/centre-groups` | groups | — | CF-39 (marketplace off only) |
| GET / POST | `/v1/assistant/briefing` · `/turns` · `/transcribe` | assistant | — | **Off in live** unless a local LLM is configured; the scripted demo assistant never runs in live (R3.4) |

### 1.7 Demo and dev-only controls (local only, `APP_ENV=local`)

| Path | Today (mock) | In live (core-api `DevModule`, not registered unless `APP_ENV=local`) | Stage |
|---|---|---|---|
| `GET /__demo/state[/{lang}]`, `POST /__demo/settings` | mock | flags + counts from Postgres | R1 |
| `POST /__demo/reset` · `/__demo/story/reset` | mock | truncate the demo schemas, re-run `seed:demo` | R1 (reset), R2 (story) |
| `POST /__demo/story/jump` | mock | replays steps 1…N−1 through the **same services** the endpoints call | R2 (steps 1–7), R3 (8–9) |
| `POST /__demo/story/session-done` | mock | moves the story group's `group_sessions`, covered sessions and records a week back in one transaction (the mock's approach, so date rules run on real dates) | R2 |
| `POST /__demo/story/extra`, `/__demo/features` | mock | `feature_flags` per centre | R1 |
| `POST /__demo/verify-location` | mock | sets `location_status = verified` (stands in for ops) | R2 |
| `POST /__demo/provider`, `/__demo/reply` | mock | asks **whatsapp-fake** to emit delivered / failed / inbound events | R3 |
| `POST /__demo/new-day`, `/__demo/voice-result` | mock | dev-only service calls | R3 |
| `/__mock/payments/*`, `/__mock/fawry/*` | mock | replaced by **fake-pay**'s own hosted page and Fawry "pay at outlet" | R2 |
| `/v1/pilot/*` | pilot server | unchanged; the pilot keeps its store in this phase | — |

Docs-only endpoints the apps don't call yet (`/v1/search/groups`, `/v1/map/centres`, rent invoices, payout accounts, balances, statements, devices, data requests, ops) are **not** built in this phase, except `POST /v1/ops/reviews/{id}/decision` if review moderation needs it (R2, reports stay `pending` otherwise).

---

## 2. Contract differences to settle (docs win)

| # | Mock / client today | docs/07 | Change (same commit, mock + client + docs where 07 is silent) | Stage |
|---|---|---|---|---|
| D1 | `POST /v1/centres/{id}/staff/invites` | `POST /v1/centres/{id}/staff` | Rename in mock and client | R1 |
| D2 | `/v1/me/reviews-received?centreId&tab` | `?visibility&status` | Keep `centreId`; map tabs to `visibility` (`public`/`private`) and `status=reported` | R2 |
| D3 | `GET /v1/rooms/search?students&weekdays&maxKm` | `?lat&lng&radiusKm&minCapacity&weekday&…` | Use 07's names; `lat/lng` default to the teacher's saved area | R2 |
| D4 | `GET /v1/teachers/me/bookings` | `GET /v1/room-bookings/{id}` only | Add `GET /v1/room-bookings?scope=mine` to 07; rename | R2 |
| D5 | `GET /v1/centres/{id}/profile` | — | Add to 07 (owner/staff view of C02: halls, completeness, badges, location under review) | R2 |
| D6 | `GET /v1/{centres/{id},teachers/me,me}/features` | — | Add to 07 (feature flags per scope, OD-58) | R1 |
| D7 | `/v1/assistant/turns` | `/v1/assistant/threads/…` (§3, later) | Keep the mock path; Ask Link stays off in live; settle when it ships | R3 |
| D8 | No `/v1/auth/refresh`, `/logout` | in 07 | Add to the mock (no-op rotation) so both modes share the client | R1 |
| D9 | `PATCH /v1/me`, `/v1/me/consents` in client, not in mock | in 07 §2a | Add to the mock | R1 |
| D10 | `phone_e164` plaintext in `identity.users` (06) | 10 §5: phones envelope-encrypted with an HMAC for lookup | **Your R1 asks for HMAC + encrypted.** Change 06 `users`: `phone_hmac bytea UNIQUE` + `phone_enc bytea` (AES-256-GCM, key from the local KMS), no plaintext column; migration 0004 moves the seed | R1 |
| D11 | `x-fake-pay-signature`, `/__mock/payments` | `PaymentProvider.verifyWebhook` | The adapter verifies; the hosted page is fake-pay's | R2 |

---

## 3. Schema plan

Existing: **0001** extensions, schemas, roles (`app_user`, `app_worker`, `app_ops`, all `NOBYPASSRLS`), RLS context helpers (`platform.ctx_*`), shared triggers · **0002** outbox, inbox, idempotency keys, feature flags, audit (partitioned, append-only) · **0003** users, role_assignments, curricula, school_years, academic_terms, subjects, centres, teachers, teacher_subjects, rooms, commission_rules (exclusion constraint per kind and scope). Tool: dbmate (`pnpm db:migrate`), plain SQL, one migration per bounded change, every one with a working `-- migrate:down`. Row types are generated with `kysely-codegen` (`pnpm db:types`) and CI fails on drift.

| # | Migration | Tables / changes (06 section) | RLS (06 codes) | Invariants and triggers | Stage |
|---|---|---|---|---|---|
| 0004 | `identity_auth` | `users`: `phone_hmac`, `phone_enc` replace `phone_e164` (D10); `auth_sessions`; `devices` (§1) | SELF, SYSTEM | refresh-token reuse revokes the chain | R1 |
| 0005 | `org_people` | `guardians`, `students`, `student_guardians`, `consent_events` (append-only), `leads`, `verification_checks` (§3); `school_years.short_name_*` (P-4); `centres.location_status` (CF-44) | GUARDIAN, CENTRE, TEACHER (own groups), OPS | `consent_events` append-only; guardian phones HMAC + encrypted | R1 |
| 0006 | `platform_flags_scope` | `feature_flags` gains scope (`global` / `centre` / `teacher`) + `followupExtra`, `marketplace` rows; durable idempotency for money (exists, 0002) | SYSTEM, OPS | one value per (key, scope, scope_id) — `NULLS NOT DISTINCT` | R1 |
| 0007 | `market_rooms_requests` | `room_open_slots`, `teacher_applications`, `room_bookings`, `room_booking_slots` (§4) | CENTRE, TEACHER (own), PUBLIC view of listed halls | **no double booking**: exclusion constraint on (room, weekday, time range, active dates) with `btree_gist` | R2 |
| 0008 | `market_groups_sessions` | `groups`, `group_sessions` (§4) | PUBLIC view (published), TEACHER, CENTRE | seat cap ≤ room capacity (trigger); sessions only inside the booking's dates | R2 |
| 0009 | `market_enrolment` | `enrolments` (8-state CHECK), `waitlist_entries` (§4) | GUARDIAN (own children), TEACHER, CENTRE | **INV-05 seat guard trigger** on `confirmed`/`awaiting_teacher`/`offered`; one live enrolment per (group, student) — BR-ENR-08 partial unique | R2 |
| 0010 | `ledger_core` | `payments`, `payment_mandates`, `provider_events`, `refunds`, `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `rent_invoices`, `payout_accounts`, `payouts`, `payout_items` (§5) | payer / payee only; never cached | **INV-01 balance**: deferred constraint trigger, Σ debit = Σ credit per transaction; entries append-only; `provider_events` unique (provider, event_id); rates snapshotted on the payment | R2 |
| 0011 | `market_reviews` | `reviews`, `review_replies`, `review_reports`, `review_stats` (§4) | PUBLIC (published), author, target, OPS | no DELETE grant for targets (BR-REV-06) | R2 |
| 0012 | `search_views` | public views `market.public_centres`, `public_teachers`, `public_groups` (no phones, no student data) | PUBLIC | — | R2 |
| 0013 | `records` | `session_records`, `record_entries`, `assessments`, `assessment_items`, `item_scores`, `corrections`, `correction_requests`, `notes` (§6) | TEACHER (own groups), CENTRE | corrections append-only; scores never above max (CHECK) | R3 |
| 0014 | `voice` | `voice_notes`, `voice_extractions` (§6) | TEACHER (author), CENTRE (no audio) | audio key only (S3), deletion date | R3 |
| 0015 | `followup` | `rules`, `rule_versions`, `signals`, `cases`, `case_attempts` (§7) | CENTRE, TEACHER (read own groups) | one open signal per (rule, student, group) | R3 |
| 0016 | `messaging` | `messages`, `inbound_messages`, `notification_log` (§8) | CENTRE, GUARDIAN (approved only) | approved text locked (trigger) | R3 |

RLS everywhere: every tenant table has `centre_id` and a `CENTRE` policy on `app.centre_ids`; teachers reach rows through `app.teacher_id`; parents through `app.guardian_id`. Public reads go through views only.

---

## 4. Stack check — confirmed, with three specifics

**NestJS 11 (Node 24) + Kysely on `pg` + dbmate + Redis (two instances: cache and state) + Moto (aws-local) for S3 / SNS / SQS / KMS** — as ADR-0001, ADR-0003 and ADR-0006 decide. I see no reason to change any of them: the schema already depends on what only SQL-first tooling handles (RLS, exclusion constraints, `NULLS NOT DISTINCT`, PostGIS), and the money and seat logic need one transaction around the change, its audit row and its outbox event, which the modular monolith gives.

Three choices the ADRs leave open, made here:
1. **Contract from code via Zod.** Request and response schemas are Zod objects in `apps/core-api/src/contract/`, named exactly as today's types (`GroupSummary`, `Enrolment`, …). `nestjs-zod` validates and emits OpenAPI 3.1; `openapi-typescript` generates `packages/api-client/src/generated.ts`; the hand-written type files become re-exports of the generated names, so app code does not change. `pnpm openapi:check` regenerates and fails on a diff (CI). The mock handlers import the same generated types, so mock and live cannot drift silently.
2. **Jobs and events locally.** The outbox relay publishes to SNS (aws-local); each consumer group reads its own SQS queue with a DLQ (ADR-0003). Scheduled jobs (hold expiry, release, held sessions, nightly seat rebuild) run in the **worker** entrypoint with a Redis lock (`SET NX PX`) so only one instance runs each.
3. **Auth transport.** JWT (`jose`) access tokens (15 min) and rotated refresh tokens (30 days) in `auth_sessions`. On web they are **httpOnly cookies**, made same-origin by a Next.js rewrite (`/v1/*` → core-api), so no CORS credentials and `SameSite=Lax` holds; mutating calls also send a CSRF header. The teacher app keeps the refresh token in `expo-secure-store` (falls back to memory on Expo web, where SecureStore does not exist).

Logging: `pino` JSON with redaction of phones, names and tokens; request IDs from `x-request-id`; OpenTelemetry later. Errors: one RFC 9457 filter with stable `code`s. ai-service stays as it is (local Whisper + Ollama, data guard, `link_nlp`); core-api calls it with a service token.

---

## 5. Live mode in the apps

- `API_MODE=live` already exists in both apps (`resolveApiMode`). Live points web to its own origin (rewrite to core-api :4000) and the teacher app to `EXPO_PUBLIC_API_BASE_URL`.
- **Sign-in screens** (P01, A18, T14) already call `requestOtp` / `verifyOtp`; in live the code comes from **sms-sink** (`http://localhost:8093` after the move in §6). The sample one-tap buttons stay in mock modes only.
- **The same Playwright specs** run in both modes through `playwright.live.config.ts`: a fixture reads the SMS code from sms-sink instead of typing `123456`, and the outside-world calls (`/__demo/*`) go to core-api's DevModule instead of the mock server.
- **`pnpm seed:demo`** loads the story's people, centre, halls, rooms, groups and follow-up world into Postgres (sample data only, fixed IDs, idempotent).
- **`pnpm dev`** starts infra (docker compose), runs migrations, then core-api (api + worker + gateway), ai-service, web and the teacher app, like `pnpm demo` does today.

---

## 6. Risks and how each is tested

| Risk | Why it is hard | How it is tested |
|---|---|---|
| **Seat holds** (Redis Lua acquire / commit / release) | Seats count per session; a monthly plan covers a month of sessions; holds live only in Redis while the DB sees committed rows; waitlist offers count as holds | `pnpm test:money` seat suite (08 §9): a per-session and a monthly buyer in one session; a hold covering a full session fails as a whole; waitlist offers count; a late payment confirms only with a seat in every covered session; **concurrency test**: 50 parallel holds for the last seat → exactly one wins; Redis flushed mid-test → `MISS` path rebuilds from the DB; the DB guard trigger refuses an over-cap confirm even if Redis is wrong |
| **The ledger** | Every money event is a balanced transaction, idempotent, rate-snapshotted, rounded down; J07 and C07 are reports over it | DB trigger rejects an unbalanced transaction (INV-01); **property tests** (fast-check): random event sequences keep Σ = 0 and the INV-15 balance rules; **golden tests**: worked examples **A–I** of 01 §13 to the piaster (your note says A–H; 08 §9 lists A–I — Example I is the rent floor and carry-over, with the P12 posting); every webhook and job runs twice and the second run changes nothing; R2 report shows the story payment's entries as a table |
| **RLS** | One missed policy leaks another centre's data; a teacher works across centres | `pnpm test:rls`: two seeded centres; for **every endpoint** in the OpenAPI document, a user of centre A gets **404** for centre B's resources (generated from the spec, so a new endpoint is covered by default); a direct SQL suite runs as `app_user` with each context and checks every table has RLS enabled and a policy |
| Contract drift (mock ↔ live) | Two implementations of one contract | Generated types shared by both; the same e2e specs in both modes; `openapi:check` in CI |
| Story "session done" in live | The mock moves one group's calendar; live must do the same to real rows | One dev-only transaction moving `group_sessions`, covered sessions and records; the story spec runs it in both modes |
| Windows + Docker Desktop | Ports already taken (5432), path quirks, slow volumes | Host ports configurable (ADR-0006); R4 timed run on this machine |
| **Port clash** | sms-sink and ai-service both default to **8090** | Move sms-sink to **8093** in R1 (8092 is reserved for `oidc-stub`; docs/14, compose, `.env.example`) |
| Moto queues are in memory | A restart loses events in flight | The relay re-publishes outbox rows not yet seen in each consumer's inbox after a grace period (local only); consumers are idempotent anyway |
| Cookie auth | Cross-origin cookies, CSRF | Same-origin rewrite; CSRF header on mutations; e2e signs in through the real screens |
| Size of the follow-up port (R3) | ~40 endpoints of rules, cases, messages, voice | Port module by module behind the same specs; the mock's unit tests become core-api service tests |
| The pilot | Its store is the mock's follow-up module | Untouched this phase; its e2e suite keeps running in CI |

---

## 7. Estimate per stage (agent-hours, honest)

| Stage | Scope | Agent-hours | You can click |
|---|---|---|---|
| **R1** | core-api skeleton (3 entrypoints, config, health/ready, errors, request IDs, logs), contract pipeline + `openapi:check`, migrations 0004–0006, RLS suite, OTP + tokens + cookies, sign-up (parent, teacher), C01, staff invites, audit / idempotency / outbox / inbox / DLQ / flags, live mode in both apps, `seed:demo`, `pnpm dev` | **35–50** | Sign in as owner, teacher and parent with codes from sms-sink; C01; invite Reception |
| **R2** | halls, schedule, requests, groups and sessions, search with PostGIS, enrolment with Lua holds + expiry worker + guard trigger, waitlist, fake-pay adapter (checkout, Fawry, signed webhooks), ledger + property and golden tests, J07/C07 from the ledger, reviews | **70–100** | Story steps 1–7 in live; the ledger table for the story payment |
| **R3** | records, corrections, notes, voice through S3 → ai-service, rules engine (4 rules, versions, proposals), signals, cases, outcomes, messages + approval, WhatsApp fake + gateway + manual send, activity log, `followupExtra` enforced on the server, Ask Link off in live | **50–70** | The full 9-step story in live |
| **R4** | `pnpm setup` from a clean clone, Windows timing, `docs/RUNNING.md`, app map "Live / Mock" column, sample-only list, go-live switches table | **8–12** | `pnpm setup && pnpm dev` from a fresh clone |
| **Total** | | **≈ 165–230** | |

These are focused hours; wall-clock time is longer because each stage re-runs the full mock and live suites. R2 carries the most risk (money and seats); if it runs long, I stop at the end of a sub-step and report rather than cut tests.

---

## 8. Decisions I need from you before R1

1. **D10 — phone storage:** OK to change docs/06 `users` to `phone_hmac` + `phone_enc` (no plaintext), following 10 §5?
2. **D1–D9 — contract differences:** OK to rename the mock and client paths to docs/07, and to add D4, D5, D6 to docs/07?
3. **Golden tests:** worked examples **A–I** (08 §9), not only A–H — agreed?
4. **sms-sink port:** move it to 8093 (8092 is reserved for `oidc-stub`) so it no longer clashes with ai-service on 8090?
5. **CI:** run the live e2e (docker services on GitHub Actions) on every push from R2 on, or on demand (`workflow_dispatch`) first?

---

## 9. Progress

### R1 — platform and accounts (built 2026-10-09)

Decisions applied: D1–D11 (§2), phones as `phone_hmac` + `phone_enc` + `phone_last4`, sms-sink on 8093.

Built: core-api with the `api`, `worker` and `gateway` entrypoints; contract in Zod → `openapi.json` → generated client types (`pnpm openapi:check` in CI); migrations 0004–0005; RLS context loaded per transaction; OTP, tokens (cookies on the web, Bearer in the app); parent/teacher sign-up, children, consents, C01 → pending centre, owner-only staff invites (SMS through the outbox → SNS → SQS → consumer, inbox dedupe, DLQ); idempotency; audit in the same transaction; scoped feature flags; `pnpm seed:demo`; `pnpm dev` in live mode; `pnpm test:api` / `test:rls` on `link_test`; `apps/web/e2e-modes` passing in mock and live.

Differences from this plan, decided while building:
- Migration 0006 was not needed: `platform.feature_flags` already had scopes (0002). The schema plan's numbers after 0005 shift down by one.
- Locally the field-encryption key comes from `.env.local` (`FIELD_KEY_LOCAL`): aws-local keeps KMS keys in memory, so data encrypted with them would not survive a restart. KMS stays the design elsewhere (10 §5).
- core-api runs with `tsx` (no build step) locally; a production build arrives with deployment.
- `GET /v1/feature-flags` added (07) so the web reads flags from the server in live mode.
- Ops users are not seeded with phones that sign in: ops use SSO (MKT-OPS-08), not in this phase.

