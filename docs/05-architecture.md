# 05 · Architecture

The agreed design is a **modular monolith** (`core-api`) plus a separate Python **`ai-service`**, a **`messaging-gateway`** and **`workers`**. Writes go through a **transactional outbox**. Reads go **cache-aside** through Redis. Every query and cache key is scoped to a centre. Every outside provider sits behind our own adapter.

Diagrams (Eraser, IDs in the [README](../README.md)): **01** System overview · **02** Backend runtime · **05** Reservation & payment · **06** Rent, Link fees & payouts · **07** Request lifecycle · **04** Voice note → parent update · **08** Student analytics loop.

Decisions: [ADR-0001](adr/ADR-0001-modular-monolith-and-ai-service.md) · [ADR-0002](adr/ADR-0002-money-piasters-double-entry-ledger.md) · [ADR-0003](adr/ADR-0003-transactional-outbox.md) · [ADR-0004](adr/ADR-0004-monorepo-layout.md).

---

## 1. Components

| Part | Technology | Responsibility | Phase |
|---|---|---|---|
| Teacher app | React Native (Expo), RTL | Teacher marketplace (J01–J07), session records, voice notes with an offline queue, SQLite offline cache | 1 (marketplace), 2 (records) |
| Parent app + public site | Next.js PWA. Public pages are server-rendered and served through the CDN. | Search, map, profiles, reservation, payment, reviews; SEO pages; landing page | 1 |
| Owner / staff web | Next.js, desktop-first | Centre profile, halls, requests, schedule, rent income, reviews; Phase 2 follow-up workspace | 1, 2 |
| Ops console | Internal Next.js app behind SSO + IP allow-list | Verification, moderation, refunds, disputes, reconciliation, commission rules, reference data | 1 |
| **core-api** | TypeScript, NestJS modular monolith; REST + OpenAPI (typed client generated); SSE for assistant replies | All business logic. The core-api **codebase** — its api, workers and gateway entrypoints — is the only writer to PostgreSQL; ai-service never writes | 1 |
| **workers** | Same codebase as core-api, worker entrypoint | Payouts, reconciliation, rent invoices, renewals, reminders, hold expiry, outbox relay, mastery and trend jobs, audio clean-up, retention | 1 |
| **messaging-gateway** | Same codebase as core-api, gateway entrypoint | SMS OTP, push, email; WhatsApp Cloud API sender (Phase 2); inbound webhooks (replies, delivery status) | 1 (SMS, push, email), 2 (WhatsApp) |
| **ai-service** | Python, FastAPI | Speech-to-text, clean-up, roster name matching, record extraction (strict JSON schema + confidence), message drafting, reply triage, focus plans, review moderation classifier, search-query parsing; model gateway (routing, retries, redaction, cost) | 2 (Phase 1 only if the moderation classifier is switched on) |
| PostgreSQL | Managed, multi-zone primary + read replicas, PITR; PostGIS, pgvector | System of record. One schema per bounded context. RLS per centre. | 1 |
| Redis | Two logical instances: **cache** (`allkeys-lru`) and **state** (`noeviction`) | Cache-aside reads; OTP, rate limits, seat holds, idempotency, locks | 1 |
| Object storage | S3-compatible, SSE-KMS | Voice audio (deleted after 30 days), centre photos, ID documents, exports — signed URLs only | 1 |
| Queue | Managed (SQS/SNS or Pub/Sub; OD-31) | At-least-once delivery, dead-letter queues | 1 |
| Edge | CDN + WAF, load balancer, API gateway | TLS, bot filtering, JWT check (cached JWKS), rate limits, routing, request ID | 1 |

**Never cached:** ledger, payment status, consent.

## 2. Bounded contexts and modules in core-api

Each module owns its tables. A schema groups the tables of one bounded context.

