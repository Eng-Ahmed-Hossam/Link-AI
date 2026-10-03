# 12 · Backlog — Phase 1 (marketplace and payments)

Epics → stories. Each story points to requirement IDs in [02-prd-phase1-marketplace.md](02-prd-phase1-marketplace.md) and rule IDs in [01-business-rules.md](01-business-rules.md).

**Sizes:** S = 1–2 dev-days · M = 3–5 dev-days · L = 6–10 dev-days. Any story bigger than L must be split before it starts.

**Definition of done (every story):** code + tests (unit, and integration for money and RLS) · OpenAPI updated and client regenerated · AR + EN strings · RTL checked · audit events written · feature flag where risky · docs updated if a rule changed.

> **Do not start coding until the team has reviewed this file and [13-open-decisions.md](13-open-decisions.md).**

---

## E0 · Foundations and platform

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E0-01 | Monorepo scaffold (pnpm + Turborepo), lint, format, typecheck, CODEOWNERS | ADR-0004 | — | S |
| E0-02 | CI (GitHub Actions): lint, typecheck, tests, build; OpenAPI drift check; event-contract check | 05 §9, [14](14-dev-environment.md) | E0-01 | M |
| E0-03 | Terraform `dev` + `staging`: network, Postgres (PostGIS, pgvector, btree_gist), Redis ×2, object storage + KMS, queue + DLQ, secrets. **Synthetic data only** — does not wait for OD-26. | 05 §1 | OD-31 | L |
| E0-04 | core-api skeleton: NestJS module layout, config, health, OpenAPI generation, RFC 9457 errors, request IDs | 07 §1 | E0-01 | M |
| E0-05 | Migrations + schemas + extensions + `app_user` role + RLS context middleware + cross-tenant test harness | BR-DAT-01, 10 §2 | E0-04 | M |
| E0-06 | Outbox table + relay worker + inbox dedupe + DLQ + replay CLI | ADR-0003 | E0-05 | M |
| E0-07 | Idempotency middleware (Redis + durable Postgres copy for money) | BR-MNY-04 | E0-05 | S |
| E0-08 | Audit interceptor (same transaction) + append-only audit table | BR-APR-06 | E0-05 | S |
| E0-09 | Feature flags (global / centre / teacher), cached per pod | 05 §5 | E0-05 | S |
| E0-10 | Observability: OpenTelemetry, Sentry, JSON logs with redaction, PostHog without personal data | NFR-07, NFR-08 | E0-04 | M |
| E0-11 | `packages/ui`: tokens (incl. `Link/Web/*`), fonts, Button, Status, Logo; RTL utilities; web + React Native | 11 | E0-01 | M |
| E0-12 | `packages/i18n`: ICU messages, AR/EN, missing-key CI check | RTL-08, RTL-11 | E0-01 | S |
| E0-13 | `packages/api-client` generated from OpenAPI | 07 §1 | E0-04 | S |
| E0-14 | App shells: `apps/web` (public / parent / centre route groups), `apps/teacher-app` (Expo), `apps/ops` (SSO stub) | 05 §1 | E0-11, E0-12, E0-13 | M |
| E0-15 | Provider adapter base: timeouts, retries, breakers, cost and latency logging, webhook signature base | 05 §7 | E0-04 | M |

## E1 · Identity and access

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E1-01 | OTP request/verify, Redis state, rate limits, SMS adapter (sandbox) | MKT-ACC-01 | E0-05, E0-15, OD-45 | M |
| E1-02 | JWT access + rotating refresh tokens, sessions, logout | MKT-ACC-04 | E1-01 | M |
| E1-03 | Roles, role switching, `/me`, language; terms/privacy consent by `user_id` | MKT-ACC-02, MKT-ACC-03 | E1-02 | S |
| E1-04 | Children + guardian profile + `consent_events` (`child_data_processing`) | MKT-ACC-05, BR-DAT-03 | E1-03, E2-01 | S |
| E1-05 | Centre staff invites, permissions, `perms:` cache | MKT-ACC-06 | E1-03, E3-01 | M |
| E1-06 | Ops SSO + IP allow-list + `link_ops` permissions and bundles | MKT-OPS-08, OD-37 | E0-14 | S |
| E1-07 | Push devices: `POST /v1/me/devices`, `DELETE /v1/me/devices/{id}`, invalid-token clean-up | MKT-NTF-02 | E1-02 | S |
| E1-08 | Change staff permissions: `PATCH /v1/centres/{id}/staff/{userId}` (cache cleared at once, audited) | MKT-ACC-06 | E1-05 | S |

