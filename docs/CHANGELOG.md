# Docs changelog

One line per change: file, what changed, why. Newest pass first. Review items (A1–C7) refer to the "docs fix-up pass before coding" review; R2-1…R2-12 to the round-2 fix-up.

## 2026-10-09 — R4: easy to run and hand over

| # | File | What changed | Why |
|---|---|---|---|
| R4-1 | `docs/13-open-decisions.md` | CF-54 decided (approved as built); CF-55 new and decided: 403 `extra_not_enabled` for a visible centre, 404 for one the caller cannot see, the system-role flag read only for the caller's own centres | Ahmed's R3 review |
| R4-2 | `docs/RUNNING.md` | One page from a clean clone: setup → dev, sign-in, the click list 1–23, reset, real vs fake, `pnpm voice:try`, common fixes | R4 |
| R4-3 | `docs/product/app-map.md`, `docs/product/sample-only.md` | A "Live / Mock" column for every screen; sample-only shrunk to what is really left | R4 |
| R4-4 | `docs/plan/before-real-users.md` (new), `docs/testing/local-checks.md` (new) | What's left before real users (paperwork, hosting, product gaps; owner and size); the checklist for Ahmed's PC | R4 |
| R4-5 | `.github/workflows/ci.yml` | `story-live` also runs on pull requests into `main` | R4 |

## 2026-10-09 — R3: follow-up on the real backend (and the R2b money fixes)

| # | File | What changed | Why |
|---|---|---|---|
| R3-1 | `docs/08-payments-ledger.md`, `docs/13-open-decisions.md` | §3 "Held for rent" (CF-54, new, built as the default); P5 worked example at a 2.5 % gateway fee (no new rule: P5 and OD-15 already said Link pays it); P7 note on `pnpm ops:refunds`; CF-51, CF-52 (one line: an offer is open 24 h, then passes to the next parent; the seat starts at the next session), CF-53 decided | Ahmed's R2b review |
| R3-2 | `docs/06-data-model.md` | §6–8 built: `teacher_id`, one record per session, the entry guard trigger, voice data class and deletion dates, `case_events`, `message_status_events`, message lock and provider ID | R3 schema (migrations 0012–0015) |
| R3-3 | `docs/07-api.md` | §2b and §2c are built and in OpenAPI; 403 `extra_not_enabled`; the signed audio upload; the internal voice-result route; correction requests; "I sent it"; the messaging webhook; `/v1/me/centre-groups`; Ask Link 503 `assistant_unavailable` without a local model; demo provider/reply go through whatsapp-fake | R3 |
| R3-4 | `docs/14-dev-environment.md`, `docs/RUNNING.md`, `docs/product/sample-only.md`, `docs/plan/real-backend.md` | whatsapp-fake (8094), the voice/messaging/followup queues, the new env vars; what is real now; the R3 click list from step 12; §9 R3 | R3 |

## 2026-10-09 — R2b: seats, payments, ledger, statements and reviews on the real backend

| # | File | What changed | Why |
|---|---|---|---|
| R2b-1 | `docs/06-data-model.md` | Enrolments: `reference`, `method`, `teacher_reviews`, `plan_cancelled_at`, `status_changed_at`, the INV-05 guard and `seats_committed`; payments: `checkout_url`, `card_last4`, `failure_reason`, `released_at`; `provider_events.outcome`; `refunds.approved_at`; ledger kinds `refund_confirmed`, `refund_failed`, `teacher_id`, `reverses_id`; reviews `school_year_id`, `NULLS NOT DISTINCT` term key; `guardians.home_area` | R2b schema |
| R2b-2 | `docs/07-api.md` | Webhook: 401 `invalid_signature`, `fake-pay` locally, never backwards; accept/decline return the J06 row; P-8 parent home area and shared location | R2b, R2a follow-up |
| R2b-3 | `docs/08-payments-ledger.md` | Rounding restated in §2 (rounded down, basis points; rent on % of fees rounded down) — no new rule | The R2b brief asked for it to be explicit |
| R2b-4 | `docs/13-open-decisions.md` | CF-51 (C04 and teacher reviews), CF-52 (what a waitlist offer covers), CF-53 (J06 paid enrolments only) | Built as decided there |
| R2b-5 | `docs/14-dev-environment.md`, `docs/RUNNING.md`, `docs/product/sample-only.md`, `docs/plan/real-backend.md` | fake-pay's new endpoints; `pnpm test:money` real; the R2b click list; what is real now; §9 R2b | R2b |