| Schema | Module | Owns | Phase |
|---|---|---|---|
| `identity` | identity | users, role_assignments, auth_sessions, devices, data_subject_requests | 1 |
| `ref` | reference | curricula, school_years, academic_terms, subjects, topic templates | 1 |
| `org` | org | centres, teachers, teacher_subjects, guardians, students, student_guardians, consent_events, verification_checks, leads | 1 |
| `market` | rooms | rooms, room_open_slots, teacher_applications, room_bookings | 1 |
| `market` | groups | groups, group_sessions | 1 |
| `market` | enrolment | enrolments, waitlist_entries (seat holds live in Redis) | 1 |
| `market` | search | read-only: search views and geo queries on a replica | 1 |
| `market` | reviews | reviews, review_replies, review_reports | 1 |
| `ledger` | payments | commission_rules, payments, payment_mandates, refunds, ledger_accounts, ledger_transactions, ledger_entries | 1 |
| `ledger` | rent | rent_invoices | 1 |
| `ledger` | payouts | payout_accounts, payouts, payout_items, provider_settlement_lines, reconciliation_issues | 1 |
| `ledger` | subscriptions | subscriptions (paid extras; no billing until OD-05) | 1 (table only) |
| `records` | records | session_records, record_entries, assessments, assessment_items, item_scores, corrections, notes | 2 |
| `records` | voice | voice_notes, voice_extractions | 2 |
| `followup` | followup | rules, rule_versions, signals, cases, case_attempts | 2 |
| `messaging` | messaging | messages, inbound_messages, notification_log | 1 (notifications), 2 (messages) |
| `analytics` | analytics | topics, item_topics, observation_tags, evidence, student_baselines, topic_mastery, subject_reports, focus_plans | 3 |
| `audit` | audit | audit_events | 1 |
| `platform` | platform | outbox_events, inbox_events, idempotency_keys, feature_flags, ai_usage | 1 |

### Module rules

1. A module writes **only its own tables**.
2. Another module is called only through its exported service interface. Never import its repositories or entities.
3. Reactions in another module go through **outbox events**, even inside the monolith. That lets us split a module out later without changing callers.
4. Foreign keys are allowed **within a schema** only. A cross-schema reference is a plain `uuid` column that the owning module checks.
5. Every request runs in a transaction that sets the RLS context (`app.user_id`, `app.centre_ids`, `app.teacher_id`, `app.guardian_id`, `app.roles`). See [10-security-privacy.md](10-security-privacy.md) §2.
6. Audit rows are written **in the same transaction** as the change, by a platform interceptor. (Diagram 07 shows audit as an event consumer — CF-18. A same-transaction write is stronger in a monolith. If audit later moves to its own service, it consumes outbox events instead.)

Diagram 02 lists the schemas `identity, org, market, ledger, records, followup, messaging, analytics, audit`. We add two: `ref` (reference data) and `platform` (outbox, inbox, idempotency, flags, AI cost). Diagram 01 places groups under "Organisation". Here they belong to the `market` schema, next to halls and enrolments, because their seats and fees are marketplace data.

### Deployables (diagram 02)

Phase 1 ships **four** stateless, autoscaled deployables: `core-api`, `ai-service`, `messaging-gateway` and `workers`. Each has its own IAM role and its own consumer group. Modules are split into services only when load or team size needs it.

## 3. Request lifecycle — diagram 07

### Cached read
1. The client sends a request with a JWT. The gateway checks the JWT against the cached JWKS (no network call), then checks the rate-limit token bucket in Redis.
2. core-api loads permissions from `perms:{user}:{centre}` (5 min). On a miss it loads them from Postgres with RLS on.
3. core-api reads data from the tenant-prefixed cache key. On a miss it reads from a replica with RLS on and sets the key.
4. Responses carry an `ETag`. A later `If-None-Match` gets `304 Not Modified`.
5. The teacher app keeps the roster in its offline SQLite store.

### Idempotent write + outbox events
1. The client sends a mutating request with an `Idempotency-Key`. If the key is in `idem:{key}`, the stored response is returned.
2. core-api runs **one transaction**: business change + audit row + outbox row.
3. The response is stored under the key for 24 h.
4. The outbox relay polls new rows, publishes them (partition key = aggregate ID) and marks them published.
5. Consumers skip event IDs already in their inbox table, do their work, and write their own outbox rows if needed.
6. The cache invalidator deletes the affected keys.
7. A consumer that keeps failing parks the message in the DLQ, alerts on-call, and the message can be replayed.

### Reservation & payment saga — diagram 05
See [08-payments-ledger.md](08-payments-ledger.md) §4.

## 4. Events

### Envelope

```json
{
  "id": "0192f0c4-…",              // UUIDv7, unique per event
  "type": "enrolment.confirmed",
  "version": 1,
  "occurredAt": "2026-10-03T14:05:00Z",
  "producer": "core-api/enrolment",
  "centreId": "…",                  // tenant; null for platform-wide events
  "partitionKey": "enrolment:…",    // ordering key
  "traceId": "…",
  "actor": { "type": "user", "id": "…" },   // user | system | provider
  "data": { }
}
```