## E2 · Reference data

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E2-01 | Curricula, school years, terms, subjects: tables, proposed seed (marked unconfirmed), public endpoints | OD-07 | E0-05 | S |
| E2-02 | Ops editor for reference data | MKT-OPS-07 | E2-01, E12-01 | S |

## E3 · Centres

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E3-01 | Join request (C01) → centre `pending` | MKT-CEN-01 | E1-03 | S |
| E3-02 | Verification checks + ops pipeline (L01), including new leads | MKT-OPS-01, BR-VER-01 | E3-01, E12-01 | M |
| E3-03 | Profile editor (C02): photos (signed upload), geocode on save, hours, live preview | MKT-CEN-02 | E3-01, E0-15, OD-46 | M |
| E3-04 | Halls + rent rules + open-slots grid (C05) | MKT-CEN-03, BR-RNT-01 | E3-01 | M |
| E3-05 | Centre payout account, per centre (`/v1/centres/{id}/payout-account`) | MKT-CEN-05 | E10-03 | S |

## E4 · Teachers

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E4-01 | Teacher profile (J04): subjects, availability, open to slots | MKT-TCH-01 | E1-03, E2-01 | M |
| E4-02 | eKYC adapter + flow + ops verification queue (manual review ships first) | MKT-TCH-02, MKT-OPS-02 | E4-01, E0-15, OD-19, OD-47 | L |
| E4-03 | Teacher payout account (`/v1/me/payout-account`) | MKT-TCH-03 | E10-03 | S |

## E5 · Halls and booking

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E5-01 | Hall search with PostGIS (J01) | MKT-HAL-01 | E3-04 | M |
| E5-02 | Rent estimate endpoint (J02) | BR-BKG-07 | E3-04, E8-02 | S |
| E5-03 | Request a slot; withdraw; my requests (J02, J03) | MKT-HAL-02, MKT-HAL-03 | E5-01, E4-01 | M |
| E5-04 | Centre pipeline (C06): stages, approve, decline; booking + exclusion constraint | MKT-HAL-04, BR-BKG-05 | E5-03 | L |
| E5-05 | Auto-approve rules | MKT-HAL-05, OD-38 | E5-04, E4-02 | S |
| E5-06 | Hall schedule (C03) | MKT-CEN-04 | E5-04 | M |
| E5-07 | End a booking | MKT-HAL-06, OD-33 | E5-04, E9-06 | S |

## E6 · Groups and sessions

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E6-01 | Create / edit group: seat cap ≤ hall capacity, fees, plans offered (J05) | MKT-GRP-01, MKT-GRP-02, OD-32, OD-39 | E5-04 | M |
| E6-02 | Session generation from weekly slots; cancel one session in advance | MKT-GRP-03 | E6-01 | M |
| E6-03 | Close a group | MKT-GRP-04 | E6-01, E9-06 | S |
| E6-04 | Held job (session → `held` at `ends_at`) + `POST /v1/sessions/{id}/not-held` (teacher or centre, reason, audited, locked once invoiced) | MKT-GRP-03, BR-RNT-10, OD-44 | E6-02 | S |

## E7 · Discovery and public web

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E7-01 | Search API (groups, centres, teachers), filters, best-match sort, geo cache | MKT-DSC-01, MKT-DSC-02, OD-29 | E6-01 | L |
| E7-02 | Map pins API + map/list UI (P03) | MKT-DSC-03 | E7-01, OD-46 | M |
| E7-03 | Search home (P02) with child selector | MKT-DSC-01 | E7-01, E1-04 | M |
| E7-04 | Centre page (P04) and teacher page (P05) in the PWA | MKT-DSC-04, MKT-DSC-05 | E7-01 | M |
| E7-05 | SSR SEO pages, sitemap, hreflang, JSON-LD, CDN purge on `profile.updated` | MKT-WEB-02, MKT-WEB-03, MKT-WEB-04 | E7-04 | M |
| E7-06 | Landing page from Figma `68:605` (frame `68:616`, `Link/Web/*` styles, web Button and FAQ components); "Get started" form → `POST /v1/leads`; Phase 1 copy flags (OD-48); "Content to confirm" items cleared | MKT-WEB-01, OD-48 | E0-11, E0-14 | M |

