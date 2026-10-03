# Docs changelog

One line per change: file, what changed, why. Newest pass first. Review items (A1–C7) refer to the "docs fix-up pass before coding" review; R2-1…R2-12 to the round-2 fix-up.

## 2026-10-03 — Shared demo mock server

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 14 | API modes `mock` \| `mock-server` \| `live`; Demo controls env; `pnpm mock:server`, `pnpm scenario:demo-followup`, `pnpm demo`; §5.1 the demo scenario. | Demo Day: one shared mock state across apps |

## 2026-10-03 — Batch 1 sign-off fix-ups

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13 | CF-27 closed: separate review text per target on P10. | Batch 1 sign-off |
| 2 | 13, 11, 02 | CF-28 closed: no "No seats" state; pins and cards show "Waitlist only" (11 §3 map pins row, MKT-DSC-03 AC1). | Batch 1 sign-off; BR-ENR-10 |
| 3 | 13 | OD-49 added: vector source for the logo orb (raster until design supplies one; wordmark outlined under OFL). | Logo fix-up |
| 4 | 07 | New §2a "Proposed — from frontend Batch 1": shapes for `PATCH /v1/me`, `PUT /v1/me/consents`, `groupsForChild`, `schoolYear.shortName`, search `totals`, `ratingDistribution`, and the enrolment fields `teacherReviewsEnrolments`, `lastPaymentFailed`, `firstSessionStarted`, `canReview`. Not in OpenAPI yet. | The parent PWA mocks need them |
| 5 | frontend/plan.md | The Figma-to-code prompt saved as the frontend plan, with a header listing the decisions that override it. | Keep the brief in the repo |

## 2026-10-03 — Frontend Batch 1 (parent PWA)

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13 | New CF-21…CF-28 (Phase 2 copy and badges on Phase 1 screens; per-group fees; P06 tip; card methods; refund line; "Message teacher"; one text for two reviews; "No seats" vs "Waitlist only"). | Found while building P01–P10 |
| 2 | frontend/screen-log.md | Rows for P01–P10, the mock provider page and the Account tab. | Batch 1 |
| 3 | frontend/token-audit.md | Batch 1 off-token values and how they were snapped; raster logo note. | Batch 1 |

## 2026-10-03 — Walking skeleton, Part 1 (local services and database)

| # | File | What changed | Why |
|---|---|---|---|
| 1 | adr/ADR-0006 | New ADR: dbmate (SQL-first migrations), Kysely query layer, roles and credentials, Moto as the local AWS stand-in, Postgres image base, configurable host ports. | No doc chose these; LocalStack now needs an account token |
| 2 | 14 | Quick start; §1 pins Node 24 and pnpm 12.8.1; §2 service table matches `infra/local` (`aws-local` replaces `localstack`, `oidc-stub` marked not built); §3 adds the local-infra names and `env:check`; §4 lists what the seed contains so far; §5 marks each command real or planned; Windows troubleshooting. | Make the plan match reality |
| 3 | 06 | `confirmed` on every `ref` table (14 §4 already required it); subjects' same-curriculum check is a composite FK; `outbox_events` gains `partition_key`, `created_at`, `last_error` and its grants; `feature_flags.scope_id` is the all-zero UUID for global flags. | Found while writing migrations 0001–0003 |

## 2026-10-03 — Frontend Batch 0

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13 | New CF-20: Figma `Link/Elevation/Raised` is not in doc 11 §1; six tokens unverified in Figma. | Token audit (`docs/frontend/token-audit.md`) |
| 2 | adr/ADR-0005 | New ADR "Frontend stack", including the CLAUDE.md gate waiver for frontend work. | Batch 0 |
| 3 | frontend/ | New `screen-log.md`, `token-audit.md`, `README.md`. | Batch 0 |