Rules:
- Names are `entity.past_tense_verb`. Payloads carry IDs and amounts, **never** names, phones or free text.
- Contracts are versioned in a schema registry (`packages/config/events`). Only backward-compatible changes are allowed; a breaking change needs a new `type` or `version`.
- Delivery is at-least-once. Every consumer is idempotent through its inbox table.

### Catalogue

| Event | Producer | Main consumers | Partition key | `data` |
|---|---|---|---|---|
| `user.registered` | identity | notifications | user | `userId, roles[], language` |
| `centre.join_requested` | org | notifications (ops) | centre | `centreId` |
| `lead.submitted` | org | notifications (ops) | lead | `leadId, kind (centre\|teacher)` — from the landing-page "Get started" form |
| `centre.verified` / `centre.verification_revoked` | org | search, web cache, notifications | centre | `centreId, by, reason?` |
| `teacher.verified` / `teacher.verification_revoked` | org | search, notifications, payouts | teacher | `teacherId, method (ekyc\|manual), reason?` |
| `profile.updated` | org, groups | CDN purge, cache invalidator | target | `targetType (centre\|teacher\|group), targetId` |
| `room.updated` | rooms | cache invalidator (`avail:*`) | room | `roomId, centreId` |
| `room_request.submitted` | rooms | notifications (centre) | application | `applicationId, roomId, teacherId, centreId, slots[], startsOn` |
| `room_request.stage_changed` | rooms | notifications (teacher) | application | `applicationId, from, to, reason?` |
| `room_booking.approved` | rooms | groups, rent, notifications | booking | `bookingId, roomId, teacherId, centreId, weeklySlots[], startsOn, rentRule` |
| `room_booking.ended` | rooms | groups, enrolment, rent | booking | `bookingId, endsOn, endedBy, reason` |
| `group.published` / `group.updated` / `group.closed` | groups | search cache, enrolment | group | `groupId, teacherId, centreId, subjectId, seatCap, monthlyFeePt, sessionFeePt` |
| `session.cancelled` | groups | notifications, rent | group | `sessionId, groupId, sessionDate, reason` |
| `session.held` | groups (held job) | rent (reserve) | group | `sessionId, groupId, sessionDate` — **not** used for the release of teacher money: P2 runs from a timed job at the first session's **start** (OD-11, 08 §2) |
| `session.not_held` | groups | rent, notifications (centre, teacher) | group | `sessionId, groupId, sessionDate, reason, markedBy` |
| `enrolment.held` | enrolment | metrics | group | `enrolmentId, groupId, studentId, plan, method, sessionIds[], holdExpiresAt` |
| `enrolment.expired` | enrolment | payments (expire checkout), notifications | group | `enrolmentId` |
| `enrolment.awaiting_teacher` | enrolment | notifications (teacher) | group | `enrolmentId, teacherId, decideBy` |
| `enrolment.confirmed` | enrolment | notifications, groups (roster cache), payments (release schedule), reviews | group | `enrolmentId, groupId, studentId, guardianId, teacherId, centreId, plan, periodStart, sessionIds[], detailsShared, fromState (pending_payment \| awaiting_teacher \| expired \| past_due)` |
| `enrolment.past_due` | enrolment | notifications (parent, teacher) | group | `enrolmentId, periodStart, seatReleaseAt` |
| `enrolment.cancelled` | enrolment | payments (refund request when `refundable`), notifications | group | `enrolmentId, reason (parent_cancelled), stage (before_payment \| before_first_session), refundable, refundId?` — a failed payment never cancels (BR-ENR-05) |
| `enrolment.declined` | enrolment | payments (automatic refund), notifications | group | `enrolmentId, reason` |
| `enrolment.ended` | enrolment | groups (roster cache), notifications | group | `enrolmentId, reason (plan_stopped \| period_over \| session_done \| unpaid \| group_closed)` |
| `waitlist.seat_offered` | enrolment | notifications | group | `waitlistEntryId, groupId, guardianId, sessionIds[], offerExpiresAt` |
| `waitlist.offer_accepted` | enrolment | metrics | group | `waitlistEntryId, enrolmentId` |
| `payment.succeeded` | payments | enrolment, rent, notifications | payment | `paymentId, kind, enrolmentId?, rentInvoiceId?, amountPt, commissionPt, method, provider, providerRef` |
| `payment.failed` | payments | enrolment (no state change: stays `pending_payment`), notifications (retry prompt) | payment | `paymentId, kind, enrolmentId?, reason` |
| `mandate.charge_failed` | payments | enrolment, notifications | enrolment | `enrolmentId, attempt, nextRetryAt?` |
| `refund.issued` / `refund.failed` | payments | enrolment, notifications | payment | `refundId, paymentId, amountPt, commissionReversedPt` |
| `rent.invoiced` | rent | notifications | booking | `rentInvoiceId, bookingId, period, grossPt, linkFeePt, deductedPt, shortfallPt, dueOn` |
| `rent.settled` | rent | notifications | booking | `rentInvoiceId` |
| `rent.reversed` | rent | notifications (teacher, centre) | booking | `bookingId, refundId, unabsorbedPt, rentPt, linkFeePt, centrePt` — P12 after the booking ended |
| `payout.sent` / `payout.failed` | payouts | notifications | payee | `payoutId, payeeType, payeeId, period, netPt, reason?` |
| `reconciliation.issue_found` | payouts | notifications (ops) | provider | `issueId, provider, kind` |
| `review.submitted` / `review.published` / `review.flagged` / `review.hidden` / `review.replied` | reviews | notifications, cache invalidator | target | `reviewId, targetType, targetId, flags[]?` |
| `consent.changed` | org | messaging, analytics | person (`userId`, or `guardianId` when there is no account) | `userId?, guardianId?, studentId?, kind, granted, version` — at least one of `userId` / `guardianId` |
| `voice.uploaded` | voice | ai-service | session record | `voiceNoteId, sessionRecordId, groupId, centreId, audioKey` |
| `voice.extracted` | voice | notifications (teacher) | session record | `voiceNoteId, sessionRecordId, extractionId, needsClarification` |
| `record.confirmed` | records | followup, analytics, cache invalidator | student\* | `sessionRecordId, groupId, centreId, sessionDate, studentIds[], confirmedBy` |
| `record.corrected` | records | followup, analytics | student | `sessionRecordId, recordEntryId, studentId, field` |
| `note.saved` | records | followup (`repeated_concern`), analytics (observation tags) | student | `noteId, studentId, groupId, centreId, tag, topicId?` — sent only when the teacher saves the note, never for an AI draft |
| `quiz.scored` | records | analytics | group | `assessmentId, groupId, centreId, studentIds[]` |
| `rules.updated` | followup | followup (rebuild compiled rules) | centre | `centreId, ruleId, version` |
| `signal.candidate` | analytics (trend worker) | followup | student | `ruleId, ruleVersion, studentId, groupId, topicId?, numbers, recordRefs[]` — **only** for rule `score_decline_class_adjusted` |
| `signal.raised` | followup | notifications | student | `signalId, ruleId, ruleVersion, studentId, groupId, centreId` |
| `case.opened` / `case.updated` / `case.closed` | followup | notifications | case | `caseId, signalId, assigneeId, status, dueOn` |
| `message.drafted` / `message.approved` | messaging | messaging-gateway | case | `messageId, caseId?, guardianId, templateCode` |
| `message.status_changed` | messaging-gateway | messaging | message | `messageId, status, providerMessageId, at` |
| `reply.received` | messaging-gateway | messaging, ai-service (triage) | guardian | `inboundId, guardianId, messageId?, receivedAt` |
| `mastery.updated` | analytics | cache invalidator | student | `studentId, topicIds[], centreId, modelVersion` |
| `focus.drafted` / `focus.approved` / `focus.skipped` | analytics | notifications, messaging | student | `focusPlanId, studentId, weekOf` |