## E8 · Payments core and ledger

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E8-01 | Ledger schema, posting service, balance invariant trigger, property tests | MKT-LED-01, INV-01, ADR-0002 | E0-05 | L |
| E8-02 | Commission rules: lookup, snapshots, `scope_id` exclusion, ops editor | MKT-LED-02, MKT-OPS-06, OD-01, OD-02, OD-16 | E8-01, E12-01 | M |
| E8-03 | Payment provider adapter #1 (sandbox): hosted checkout, webhook verify, `provider_events` dedupe | BR-MNY-06, BR-MNY-12, OD-04 | E0-15 | L |
| E8-04 | Payments + state machine + P1 posting on webhook | 08 §2 P1 | E8-01, E8-03 | M |
| E8-05 | Fawry reference flow | MKT-ENR-04, OD-09 | E8-03 | M |
| E8-06 | Card mandates + renewal charge + retries | MKT-ENR-03, MKT-ENR-11, OD-10, OD-17 | E8-04 | M |
| E8-07 | Refund engine (P7, P8, incl. provider refund fees) + provider refunds | BR-REF-01, BR-REF-02, BR-REF-05, BR-FEE-05, OD-15, OD-20 | E8-04 | M |
| E8-08 | Mobile wallet flow (single month and per session) through the provider | MKT-ENR-05 | E8-03 | M |

## E9 · Reservation and enrolment

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E9-01 | **Per-session seat accounting:** Redis Lua `acquire_hold` / `commit_hold` / `release_hold` across every covered session (08 §4); `POST /v1/enrolments`; hold-expiry worker → `expired`; DB guard trigger (committed enrolments + offered waitlist entries); nightly `seats:` rebuild | MKT-ENR-02, BR-ENR-01, BR-ENR-02, BR-ENR-13, INV-05 | E6-02, E0-07 | L |
| E9-02 | Choose group + checkout UI (P06, P07): plans ("monthly plan"), methods, consent | MKT-ENR-01, MKT-ENR-02, OD-25 | E9-01, E8-03 | M |
| E9-03 | Saga: webhook → `confirmed`; a failed attempt keeps `pending_payment` and prompts a retry; `cancelled` only on parent cancel; `expired` on hold run-out; late money → `expired → confirmed` or automatic refund (P10) | MKT-ENR-12, BR-ENR-04, BR-ENR-05, BR-ENR-06, BR-ENR-14, OD-09 | E9-01, E8-04, E8-07 | M |
| E9-04 | Confirmation + receipts (P08) | MKT-ENR-06 | E9-03, E13-01 | S |
| E9-05 | My children: enrolments, manage plan (P09) | MKT-ENR-07 | E9-03 | M |
| E9-06 | Cancel before first session → `cancelled` + refund request (auto-eligible, ops approve, OD-42); dispute request after | MKT-ENR-08, BR-REF-02, BR-REF-03 | E9-03, E8-07 | M |
| E9-07 | Teacher new enrolments (J06) + optional accept / decline | MKT-ENR-10, OD-08 | E9-03 | M |
| E9-08 | Waitlist: join, offers that count as holds for 24 h, `POST /v1/waitlist/{id}/accept` → hold + checkout, offer expiry → next in line | MKT-ENR-09, BR-ENR-10, OD-23 | E9-01, E9-03 | M |
| E9-09 | Funds release job (P2) | BR-REF-01, OD-11 | E9-03, E6-02 | S |

## E10 · Rent, payouts and reconciliation

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E10-01 | Rent invoice job: held sessions, %-of-fees attribution and refund adjustment (floored at 0, carried forward, P12 reversal after the booking ends), P3 deduction, statements; examples H and I golden tests | MKT-LED-03, BR-RNT-09, BR-RNT-10, OD-12, OD-13, OD-14, OD-43, OD-44 | E5-04, E6-04, E8-02 | L |
| E10-02 | Shortfall top-up checkout (P4) + reminders | MKT-LED-04, BR-RNT-08 | E10-01, E8-04 | M |
| E10-03 | Payout provider adapter + payout account verification | BR-OUT-03, OD-04 | E0-15 | M |
| E10-04 | Weekly payout job (P6): rent reserve, settled-only rule | MKT-LED-05, OD-30 | E10-03, E10-05, E9-09 | L |
| E10-05 | Daily reconciliation (P5) + issues | MKT-LED-06 | E8-04 | L |
| E10-06 | Teacher earnings (J07), `/v1/me/balance`, `/v1/me/payouts`, `/v1/me/statements.csv` | MKT-LED-07 | E10-04 | M |
| E10-07 | Centre rent income (C07) + CSV | MKT-LED-08 | E10-01 | M |
| E10-08 | Centre money endpoints per centre: `/v1/centres/{id}/balance`, `/payouts`, `/statements.csv` (owners of several centres) | MKT-LED-08, MKT-CEN-05 | E10-04, E10-07 | S |