## 2026-10-09 — R2a: halls, room requests, groups and search on the real backend

| # | File | What changed | Why |
|---|---|---|---|
| R2a-1 | `docs/07-api.md` | C01 rate limits; `/v1/me/invites` + accept; feature flags signed-in and scoped; `PATCH /v1/teachers/me` takes `displayName`, `subjectIds` and returns `profileStatus`; room search weekdays are ISO (1–7) — fixes R1's wrong "0 = Sunday" note; `centre_not_verified` | R1 review, R2a |
| R2a-2 | `docs/06-data-model.md` | `teachers.profile_status`, `rooms.photo`, `groups` slot columns, `review_stats` shape, the public views, the CF-44 trigger, `platform.data_keys` | R2a schema |
| R2a-3 | `docs/10-security-privacy.md` | Expo web is not a production target; key IDs on encrypted values | R1 review |
| R2a-4 | `docs/13-open-decisions.md` | A0: OD-60 approve the consent pack; contact email blank for now | R1 review |
| R2a-5 | `docs/RUNNING.md`, `docs/14-dev-environment.md` | What is real after R2a, the key warning, a click-it-yourself list, `ops:verify-centre`, `seed:demo --reset`, the Next cache fix | R2a report |
| R2a-6 | `docs/plan/real-backend.md` | R2a progress and differences from the plan | R2a |

## 2026-10-09 — R1: real backend, platform and accounts

| # | File | What changed | Why |
|---|---|---|---|
| R1-1 | `docs/plan/real-backend.md` | The R0 plan (endpoint inventory, schema plan, stack check, risks, estimates) and the R1 progress | R0, approved 2026-10-08 |
| R1-2 | `docs/07-api.md` | Added: owner profile, feature flags (centre, teacher, parent, global `GET /v1/feature-flags`), `GET /v1/room-bookings?scope=mine`; web sessions as httpOnly cookies + `X-Link-Auth`; `Me.centreIds`/`teacherId`; C01 is public and becomes a pending centre on first sign-in; `centre_owner` only through C01. Renamed in mock and client to match: staff invites, reviews-received filters, room-search parameters | D1–D11, decided 2026-10-08 |
| R1-3 | `docs/06-data-model.md`, `docs/10-security-privacy.md` | Account phones as `phone_hmac` + `phone_enc` + `phone_last4` (no plaintext); `auth_sessions.family_id`/`client`; `leads.details`; `school_years.short_name_*`; the RLS context loader and the SECURITY DEFINER lookups | D10, decided 2026-10-08 |
| R1-4 | `docs/14-dev-environment.md`, `.env.example` | sms-sink on host port 8093; `pnpm dev` (live), `seed:demo`, `db:types`, `openapi:*`, `test:api`, `test:rls`, `test:e2e:mock/live`, `scripts/env-local.mjs`; new env names (`JWT_SIGNING_KEY`, `FIELD_KEY_LOCAL`, `CORE_API_PORT`, `GATEWAY_PORT`, `CORS_ALLOWED_ORIGINS`, `AWS_ENDPOINT_URL`, test-only `TEST_LOG`, `E2E_MODE`) | R1 |
| R1-5 | `docs/RUNNING.md` (new) | How to run live mode, sign in as each role, what is real and what is still on mock | R1 report |
| R1-6 | `docs/product/sample-only.md` | Accounts and saved data are real in live mode | R1 |

## 2026-10-08 — Step 2B: the connected story

