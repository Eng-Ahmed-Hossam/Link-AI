# CLAUDE.md — Link

**Link** is a marketplace for tutoring in Egypt, with AI follow-up tools on top. Parents find teachers and centres and pay online, teachers rent halls in centres, and centres fill empty halls. **Every payment goes through Link**, and Link earns a small booking commission (from the teacher's fee) and a small marketing fee on hall rent (from the centre's share). Paid extras: Arabic voice records after class, readable decline alerts, follow-up cases, staff-approved WhatsApp updates, and topic analytics. Curricula: National, IGCSE, American, Nile. Arabic-first (RTL), full English.

**Status:** documentation only. Do not write application code until the team has reviewed `docs/13-open-decisions.md` and `docs/12-backlog-phase1.md`.

## Always / never — money
- ALWAYS store all money in `_pt`: integer piasters (`bigint`, `_pt` suffix; API `amountPt`). NEVER floats or decimals for money.
- ALWAYS post a balanced double-entry ledger transaction for every money event (Σ debit = Σ credit).
- ALWAYS make money events idempotent (idempotency key per event; webhooks deduped on provider event ID).
- ALWAYS read rates from `commission_rules` (validity dates) and snapshot the rate on the payment/invoice. NEVER hard-code a rate.
- ALWAYS round Link's fee down to a whole piaster (default, OD-16).
- NEVER let card data touch Link — hosted checkout and provider tokens only.
- NEVER change payment status from a browser redirect — only verified webhooks or provider queries.
- NEVER cache ledger balances, payment status or consent.
- NEVER charge parents a booking fee; NEVER ask centres to pay upfront.
- Recurring monthly payments are card-only. Methods: card, Fawry, mobile wallet. Parent copy says "monthly plan" — "subscription" means paid extras only.
- ALWAYS count seats per `group_session` (holds and waitlist offers included). Enrolment states are exactly: `pending_payment`, `awaiting_teacher`, `confirmed`, `past_due`, `cancelled`, `expired`, `declined`, `ended`. Refund state lives on `refunds`.
- Money endpoints always name whose money it is: teacher (`/v1/me/payout-account`, `/balance`, `/payouts`, `/statements.csv`; `/v1/teachers/me/*`) or centre (`/v1/centres/{id}/*`). Other `/v1/me/*` endpoints are not money endpoints.

## Always / never — schema
- ALWAYS use `UNIQUE NULLS NOT DISTINCT` when a unique key has a nullable column (e.g. `payouts`, `role_assignments`, `signals`). NULL never equals NULL in PostgreSQL.
- Exclusion constraints can't ignore NULLs: use a generated non-NULL scope column (e.g. `commission_rules.scope_id`) and `btree_gist`.
- Ops users: role `link_ops` + permissions `ops.verify` / `ops.moderate` / `ops.finance`. Never invent other ops roles.

## Always / never — trust
- ALWAYS require the teacher's confirmation before a record is saved. AI output is a draft.
- ALWAYS require staff approval before any message reaches a parent; the teacher approves weekly focus plans.
- ALWAYS show the readable rule, numbers and source records behind every flag. NEVER black-box scores.
- NEVER show a transcript to parents or use it in analytics — it is a receipt. Records are the confirmed facts.
- NEVER treat missing data as absence ("Not recorded" ≠ "Absent").
- ONLY confirmed records trigger rules.
- NEVER cap an out-of-range value silently — block it.
- NEVER guess a student — match names against the roster only; ask when ambiguous.
- ALWAYS write an append-only audit event in the same transaction; undo is a new event.
- ALWAYS isolate centres: RLS on every tenant table and `{env}:c:{centreId}:` cache-key prefixes.
- ALWAYS check WhatsApp opt-in; a STOP takes effect at once.
- Reviews only from verified parents of enrolled students; owners can reply or report, NEVER delete.
- Voice audio is encrypted and deleted after 30 days. Comply with PDPL (Law 151/2020).
- No name reaches the LLM: replace EVERY detected person name with `<S#>` (matched), `<A#>` (ambiguous) or `<U#>` (unknown) tokens, and redact guardian contacts. Items on `<A#>`/`<U#>` are never saved to a student.
- ONE evaluator per rule: the followup module evaluates record rules; the trend worker only emits `signal.candidate` for `score_decline_class_adjusted`.
- NEVER invent a business rule. If something is TBD, use the default in `docs/13-open-decisions.md` and keep it configurable.