## E11 · Reviews

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E11-01 | Create review / private feedback (P10) + eligibility | MKT-REV-01, OD-24 | E9-03 | M |
| E11-02 | Automatic checks (rule-based) + publish / hold | MKT-REV-02 | E11-01 | S |
| E11-03 | Reviews for owners and teachers (C04): reply, report | MKT-REV-03 | E11-01 | M |
| E11-04 | Rating aggregates + tag counts on profiles | BR-REV-07 | E11-02 | S |
| E11-05 | Ops moderation (L02) | MKT-OPS-03 | E11-02, E12-01 | M |

## E12 · Ops console

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E12-01 | Ops shell + audit viewer | MKT-OPS-08 | E1-06, E0-08 | S |
| E12-02 | Refunds and disputes (L03) | MKT-OPS-04, BR-REF-07 | E8-07 | M |
| E12-03 | Reconciliation issues + unmatched payments | MKT-OPS-05 | E10-05 | M |
| E12-04 | Data-subject requests: `GET /v1/ops/data-requests`, `POST …/{id}/complete` | MKT-OPS-09 | E12-01, E14-01 | S |
| E12-05 | Manual ledger adjustments: `POST /v1/ops/ledger/adjustments` (`ops.finance`, reason, balanced) | MKT-OPS-10 | E8-01, E12-01 | S |
| E12-06 | Payout monitoring + retry: `GET /v1/ops/payouts`, `POST /v1/ops/payouts/{id}/retry` | MKT-OPS-11 | E10-04, E12-01 | S |

## E13 · Notifications

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E13-01 | messaging-gateway entrypoint: SMS, push, email adapters; `notification_log` dedupe | MKT-NTF-01, OD-40 | E0-06, E0-15, OD-45 | M |
| E13-02 | AR/EN templates for every Phase 1 event | MKT-NTF-01 | E13-01 | M |

## E14 · Launch readiness

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E14-01 | PDPL: consent screens, data-subject requests (user side), retention job skeleton | 10 §3–4, OD-28 | E1-04 | M |
| E14-02 | Security: penetration test, SAST and dependency scanning, WAF rules, secrets rotation | 10 §7 | most epics | M |
| E14-03 | Load test search and checkout against NFR-03 | NFR-03 | E7-01, E9-03 | M |
| E14-04 | Prod infra, backups + restore drill, on-call and breach runbooks. **First environment with real data — gated by OD-26.** | 10 §9, OD-26, OD-27 | E0-03 | M |
| E14-05 | Pilot seed (one district), ops training | OD-06 | all | S |

## E15 · AI evaluation spike (parallel track, from M0)

Not on the Phase 1 critical path. It answers "how accurate is voice on real teacher notes?" early, so Phase 2 starts from evidence ([09](09-ai-voice-pipeline.md) §6). Scripted recordings can start at once. Consented real notes, and any vendor outside Egypt, wait for OD-26.

| ID | Story | Req | Depends on | Size |
|---|---|---|---|---|
| E15-01 | Consent pack and collection of real voice notes from pilot teachers (`ai_training_use`) | BR-DAT-03, BR-DAT-04, 10 §3 | — (real notes: OD-26) | S |
| E15-02 | Eval harness and gold set v0: WER, wrong-student rate, field F1, abstain rate, cost per note | 09 §6 | E15-01 | M |
| E15-03 | Benchmark 2–3 STT vendors + the extraction prompt (with full name tokenisation, 09 §2.4); write the results up as an ADR | 09 §2, 09 §6 | E15-02 | M |

---

## Size and effort

| | Stories | S | M | L | Dev-days |
|---|---|---|---|---|---|
| Before this pass | 85 | 24 | 52 | 9 | 234–398 |
| After this pass (all of Phase 1, incl. E15) | 96 | 32 | 54 | 10 | 254–434 |
| — of which E15 (off the critical path) | 3 | 1 | 2 | 0 | 7–12 |

Dev-days use S = 1–2, M = 3–5, L = 6–10. The change: 11 new stories (E1-07, E1-08, E6-04, E8-08, E10-08, E12-04, E12-05, E12-06, E15-01, E15-02, E15-03), and E9-01 grew from M to L for per-session seat accounting.

## Team and dates