| # | File | What changed | Why |
|---|---|---|---|
| 2B-1 | `docs/testing/walkthrough.md`, `walkthrough.pdf` | Rewritten around the connected story: for each step the role, address, clicks, what you see and why it matters, in English and Arabic, one page per role switch | Step 2B.3 |
| 2B-2 | `docs/testing/feature-tours.md` | The earlier hands-on tours, moved from walkthrough.md (their test, `guide.spec.ts`, follows them) | The walkthrough is now the story |
| 2B-3 | `docs/product/sample-only.md` | What still needs the real backend (accounts, saved data, payments, SMS, WhatsApp, voice, maps, photos, ops, notifications, contact email) | Step 2B report |
| 2B-4 | `docs/13-open-decisions.md` | CF-44 decided (owner adds halls; a moved pin is "under review" until ops verify); CF-46 and CF-50 agreed as built | Step 2A review, 2026-10-08 |
| 2B-5 | `docs/06-data-model.md` | `centres.location_status` (`verified` / `under_review`) | CF-44 |
| 2B-6 | `docs/glossary.md` | Brand row: «لينك» in all Arabic text; the logo keeps the Latin wordmark | Decided 2026-10-08 |
| 2B-7 | `docs/14-dev-environment.md`, `README.md` | `pnpm check:public-demo`; Demo controls from the banner's "Demo tools" (local demo only); the story and feature-tour guides | Step 2B |
| 2B-8 | `docs/frontend/screen-log.md`, `docs/product/app-map.md` | Step 2B section; app map links the story and the sample-only list | Step 2B records |

## 2026-10-08 — Step 2A: one connected product

| # | File | What changed | Why |
|---|---|---|---|
| 2A-1 | `docs/13-open-decisions.md` | CF-42 to CF-50: owner menu groups, C05 tabs and auto-approve switch, C02 pin and "Add room", C01 copy, J03 "Confirm booking", J06 actions, J07 payment methods, teacher tabs, T14 sign-up note | Every difference from Figma in the 2A screens, with what we built |
| 2A-2 | `docs/frontend/screen-log.md` | "Step 2A" section: role chooser, demo banner, A18, C01–C07, A16, "What's included", T14, J01–J07 | Step 2A screen records |
| 2A-3 | `docs/product/app-map.md` | Regenerated from the route manifest | New screens and the role chooser |

## 2026-10-08 — Step 1 approved

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13, frontend/screen-log.md | CF-40 and CF-41 resolved: "rent hall slots"; "Request free access" (back to "Create my account" once accounts exist). | Ahmed's review |
| 2 | .env.example (`NEXT_PUBLIC_CONTACT_EMAIL`) | Link's contact address: footer "Contact", the request confirmation, and where requests go when `PILOT_REQUEST_TO` is empty. Shown only once set. | Step 0 |

## 2026-10-08 — The landing page, rebuilt from Figma 68:616

| # | File | What changed | Why |
|---|---|---|---|
| 1 | frontend/screen-log.md, 11 §7, product/app-map.md | The landing page is a copy of Figma 68:616 (13 frames, IDs in 11 §7): Figma's words, Figma's renders and icons; no §3 fact needed changing; the additions (consent tick, Arabic, alt text, the two undrawn tabs) are listed in the screen log. Section comparisons in `frontend/compare/landing/`. | PRODUCT_BRIEF §4, Step 1 |
| 2 | 13 | CF-40 ("rooms by the session" vs hall slots) and CF-41 ("Create my free account" on a request form): kept as in Figma, open for Ahmed. | Not §3 facts |
| 3 | adr/ADR-0009 | The landing's "Get started" form uses the same email route. | Step 1 |
| 4 | pilot/strings-to-review.csv, pilot/arabic-review.md | The 214 landing strings (`site.*`), by Figma section, for review; the old landing strings removed. | Arabic review |

## 2026-10-07 — Reset to the product brief