\* `record.confirmed` covers many students; consumers fan out per student.

### Who evaluates the readable rules (Phase 2–3)

One rule has one evaluator, so a flag can never be raised twice by two components.

| Rule (`rules.code`) | Evaluated by | Triggered by | Output |
|---|---|---|---|
| `consecutive_absences` | **followup module** (core-api) | `record.confirmed`, `record.corrected` | `signals` row → `signal.raised` |
| `score_decline` (Phase 2, comparable assessments) | **followup module** | `record.confirmed`, `record.corrected`, `quiz.scored` | `signals` row → `signal.raised` |
| `low_participation` | **followup module** | `record.confirmed`, `record.corrected` | `signals` row → `signal.raised` |
| `repeated_concern` (same concern 3 times) | **followup module** | `record.confirmed`, `record.corrected`, `note.saved` (a saved teacher note is confirmed input, BR-APR-08) | `signals` row → `signal.raised` |
| `score_decline_class_adjusted` (Phase 3, AN01) | **trend worker** computes; followup module saves | `quiz.scored`, `record.confirmed` | The trend worker updates `student_baselines` and emits `signal.candidate`; the followup module dedupes and saves the signal |

The trend worker does nothing else: it updates baselines and emits `signal.candidate` for `score_decline_class_adjusted`. Diagram 08 still draws all three readable rules inside the trend worker (CF-17).