| Item | Value |
|---|---|
| Team size (engineers) | TBD |
| Calendar weeks for Phase 1 | Dev-days ÷ (engineers × focus days per week) — fill in once the team size is known |
| M0 target date | TBD |
| M1 target date | TBD |
| M2 target date | TBD |
| M3 target date | TBD |
| M4 target date | TBD |
| M5 target date (pilot launch) | TBD |

---

## Suggested build order

The critical path is **E0 → E1 → E3/E4 → E5 → E6 → E8 → E9 → E10**. Web (E7), ops (E12) and notifications (E13) run in parallel once their dependencies land. E15 runs in parallel from M0. Every story is in exactly one milestone.

| Milestone | Goal | Stories | Exit check | Decisions needed first |
|---|---|---|---|---|
| **M0 — Ground** | Repo, CI, infra and platform pieces work end to end | E0-01, E0-02, E0-03, E0-04, E0-05, E0-06, E0-07, E0-08, E0-09, E0-10, E0-11, E0-12, E0-13, E0-14, E0-15, E2-01, E15-01 | A dummy write goes through RLS, audit and outbox to a consumer in `staging` (synthetic data) | OD-07 (seed), OD-31. **Start now:** payment-provider sandbox and onboarding (OD-04), SMS sandbox (OD-45) |
| **M1 — Supply** | Centres and teachers onboard; halls are booked; groups exist | E1-01, E1-02, E1-03, E1-04, E1-05, E1-06, E1-07, E1-08, E2-02, E3-01, E3-02, E3-03, E3-04, E4-01, E4-02, E5-01, E5-03, E5-04, E5-05, E5-06, E6-01, E6-02, E12-01, E13-01, E15-02 | A verified teacher books a hall in a verified centre and publishes a group | OD-19, OD-32, OD-38, OD-39, OD-40, OD-45, OD-46, OD-47 |
| **M2 — Demand** | Parents find groups; money moves in sandbox | E5-02, E7-01, E7-02, E7-03, E7-04, E8-01, E8-02, E8-03, E8-04, E8-05, E8-08, E15-03 | A parent finds a group, and sandbox card, Fawry and wallet payments post P1 | OD-02, OD-04 (provider), OD-15, OD-16, OD-29 |
| **M3 — Reserve** | The full reservation saga, all three plans, refunds | E5-07, E6-03, E6-04, E8-06, E8-07, E9-01, E9-02, E9-03, E9-04, E9-05, E9-06, E9-07, E9-08, E9-09, E12-02, E13-02 | Card, Fawry and wallet reservations; per-session seats; renewal; late payment; pre-first-session refund; waitlist offers; ending a booking refunds affected parents | OD-03, OD-08, OD-09, OD-10, OD-11, OD-17, OD-20, OD-22, OD-23, OD-25, OD-33, OD-42, OD-44 |
| **M4 — Settle** | Rent, payouts and reconciliation | E3-05, E4-03, E10-01, E10-02, E10-03, E10-04, E10-05, E10-06, E10-07, E10-08, E12-03, E12-05, E12-06 | One month of sandbox data reconciles to zero; payouts and statements match worked examples A–I | OD-01, OD-12, OD-13, OD-14, OD-18, OD-30, OD-43 |
| **M5 — Launch** | Reviews, SEO, landing page, hardening, pilot | E7-05, E7-06, E11-01, E11-02, E11-03, E11-04, E11-05, E12-04, E14-01, E14-02, E14-03, E14-04, E14-05 | Pen test passed; load targets met; landing page live; pilot district live with real data | OD-05 (scope only), OD-06, OD-24, OD-26, OD-27, OD-28, OD-48 |

### Risks to watch

| Risk | Mitigation |
|---|---|
| Payment-provider onboarding takes longer than coding | Request sandbox access and start the contract in M0 (OD-04); build against the adapter interface |
| eKYC provider not ready | Manual ops review path (E4-02) ships first; the contract is OD-47 |
| Overselling seats under load | Per-session atomic Redis hold + DB trigger (INV-05) + load test (E14-03) |
| Ledger drift | Property tests, daily trial balance, payouts blocked on reconciliation |
| Arabic-first quality | AR is the default in every review; native reviewer signs off on strings each milestone |
| Legal sign-off on data residency (OD-26) arrives late | `dev`/`staging` use synthetic data and don't wait; only E14-04 and real voice notes in E15 do |
| Voice accuracy unknown until Phase 2 | E15 measures it from M0 on real, consented notes |