| # | File | What changed | Why |
|---|---|---|---|
| 1 | PRODUCT_BRIEF.md (new), CLAUDE.md, 13, product/app-map.md (new) | The brief is the single source of truth (CLAUDE.md points to it first). **OD-48 and CF-19 reversed:** the landing page follows Figma `68:616`, marketplace first, Follow-up as a paid extra. **OD-58:** marketplace on; Follow-up on as a paid extra per centre (on in the demo). The app map lists every role → app → screen → status. | Ahmed's product brief |

## 2026-10-07 — Launch Stage 2: GitHub (private), CI, repo docs

| # | File | What changed | Why |
|---|---|---|---|
| 1 | README.md, dev/repo-map.md (new), LICENSE (new), SECURITY.md (new) | The README describes the code that exists (quick start for the demo and pilot practice, docs, Figma, Eraser, the sample-data rule); the repo map lists every app and package; proprietary licence ("All rights reserved"); how to report a security issue privately. | First push to GitHub |
| 2 | .gitignore | Certificates and keys, pilot data and backups, all audio except the synthetic bench clips, model files. | Push audit |
| 3 | .github/workflows | CI: lint, typecheck, unit tests, i18n, env and format checks; Python (link_nlp, evals, gold lock); gitleaks over the full history. e2e (web, demo, pilot) by hand only. | Stage 2 |
| 4 | prompts/ (new) | The launch and hosted-pilot prompts, as Ahmed sent them. | Reference for Stages 3–5 |