## 2026-10-03 — Round 2 fix-up

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 01 | BR-ENR-05: a failed payment attempt keeps `pending_payment` (hold keeps running, parent notified, can retry); only the hold running out → `expired`; `cancelled` = parent cancel only. | R2-1 |
| 2 | 08 | §4 sequence: failed attempt keeps `pending_payment`; new branch "parent cancels before paying". State diagram: removed `pending_payment → cancelled: payment failed`; added a self-transition for failed attempts and `pending_payment → cancelled` on parent cancel. States table notes `cancelled` = parent cancel only. Payment states: a failed payment is one attempt; retry creates a new payment. Supersedes changelog row 12 of the fix-up pass. | R2-1 |
| 3 | 05 | `enrolment.cancelled` reason is `parent_cancelled` only, with `stage (before_payment \| before_first_session)`; `payment.failed` causes no enrolment state change. | R2-1 |
| 4 | 02, 07, 06, 12, 13 | MKT-ENR-12 AC3 (failed attempt); `/checkout` can be retried; `/cancel` is the only path to `cancelled`; `hold_expires_at` note; E9-03 reworded; OD-09 updated. | R2-1 |
| 5 | 01 | BR-RNT-09: an adjustment larger than the month's fee base floors rent at 0 and carries the rest; after the booking ends the rent share is reversed (P12). New worked example I. | R2-2 |
| 6 | 08 | New posting P12 (rent reversal: Dr `centre_available` + Dr `link_revenue:rent_fee` / Cr `teacher_available`); §6 step 1 floors rent at 0 and carries; §9 golden test for example I. | R2-2 |
| 7 | 06 | `rent_invoices.fees_base_carried_pt`; rent formula uses `max(0, …)`; ledger kind `rent_reversal`; INV-15 exception for P12. | R2-2 |
| 8 | 05, 13, 12, 14, CLAUDE.md | Event `rent.reversed`; OD-43 updated; E10-01 and the M4 exit check cover examples H and I; test commands say A–I. | R2-2 |
| 9 | 06 | `payments.provider` CHECK allows `fake`, forbidden in prod by a prod-only migration and an app start-up check; same rule for other provider columns. | R2-3 |
| 10 | 14 | New local service `oidc-stub`; ops seed users ("agent" and "finance" bundles) sign in through it, never with phone OTP; `fake` provider note. | R2-4 |
| 11 | 01 | BR-APR-08: a note the teacher saves is confirmed input (never an AI draft) and can trigger `repeated_concern`. | R2-5 |
| 12 | 03, 04, 05 | FUP-RUL-03 AC1 and ANL-EVD-03 AC2 add `note.saved`; 05 rule table uses `note.saved`; new event `note.saved` in the catalogue. | R2-5 |
| 13 | 05 | `session.held` no longer lists "payments (release P2)"; release stays at the first session's start (OD-11, 08 P2). | R2-6 |
| 14 | 06 | `consent_events.user_id` nullable when `guardian_id` is set; `CHECK (user_id IS NOT NULL OR guardian_id IS NOT NULL)`; current state per `(COALESCE(user_id, guardian_id), student_id, kind)`; RLS adds `GUARDIAN`. | R2-7 |
| 15 | 10, 05 | Consent text and `consent.changed` payload cover account-less guardians. | R2-7 |
| 16 | 10, 13, 06 | Leads retention row in 10 §4 (not converted: deleted after 6 months; converted: personal fields wiped) and in OD-28; 06 `leads` note points to it. | R2-8 |
| 17 | 07, CLAUDE.md | "Teacher money" heading retitled; only the four money endpoints under `/v1/me/` are teacher-only; CLAUDE.md money line made precise. | R2-9 |
| 18 | 11 | `Link/Web/Body` = Plus Jakarta Sans Regular 16 / 1.62; `Link/Web/AR Body` = Cairo SemiBold 16 / 1.70. | R2-10 |
| 19 | 02, 06 | MKT-GRP-02 AC2: the seat cap can't go below the most seats used in any future session; `groups.seat_cap` trigger note. | R2-11 |
| 20 | 08, 06, 05, 12 | DB guard counts committed enrolments + offered waitlist entries (holds live only in Redis); nightly 03:00 rebuild of `seats:` counters; INV-05 "enforced by", caching row and E9-01 updated. | R2-12 |