## 5. Caching

Every tenant key starts with `{env}:c:{centreId}:`. Public keys start with `{env}:pub:`. TTLs are starting values to tune.

| Key (after prefix) | Holds | TTL | Instance | Invalidated by |
|---|---|---|---|---|
| `perms:{user}` | Roles and permissions of a user in this centre | 5 min | cache | role change, staff removal |
| `roster:{group}` | Roster and speech-to-text name hints | 10 min | cache | `enrolment.*`, student edits |
| `timeline:{student}` | Student timeline (Phase 2) | 10 min | cache | `record.*`, `case.*` |
| `avail:{room}:{week}` | Hall availability grid | 1 min | cache | `room.updated`, booking changes |
| `mastery:{student}:{subject}` | Topic scores (Phase 3) | 24 h | cache | `mastery.updated` |
| `report:{student}:{term}` | Subject report (Phase 3) | 6 h | cache | `mastery.updated`, `record.*` |
| `pub:profile:{type}:{id}` | Public centre / teacher profile | 1 h | cache | `profile.updated`, `review.published` |
| `pub:geo:{geohash}:{filtersHash}` | Map search results | 2 min | cache | expiry only |
| `otp:{phone}` | Code hash + attempts | 5 min | **state** | verify / expiry |
| `seats:{g:<group>}:<session>` | Committed seats in one session (rebuilt from the DB on a miss, and nightly at 03:00 Cairo — 08 §4) | none | **state** | enrolment state changes |
| `holds:{g:<group>}:<session>` | Sorted set of live holds and waitlist offers in one session | per member: 10 min (Fawry 24 h, offers 24 h) | **state** | confirm / release / expiry |
| `hold:{g:<group>}:<hold>` | The sessions one hold covers | 10 min (Fawry 24 h, offers 24 h) | **state** | confirm / release / expiry |
| `idem:{key}` | Stored response for retries | 24 h | **state** | expiry |
| `rl:{user\|ip\|phone}` | Rate-limit token buckets | rolling | **state** | — |
| `lock:{job}` | Scheduler leader lock | 60 s | **state** | job end |

In-process and device caches:

| Cache | Where | Refresh |
|---|---|---|
| JWKS and feature flags | each pod | every 5 min |
| Compiled centre rules (Phase 2) | each pod | rebuilt on `rules.updated` |
| WhatsApp approved templates | messaging-gateway | 1 h |
| Roster + queued voice notes | teacher app SQLite | on sync |
| LLM prompt cache | provider side | system prompt + tool definitions |

**Never cached:** ledger balances and entries, payment status, consent.

## 6. Resilience

| Pattern | How we apply it |
|---|---|
| Timeouts and retries | Every outbound call has a deadline. Retries use exponential back-off with jitter. Only idempotent calls are retried. |
| Circuit breakers | One per provider (payments, STT, LLM, WhatsApp, SMS, maps, eKYC). Fail fast, then fall back. |
| Bulkheads | Separate worker pools and queues per workload. AI load never blocks payments. |
| Back-pressure | Workers autoscale on queue depth. The gateway sheds load (429) when it must. |
| Idempotency | `Idempotency-Key` on every mutating POST. An inbox table for every consumer. Provider event IDs are deduplicated. |
| Transactional outbox | No dual writes. See [ADR-0003](adr/ADR-0003-transactional-outbox.md). |
| Saga with compensation | Enrolment: hold → pay → confirm, or release + refund. |
| Dead-letter queues | Messages are parked after N retries. On-call is alerted on queue depth. A replay tool is provided. |
| Graceful degradation | STT down → the teacher types the note. WhatsApp down → SMS fallback (with consent). Maps down → list view only. |
| Data safety | Multi-zone primary with automatic failover, point-in-time recovery, cross-region backup copy, regular restore drills. |