## 2026-10-07 — Launch Stage 1: the landing page, try it, request a pilot

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13 | **OD-48 decided:** the landing page leads with follow-up; two ways in (try it, request a free pilot); no numbers, testimonials, logos or prediction claims. **CF-19 resolved** in favour of follow-up; marketplace copy hidden with its sections. | Ahmed, launch prompt |
| 2 | adr/ADR-0009 (new) | Pilot requests emailed through Resend (free tier: 3,000 a month, 100 a day), validated, honeypot, rate-limited, never stored or logged in clear; path A demo in the browser; cookieless PostHog (page views and two buttons). | No backend yet |
| 3 | 11 §3 | `Link Web / Button` and `FAQ item` built (`Web.tsx`). | Stage 1 |
| 4 | 14 | The landing routes, `pnpm landing:shots`, `pnpm og:images`; env `PILOT_REQUEST_TO`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TEACHER_APP_URL`, `EXPO_PUBLIC_SITE_URL` (`EMAIL_*` reused). | Stage 1 |
| 5 | frontend/screen-log.md | The website screens and how they differ from Figma `68:616`. | Stage 1 |
| 6 | pilot/strings-to-review.csv, arabic-review.md | The 199 website strings added for review, by section. | Ahmed reviews the copy |

## 2026-10-07 — Every route reachable; hands-on walkthrough

| # | File | What changed | Why |
|---|---|---|---|
| 1 | frontend/screen-log.md | Links without a centre id go through sign-in to the person's own centre; the app's own not-found pages (web, teacher app, unknown centre); C02–C07 not found in the pilot; the `/{lang}/dev` route index (demo only). | `/ar/centre/today` (printed by `pnpm demo`) was a bare Next.js 404 |
| 2 | 14 | The route crawler and the guide spec in the demo and pilot e2e suites; `/{lang}/dev`; `pnpm testing:walkthrough`. | Part 1 |
| 3 | testing/walkthrough.md, walkthrough.pdf, findings.md | New: the hands-on guide (four tours, Arabic and English, the rule behind each step, every step tested or marked Manual) and the findings template. | Ahmed tests every feature himself |

## 2026-10-06 — NLP round 3 and pilot readiness

| # | File | What changed | Why |
|---|---|---|---|
| 1 | ai/link-nlp.md, ai/handoff-*.md | The round-3 section: API additions (`RuleAbstention`, `rule_abstentions`), the behaviour change for ambiguous candidates (contenders only), the status of every A/B item, before/after metrics. The handoff files are closed (single agent). | Codex stopped; Claude Code owns `link_nlp` |
| 2 | 09 §2.6 | `redact_contacts` first; `find_pii_leaks` immediately before every LLM call (fail-closed); rule abstentions handed to the LLM as "not a fact"; misheard-name suggestions; prompt `extract-v8`. | Shims retired; A3 |
| 3 | 07 §2d | `POST /v1/pilot/users/{id}/voice` (per teacher, off by default, consent first); `GET/POST /v1/pilot/voice` (profile estimate, kill switch). | 4.2 |
| 4 | 14 | `pilot:preflight`, `pilot:practice` / `pilot:practice-wipe`, `pilot:guides`, `ai:ingest-recordings`, `ai:eval --calibrate`; `PILOT_PRACTICE_DIR`. | 4.1, 4.3, 4.4 |
| 5 | adr/ADR-0007 | The round-3 CPU-only profile: rules only now matches rules + LLM on the structured facts at 37 s per note, so it is recommended. | §3 |
| 6 | pilot/runbook | Preflight in the daily routine; voice per teacher and the kill switch; the CPU recommendation; §8b, training on the practice centre. | 4.1–4.3 |
| 7 | pilot/accuracy.md | Round-3 numbers (text and Windows TTS); **the gate**: voice for a teacher needs 0 wrong students on the team's recordings; pre-filled scores also need ≥ 95% score exact match. | 4.4 |
| 8 | pilot/quick-guide-*.md, day-one-training.md, guides/*.pdf | New: the staff quick guides (Arabic first, the screens' words) and the 25-minute training script; PDFs. | 4.3 |
| 9 | pilot/strings-to-review.csv, arabic-review.md | Pilot screens and the guides only, most-seen first (`how_often`); one review pack with the guides and the 35 gold scripts. | 4.5 |
| 10 | pilot/go-no-go.md, pilot/README.md | New: the go/no-go checklist (done vs waiting on Ahmed). | §5 |
| 11 | frontend/screen-log.md | Part C rows: "Who is this?" suggestions; A16 voice per teacher and the kill switch; the pilot approve label. | 4.2 |

## 2026-10-06 — Merge of `codex/nlp-eval` round 2; single agent from now on

| # | File | What changed | Why |
|---|---|---|---|
| 1 | py/link_nlp, evals, ai/link-nlp.md | Merged `codex/nlp-eval` round 2 (`dc04cea`, merge `e2f5f0e`):<br>• the public API;<br>• `redact_contacts` / `find_pii_leaks`;<br>• split teens, common-word and misheard names;<br>• `evals/dev` (15 cases);<br>• gold v1 (35 notes) with `LOCK.json`;<br>• `REVIEW.csv`;<br>• `link_eval calibrate`. | Round 2 of the NLP core |
| 2 | evals/gold/LOCK.json, evals/link_eval/gold_lock.py, evals/.gitattributes | Gold v1 lock **re-hashed with LF-normalised content; no content change; verified against `dc04cea`**.<br>• All 40 files under `evals/gold/` are identical to `dc04cea` after LF normalisation.<br>• Every old hash equals the current content in its LF or CRLF form.<br>• The lock now hashes content with CRLF and lone CR turned into LF, and nothing else changed.<br>• `evals/.gitattributes` sets `* text eol=lf`, with recordings binary.<br>• Version stays 1. | The round-2 lock had hashed CRLF bytes from a Windows worktree, so `selftest` failed on `main`'s LF checkout of the same content |

## 2026-10-05 — `link_nlp` integrated into ai-service; text-only and Windows-TTS evals; CPU profile

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 09 §2.6 | Rewritten for the real `link_nlp`:<br>• the 12-step order;<br>• contact redaction (shim) and the leak check;<br>• the constrained per-note LLM schema;<br>• no LLM participation, no LLM on `<U#>`;<br>• grounding in the student's own clause;<br>• the pilot score band;<br>• T07 contenders;<br>• prompt `extract-v7`. | ai-service now runs on `link_nlp`; the stand-in is gone |
| 2 | 14 | `AI_SCORE_PREFILL`; `pnpm ai:eval` scores with `link_eval` into `evals/reports/` (`--stt-device`, `--llm-device`, `--label`, the TTS bench). | Measure and keep the pilot safe |
| 3 | ai/handoff-to-codex.md | New: requests A1–A5 (public API, contact redaction, rule abstentions, candidates, run-on unknown spans) and failure cases B1–B20 from the runs. | Agent protocol: requests to Codex go here |
| 4 | adr/ADR-0007, pilot/accuracy.md, pilot/runbook.md | The `link_nlp` results, the CPU-only profile, the advice for a laptop without a GPU. | Part C §3 |
| 5 | evals/reports/2026-10-05-* | New report files: the text-only eval (rules + `qwen3:8b`, rules only, `qwen3:4b` on the CPU) and the Windows-TTS audio runs (labelled; not real speech). | Part C §3 |