## 2026-10-03 — Fix-up pass before coding

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13 | CF-08 set to `superseded`: "page exists; the earlier read only loaded the first page". Added a Status column to all CF rows. | A1 — landing page exists (`68:605`) |
| 2 | 02 | MKT-WEB-01 rewritten: build from Figma `68:605` / `68:616`, sections in order, Phase 1 copy flags, lead form, motion. Screen map updated. | A1 |
| 3 | 11 | Landing page added to the screen inventory (W00–W03 with node links, 13 sections); `Link/Web/*` styles; `Link Web / Button` and `Link Web / FAQ item` components; taken off the list of designs still to make; note that the file has two pages. | A1 |
| 4 | 12 | E7-06 no longer blocked on design; the landing-page design risk row deleted. | A1 |
| 5 | 13 | Added OD-48 (landing-page message and Phase 1 copy) and CF-19 (landing page leads with Phase 2 features and says "rent rooms by the session"). | Found while reading the landing page for A1 |
| 6 | 05, 06, 07 | Added `POST /v1/leads`, table `org.leads`, event `lead.submitted` for the landing page's "Get started" form. | A1 — the form exists in the design |
| 7 | 06 | §0: `CREATE EXTENSION btree_gist`; new "NULLs in keys" convention (`UNIQUE NULLS NOT DISTINCT`). | A2 |
| 8 | 06 | `payouts` unique key → `UNIQUE NULLS NOT DISTINCT (teacher_id, centre_id, period)`; INV-14 updated. | A2 — one ID is always NULL |
| 9 | 06 | `role_assignments` partial unique → `NULLS NOT DISTINCT`. | A2 |
| 10 | 06 | `commission_rules`: generated `scope_id` and `validity`; exclusion on `(kind, scope_id, validity)`; INV-13 updated. | A2 — global defaults could overlap |
| 11 | 06 | `room_open_slots` exclusion written out with a `minutes` range; `btree_gist` noted on all exclusion constraints. | A2 |
| 12 | 08 | §4 state machine: added `expired`; `pending_payment → cancelled` only on payment failure; `expired → confirmed` on late money with seats; `confirmed → cancelled` on parent cancel; removed `refunded`; added a states table with live/seat/event columns. | A3 |
| 13 | 01 | BR-ENR-05 (`cancelled` vs `expired`), BR-ENR-06 (late money), new BR-ENR-14 (the 8 states), BR-REF-02 (cancel → `cancelled` at once; refund lives in `refunds`). | A3 |
| 14 | 06 | `enrolments.status` CHECK = the 8 states; notes on the partial unique index and late confirmation; `refunds.auto_eligible`, `refunds.enrolment_id`. | A3 |
| 15 | 05 | Events: `enrolment.expired` replaces `enrolment.hold_expired`; added `enrolment.past_due`, `enrolment.ended`; `enrolment.cancelled` and `enrolment.declined` split with payloads. | A3 — one event per state |
| 16 | 02 | MKT-ENR-04 (Fawry → `expired`), MKT-ENR-08 (cancel → `cancelled`, refund status separate), MKT-ENR-12 (late money). | A3 |
| 17 | 13 | OD-09 (hold run-out and late money) and OD-42 (cancel → `cancelled`, refund in `refunds`) updated. | A3 |
| 18 | 01 | BR-ENR-01/02 rewritten: holds cover every session; seats counted per `group_session`, including holds and waitlist offers. New BR-ENR-13 (which sessions each plan covers). BR-ENR-10: offer counts as a hold; accept endpoint. | A4 |
| 19 | 08 | §4 seat check rewritten: per-session Redis keys, `acquire_hold` / `commit_hold` / `release_hold` Lua; §5 next-period seat for live recurring plans; §9 seat tests. | A4 |
| 20 | 06 | INV-05 per session; `waitlist_entries.offered_sessions` and `enrolment_id`; `enrolments.waitlist_entry_id`. | A4 |
| 21 | 05 | Caching table: `seats:` / `holds:` / `hold:` keys replace the single hold key; waitlist events carry `sessionIds`; `waitlist.offer_accepted`. | A4 |
| 22 | 07 | Added `POST /v1/waitlist/{id}/accept`; `POST /v1/enrolments` returns `sessionIds[]` and names the full session. | A4, C1 |
| 23 | 02 | MKT-ENR-02 AC6–AC7, MKT-ENR-09 AC2–AC4, MKT-GRP-03 AC4 (per-session seats, waitlist offers). | A4 |
| 24 | 13 | OD-03 (per-session seat use; recurring plan keeps next-period seat) and OD-23 (offer counts as a hold; accept endpoint) updated. | A4 |
| 25 | 06 | `consent_events` keyed on `user_id` (any role); `guardian_id`/`student_id` optional; kind `child_data_processing`; current state per `(user_id, student_id, kind)`; RLS `SELF`. | A5 |
| 26 | 10 | §3 consent table rewritten around `user_id`; `child_data_processing`; AI consent tied to E15-01. | A5 |
| 27 | 05 | `consent.changed` payload now `userId, guardianId?, studentId?, …`; partition by user. | A5 |
| 28 | 07 | `/v1/me/consents` open to any user; `POST /v1/me/children` records `child_data_processing`. | A5 |
| 29 | 03 | FUP-RUL-01 table names each rule code; `score_decline` = Phase 2 simple rule. | A6 |
| 30 | 04 | ANL-DEC-01 uses `score_decline_class_adjusted`. | A6 |
| 31 | glossary | "Decline alert" → `score_decline_class_adjusted`; new "Score decline (Phase 2 rule)" row. | A6 |
| 32 | 13 | OD-35 names `score_decline_class_adjusted`; CF-07 text uses both rule names. | A6 |
| 33 | 05 | New §4 table "Who evaluates the readable rules": followup module for all record rules; trend worker only for `score_decline_class_adjusted`. `signal.candidate` limited to that rule. | A7 |
| 34 | 03, 04 | FUP-RUL-03 AC1 and ANL-DEC-01 AC4 state the same split. | A7 |
| 35 | 06 | `rules.evaluated_by` column. | A7 |
| 36 | 13 | CF-17: diagram 08 still draws all three rules in the trend worker (open until redrawn). | A7 |
| 37 | 06 | `signals` dedupe → `UNIQUE NULLS NOT DISTINCT (rule_id, student_id, group_id, topic_id)`; INV-08 updated. | A8 |
| 38 | 03, 04 | FUP-RUL-03 AC2 and ANL-DEC-01 AC2 use the new dedupe key. | A8 |
| 39 | 07 | Added `/v1/centres/{id}/payout-account`, `/balance`, `/payouts`, `/statements.csv`; `/v1/me/*` money endpoints are teacher-only; new "Money" column naming whose money each endpoint is. | A9, F7 |
| 40 | 02 | MKT-CEN-05 AC2 and MKT-LED-08 AC5: money per centre. | A9 |
| 41 | 10 | Matrix: payout account per centre vs per teacher. | A9 |
| 42 | 13 | OD-37 rewritten as permission bundles ("agent", "finance") on the single role `link_ops`. | A10 |
| 43 | 02, 08, 01, 06, 10 | Role-name uses replaced with permission `ops.finance` / bundles: MKT-OPS-04 AC3, MKT-OPS-06 AC2, MKT-OPS-08 AC3, P11, BR-REF-07, `role_assignments` note, roles table. | A10 |
| 44 | 09 | §2.4: every detected person-name span becomes a token — `<S#>` matched, `<A#>` ambiguous, `<U#>` unknown; schema pattern `^<[SAU][0-9]+>$`; validation sends `<A#>`/`<U#>` items to T07 / "Who is this?"; §5, §8 and AI-02 updated. | A11 |
| 45 | 05, 10, CLAUDE.md | Model-gateway, LLM-safety and always/never lines say "no name reaches the LLM". | A11 |
| 46 | 13 | Added OD-43: "% of fees" attribution (spread over sessions, held month, refunds adjust the next invoice, rounding). | A12 |
| 47 | 01 | BR-RNT-03 points to new BR-RNT-09; worked example H added (3 Nov → 3 Dec plan, 25 students). | A12 |
| 48 | 08 | §6 step 1 uses the attribution rule and the refund adjustment; §9 golden test for example H. | A12 |
| 49 | 06 | `rent_invoices.fees_base_adjustment_pt`. | A12 |
| 50 | 02 | MKT-LED-03 AC1 points to BR-RNT-09 and BR-RNT-10. | A12, A13 |
| 51 | 13 | Added OD-44: session `held` automatically at `ends_at`; "did not take place" until the invoice. | A13 |
| 52 | 01 | BR-RNT-04 points to new BR-RNT-10 (held definition). | A13 |
| 53 | 06 | `group_sessions` statuses `scheduled`/`held`/`cancelled`/`not_held`, reason, who, `rent_invoice_id` lock. | A13 |
| 54 | 07, 02, 08, 05, 10 | `POST /v1/sessions/{id}/not-held`; MKT-GRP-03 AC3; rent cycle step 0; events `session.held` / `session.not_held`; matrix row. | A13 |
| 55 | 06 | `payments.centre_id` nullable only for a teacher-only paid-extras subscription (CHECK). | A14 |
| 56 | 08 | P7 and P8 post provider refund fees: Dr `link_expense:provider_fees` / Cr `provider_clearing` (OD-15). | A14 |
| 57 | 06, 04 | `item_topics.weight` removed (unused by ANL-SCR-01); ANL-EVD-01 says a question tagged to two topics counts fully for each; ERD change listed in §12. | A14 |
| 58 | 11 | Tokens `space/8`, `space/48`, `radius/8`, `radius/24` added; "propose adding `--space-8`" dropped; Arabic Display/Metric/Title/Heading/Caption no longer "(proposed)". | B1 |
| 59 | 05 | §1: the core-api codebase (api, workers, gateway) is the only DB writer; ai-service never writes. | B2 |
| 60 | 02, glossary | Parent plan copy says "monthly plan", not "subscription": MKT-ENR-02 AC1–AC2, MKT-ENR-03 title, MKT-GRP-01 AC1, MKT-OPS-04 AC2; glossary rows "Monthly plan (parent)" and "Subscription (paid extras)"; CF-06 reworded. | B3 |
| 61 | 00, README | Teacher: "Rents weekly hall slots; rent is calculated per the centre's rent rule". | B4 |
| 62 | 13 | CF-07 kept open and now cites the phasing note `85:642` and the Definitions frame `85:619`. | B5 |
| 63 | 13 | CF-10 kept open; added CF-18 (diagram 07 draws audit as an event consumer). | B6 |
| 64 | README | Eraser table replaced with the exact 9-row table (# · Diagram · ID); doc mapping moved to one line. | B7 |
| 65 | 07 | Added `POST/DELETE /v1/me/devices`, `PATCH /v1/centres/{id}/staff/{userId}`, ops data-requests, ledger adjustments, payouts list and retry. Every state/money row has an explicit Idem value. | C1 |
| 66 | 02 | New stories MKT-NTF-02 (devices), MKT-OPS-09 (data requests), MKT-OPS-10 (ledger adjustments), MKT-OPS-11 (payout retry); MKT-ACC-06 AC4 (edit staff permissions); actor index updated. | C1 |
| 67 | 06 | New table `identity.devices`; RLS summary rows for devices, leads, consents, sessions, adjustments. | C1 |
| 68 | 12 | E2-02 moved to M1; new E8-08 (wallet flow, M2); new E1-07, E1-08, E6-04, E10-08, E12-04, E12-05, E12-06; E9-01 (now L), E9-03, E9-08 reworked; E0-03 uses synthetic data and no longer waits for OD-26; milestone lists written out story by story. | C2 |
| 69 | 13 | OD-26: `dev`/`staging` synthetic only; gates E14-04 and any real student data. | C2 |
| 70 | 13 | Added OD-45 (SMS/OTP provider), OD-46 (maps + cost cap), OD-47 (eKYC contract); OD-04 notes the M0 sandbox request; OD-19 points to OD-47. | C3 |
| 71 | 12 | Size table (85 → 96 stories; 234–398 → 254–434 dev-days) and a "Team and dates" table. | C4 |
| 72 | 12, 09 | New epic E15 (AI evaluation spike, parallel from M0, off the critical path); 09 §6 "Early start". | C5 |
| 73 | 14 (new) | `docs/14-dev-environment.md`: local services, env var catalogue, seed data, commands, sandbox accounts per milestone. Linked from README and CLAUDE.md. | C6 |
| 74 | CLAUDE.md | Added "schema" always/never block (`NULLS NOT DISTINCT`, scope columns, ops permissions), seat/state/money-endpoint lines, "no name reaches the LLM", one evaluator per rule, new commands, links to 14 and the changelog. Still under 150 lines. | C7 |
| 75 | ADR-0002 | Rates of the same kind and scope never overlap (`scope_id` exclusion). | C7 |
| 76 | ADR-0004 | Repo tree shows `infra/local/` (docker compose). | C7, C6 |
| 77 | glossary | Added "Expired (enrolment)", "Waitlist offer", "Lead", session statuses, `NULLS NOT DISTINCT`, "Permission bundle", "Name token". | A3, A4, A2, A10, A11 |
| 78 | CHANGELOG (new) | This file. | Ground rule 4 |

## 2026-10-03 — Eraser renumbering pass

| # | File | What changed | Why |
|---|---|---|---|
| 1 | README, CLAUDE.md, 04, 05, 06, 08, 09, 10, 13, ADR-0001, ADR-0002 | References moved to the nine numbered Eraser diagrams (01–09); old full-architecture, backend-design and write-path IDs removed. | The Eraser file was restructured |
| 2 | 05 | Read and write paths merged into "Request lifecycle — diagram 07"; four-deployables note; rent events renamed `rent.invoiced` / `rent.settled`. | Diagrams 01, 02, 07 |
| 3 | 13, 01, 02, 08, 12 | OD-42 added: parent refunds need ops approval (one click for auto-eligible). | Diagram 06, L03 |
| 4 | 04 | Focus plans run weekly (default Sunday). | Diagram 08 |
| 5 | 06 | ERD now has `teacher_applications.subject_id`; deviation row updated. | Diagram 03 |

## 2026-10-03 — Initial documentation set

| # | File | What changed | Why |
|---|---|---|---|
| 1 | CLAUDE.md, README.md, docs/00–13, glossary, adr/0001–0004 | Created from the kickoff prompt, the Figma screens and the Eraser diagrams. | Kickoff |