## 7. Provider adapters

Every provider sits behind an interface in core-api (or in ai-service for AI vendors). A provider is chosen by configuration. Webhooks are verified **by the adapter** before anything else.

| Adapter | Operations | Candidates |
|---|---|---|
| `PaymentProvider` | `createCheckout(order)`, `createFawryReference(order)`, `chargeMandate(token, amount, idemKey)`, `refund(paymentRef, amount, idemKey)`, `verifyWebhook(headers, body)`, `parseWebhook(body)`, `getPayment(ref)`, `fetchSettlementReport(date)` | Paymob, Fawry, Kashier |
| `PayoutProvider` | `createPayout(account, amount, idemKey)`, `getPayout(ref)`, `verifyWebhook` | Bank transfer, mobile-wallet rails |
| `EkycProvider` | `startSession(user)`, `getResult(ref)`, `verifyWebhook` | Valify, or manual review |
| `Geocoder` | `geocode(address)`, `reverse(lat, lng)` — on save only | Google Maps or similar |
| `SmsSender` | `send(phone, templateCode, params)` | Egyptian SMS aggregator |
| `WhatsAppSender` | `sendTemplate(phone, templateCode, params, lang)`, `verifyWebhook`, `parseInbound` | WhatsApp Cloud API |
| `PushSender` / `EmailSender` | `send(…)` | FCM / APNs; SES or Postmark |
| `SttProvider` (ai-service) | `transcribe(audioUri, hints[], lang)` | Chosen by benchmark (OpenAI, Google, Azure, …) |
| `LlmProvider` (ai-service, via model gateway) | `complete(prompt, schema?)` | Claude, GPT, Gemini; open Arabic models (Nile-Chat, Jais, ALLaM) |

Adapter rules: a timeout and circuit breaker on every call; no provider types leak outside the adapter; every call is logged with cost and latency; secrets come from the secrets manager.

## 8. ai-service

- **Stateless.** It gets jobs from the queue (`voice.uploaded`) or synchronous calls from core-api.
- It writes back **only through core-api's API**, acting on behalf of the user ("proposed record, acting as the teacher"). It never writes to the database directly.
- Contains a **model gateway** that routes STT and LLM calls, retries, removes phone numbers and replaces every detected person name with a `<S…>` / `<A…>` / `<U…>` token before calling an LLM ([09](09-ai-voice-pipeline.md) §2.4), uses provider prompt caching, and records the cost of every call per centre in `platform.ai_usage`.
- Every release passes the evaluation harness against the gold set first. See [09-ai-voice-pipeline.md](09-ai-voice-pipeline.md).

## 9. Environments, delivery and observability

| Item | Choice |
|---|---|
| Environments | `dev`, `staging`, `prod` — defined in Terraform (`infra/`) |
| Runtime | Containers on ECS Fargate or Cloud Run (OD-31). Autoscale APIs on CPU and workers on queue depth. |
| Delivery | GitHub Actions: lint, typecheck, tests, OpenAPI and event-contract checks, build, deploy. Blue/green deploys, with feature flags for rollouts and kill switches. Mobile builds and OTA updates via Expo EAS. |
| Tracing | OpenTelemetry. The `traceId` travels through every event. AI and message costs are recorded as span attributes. |
| Errors | Sentry, with on-call paging. |
| Logs | Structured JSON. Personal data is removed at the source. |
| Product analytics | PostHog, with **no personal data**. |
| Secrets | Secrets manager + KMS, rotated. |

### Starting SLOs (tune after launch)

| Signal | Target |
|---|---|
| core-api availability | ≥ 99.5% per month |
| API p95 latency (reads / writes) | < 300 ms / < 600 ms, not counting providers |
| Webhook → enrolment confirmed | p95 < 10 s |
| Outbox lag | p95 < 5 s |
| Voice note → draft ready (Phase 2) | p95 < 60 s for a 1-minute note |

## 10. Later (not Phase 1)

- OpenSearch with an Arabic analyser, when Postgres search is not enough (fed by a change-data-capture stream from replicas).
- A data warehouse (BigQuery or ClickHouse) with personal data removed.
- Kafka instead of SNS+SQS or Pub/Sub if event volume needs it.
- Splitting a module into its own service (the module rules in §2 keep this cheap).