## 2026-10-05 — Merge of `codex/nlp-eval` round 1

| # | File | What changed | Why |
|---|---|---|---|
| 1 | ai/link-nlp.md, py/link_nlp, evals | Merged `codex/nlp-eval` round 1 (merge `f76110a`): the `link_nlp` package (normalisation, roster matching, tokens, rules, schema), 30 fictional gold notes, the `link_eval` runner and identity gates. Checked on `main`: ruff, strict mypy, 311 tests, selftest. | Real NLP core replaces ai-service's stand-in |

## 2026-10-05 — Part B: local speech-to-text and extraction (pilot and demo)

| # | File | What changed | Why |
|---|---|---|---|
| 1 | adr/ADR-0007 | New: ai-service with faster-whisper (`large-v3-turbo` default) and Ollama `qwen3:8b`, the data-safety guard, gateway versioning, licences, the benchmark on this laptop and what fits which laptop. Groq declared, not wired (no key; terms not checked). | B1, B2; OD-51 |
| 2 | 09 | New §2.6 "As built": order (rules first, LLM for the rest), grounding, the LLM budget, model version, the `link_nlp` stub. §8: data classes and the guard. | What the code does, and why (LLM tests) |
| 3 | 07 | Extraction 202 carries `etaSeconds`; 503 `stt_failed` / `stt_timeout`; `POST /v1/voice-notes/{id}/retry`. §2d: pilot voice endpoints (`PUT …/audio`, voice consent, `/v1/me.voiceNotes`, the loopback-only internal callback) and the ai-service API. | B3 |
| 4 | 06 | `voice_notes.data_class`; pilot retention `min(+30 days, pilot end)`, encrypted audio, deletion on consent withdrawal. | B2, B3 |
| 5 | 13 | OD-57 annotated: voice on per teacher consent with `PILOT_VOICE=1`; Ask Link still hidden in the pilot. | Part B |
| 6 | 14 | Ollama in Tools; ai-service env vars; `pnpm ai:eval` (real predictions), `ai:models`, `ai:bench`; Python lint/typecheck real; the demo's "Speech-to-text: local Whisper (real)" flag. `.env.example` updated. | B1, B3, B4 |
| 7 | pilot/runbook | §1b: what to download before the visit (~11 GB), checks, `PILOT_VOICE`, per-teacher consent, measured speed. "What is stored where": encrypted audio, `ai-usage.jsonl`. | Laptop setup |
| 8 | frontend/screen-log.md | Part B rows: V01 processing and failed states, V02 real, A16 voice consent, Ask Link demo label, the demo toggle. | B3 |
| 9 | pilot/accuracy.md | New: "What we learned about accuracy" (synthetic audio only). | Demo Day |
| 10 | pilot/strings-to-review.csv | Re-exported with the Part B strings. | Copy review |