## Stack
| Part | Choice |
|---|---|
| core-api | TypeScript, NestJS modular monolith, REST + OpenAPI, SSE; entrypoints: api, worker, messaging-gateway |
| ai-service | Python, FastAPI (STT, name match, extraction, drafting, triage, focus plans) |
| Web | Next.js: public site + parent PWA + owner/staff web; ops console (SSO + IP allow-list) |
| Teacher app | React Native (Expo), offline voice queue, RTL |
| Data | PostgreSQL (schema per context, RLS) + PostGIS + pgvector; Redis (cache + state); S3-compatible storage (SSE-KMS) |
| Events | Transactional outbox → managed queue, at-least-once, inbox dedupe, DLQ |
| Ops | Terraform (dev/staging/prod), GitHub Actions, containers, Sentry, OpenTelemetry, PostHog (no PII) |

## Repo layout (proposed — ADR-0004)
```
apps/core-api  apps/ai-service  apps/web  apps/teacher-app  apps/ops
packages/api-client  packages/ui  packages/i18n  packages/config
infra/  docs/
```

## Naming conventions
- DB: `snake_case`, plural tables, `<entity>_id`, `_pt` money, `_at` timestamptz, `_on` dates, enums as `text` + CHECK.
- API: `/v1/kebab-case-plural`, JSON `camelCase`, RFC 9457 errors with stable `code`, cursor pagination.
- Events: `entity.past_tense_verb` (e.g. `enrolment.confirmed`); payloads carry IDs and amounts, never PII.
- Requirement IDs: rules `BR-…`, Phase 1 `MKT-…`, Phase 2 `FUP-…`, Phase 3 `ANL-…`, decisions `OD-…`, conflicts `CF-…`, stories `E<n>-<nn>`. Put the IDs in test names and PR descriptions.
- Code uses English domain terms from `docs/glossary.md` (`room` in code = "hall" in UI).

## i18n and RTL
- Default locale `ar`; fallback `en`. Every user-facing string goes through `packages/i18n` — no hard-coded text.
- Keys: `<surface>.<screen>.<element>`, e.g. `parent.checkout.payButton`. ICU MessageFormat; Arabic has 6 plural forms.
- `dir` follows the locale; use logical CSS properties only (`margin-inline-start`, never `left`/`right`).
- Arabic UI shows Arabic-Indic digits via `Intl` (`ar-EG`); phone numbers and codes in LTR isolates.
- Fonts: Cairo (Arabic), Plus Jakarta Sans (English). Tokens in `docs/11-design-system.md`.
- Dates/times in `Africa/Cairo`. Missing translation keys fail CI.

## Commands (placeholders until code exists)
```bash
pnpm install          # install workspace deps
pnpm dev              # run all apps locally
pnpm test             # unit + integration tests
pnpm test:rls         # cross-tenant suite
pnpm test:money       # ledger property tests + golden examples A–I + seat tests
pnpm lint             # eslint/prettier + ruff
pnpm typecheck        # tsc + mypy
pnpm openapi:check    # OpenAPI drift check + regenerate api-client
```
Local services, env vars, seed data and sandbox accounts: `docs/14-dev-environment.md`.

## Where things live
| Need | File |
|---|---|
| Vision, actors, phases | `docs/00-overview.md` |
| Every business rule + worked examples | `docs/01-business-rules.md` |
| PRDs | `docs/02-…` (Phase 1), `docs/03-…` (Phase 2), `docs/04-…` (Phase 3) |
| Modules, events, caching, resilience, adapters | `docs/05-architecture.md` |
| Tables, RLS, invariants | `docs/06-data-model.md` |
| API conventions + endpoints | `docs/07-api.md` |
| Ledger postings, saga, reconciliation, payouts | `docs/08-payments-ledger.md` |
| Voice/AI pipeline + eval gates | `docs/09-ai-voice-pipeline.md` |
| Permissions, PDPL, retention, breach runbook | `docs/10-security-privacy.md` |
| Tokens, RTL rules, screen inventory | `docs/11-design-system.md` |
| Phase 1 backlog + build order | `docs/12-backlog-phase1.md` |
| Open decisions (TBDs + defaults) and source conflicts | `docs/13-open-decisions.md` |
| Dev environment, env vars, seed, sandboxes | `docs/14-dev-environment.md` |
| EN ↔ AR terms | `docs/glossary.md` |
| Architecture decisions | `docs/adr/` |
| What changed in the docs, and why | `docs/CHANGELOG.md` |

Designs: Figma `3TteHvTvk9JrvUthg2AyE7` (two pages: app screens `0:1`, landing page `68:605`). Diagrams: Eraser `ZurKb6P9y4F6oa76V3wX` — nine numbered diagrams, 01–09 (IDs in `README.md`); docs cite them as "diagram NN". Design numbers and names are sample data.