## 2026-10-04 — Concierge pilot, Part A (pilot-ready)

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13 | New A3 "Concierge pilot": OD-50 (pseudonymised pilot, scoped exception to sample-data-only, end date and wipe), OD-51 (OD-26 for the pilot: local only), OD-52 (consent pack pending written approval), OD-53 (price EGP 2,000/month in the interview only), OD-54 (CSV roster + schedule), OD-55 (OD-36 defaults kept), OD-56 (messages sent by hand from the centre's WhatsApp), OD-57 (no Ask Link, no voice until Part B). OD-05/21/26/36 annotated. CF-34, CF-37, CF-39 closed. | Founder's decisions for the pilot |
| 2 | adr/ADR-0008 | New: pilot server, JSON snapshot + append-only log, backups, PIN sessions, same-origin serving, local CA, start-up check. | Durable state and safe access for real staff |
| 3 | 06 | `correction_requests` (CF-34); `case_attempts.channel` adds `whatsapp_manual`. | CF-34, OD-56 |
| 4 | 07 | New §2d: pilot endpoints (people, sessions, PINs, sent-manually), correction requests, `/v1/me/centre-groups`. | Pilot server, CF-34, CF-39 |
| 5 | 14 | `pnpm demo:warm`, `i18n:export-review` / `i18n:apply-review`, `pilot:*`, pilot e2e; troubleshooting for ports held by stuck processes. `.env.example`: `LINK_MODE`, `*_LINK_MODE`, `NEXT_DIST_DIR`, `PILOT_*`. | Pilot and demo runbooks |
| 6 | pilot/ | New folder: README, runbook, phone setup, centre agreement, teacher consent (E15-01), guardian notice, daily check-in, end-of-pilot interview (all drafts; AR first), strings to review, sample CSVs, screenshots. | Pilot documents (A10, A11) |
| 7 | frontend/screen-log.md | Pilot-mode rows. | Pilot screens differ |

## 2026-10-04 — Frontend Batch 6 (owner web, messages, assistant) and the MVP focus

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13 | CF-29 closed: teacher tabs follow the flags (Phase 2 only: Today · My groups · Records; Phase 1 only: My groups · Rooms · Earnings; both: Today · My groups · Rooms · Earnings). CF-30: seats and fees only with `marketplace.enabled`. | Team decision (MVP focus on the follow-up loop) |
| 2 | 13 | CF-33 (V06 nothing pre-ticked), CF-34 (no owner correction on A14 — question), CF-35 (Ask Link as a side panel), CF-36 (demo "Simulate a new day"), CF-37 (A03 badge vs stepper — question), CF-38 (only cases from rules that are on), CF-39 (P09 marketplace cards in the pilot — question). | Found while building A01–A17, V03–V07 |
| 3 | 07 | New §2c "Proposed — from frontend Batch 6": owner, case, message, rule, staff, activity, parent-updates and assistant endpoints, plus the demo-only endpoints (mock only). | Batch 6; input for core-api (MVP Step 2) |
| 4 | 14 | `DEMO_DEFAULT_FLAGS`; `pnpm demo` starts with Phase 2 on and the marketplace off; `test:e2e:demo`; new §5.2 demo flags, persistence in `packages/mocks/.data/demo-flags.json`, "Simulate a new day", provider events and replies. | MVP pilot defaults; demo restarts keep the presenter's flags |
| 5 | frontend/screen-log.md | Batch 6 rows. | Batch 6 |
| 6 | frontend/demo-script.md | New: the 3-minute Demo Day script, Arabic and English. | Demo Day |
| 7 | frontend/walkthroughs/batch-6 | Arabic cross-app walkthrough (teacher voice note → awaiting confirmation) and the mock-server proof. | Batch 6 report |

## 2026-10-04 — Frontend Batch 5 (teacher app, Phase 2)

| # | File | What changed | Why |
|---|---|---|---|
| 1 | 13 | CF-29 (teacher tabs — open question), CF-30 (one My groups screen), CF-31 (V01 cancel = slide toward the start edge), CF-32 (no live transcript in V01). | Found while building T01–T13, V01–V02 |
| 2 | 07 | New §2b "Proposed — from frontend Batch 5": the Phase 2 teacher endpoints and draft shapes the app uses (mock only). | Batch 5 |
| 3 | frontend/screen-log.md | Batch 5 rows. | Batch 5 |
| 4 | frontend/walkthroughs/batch-5 | Arabic walkthrough and the mock-server proof of `consecutive_absences`. | Batch 5 report |

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
