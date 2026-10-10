# 14 · Development environment

How to run Link locally, which settings it reads, which seed data it ships with, and which outside accounts each milestone needs. The local services, migrations, seed and env files are **real** (walking skeleton, Part 1). Commands still marked *planned* in §5 arrive with the stories named there ([12-backlog-phase1.md](12-backlog-phase1.md)).

**Quick start (Windows, macOS, Linux):** install Docker Desktop (WSL 2 engine on Windows), Git, Node 24+, pnpm 12 (`corepack enable`), and uv for Python 3.12 — on Windows in the order of [setup-windows.md](setup-windows.md). Then:

```bash
pnpm run doctor                # read-only: is this machine ready?
pnpm run setup                 # install, .env.local, services, migrations, sample data, ai-service packages
pnpm dev                       # core-api, web, teacher app (live mode)
```

`pnpm dev` is the real backend on this machine ([RUNNING.md](RUNNING.md)); `pnpm demo` is still the mock-data demo. `pnpm dev:reset` drops the local volumes, migrates and seeds again (asks first).

> **Synthetic data only.** `dev` and `staging` never hold real personal data. Real data arrives only in production (E14-04), after OD-26 is decided. Consented real voice notes for E15 follow the same rule for vendors outside Egypt.

---

## 1. Tools

| Tool | Version (pin in `.tool-versions`) | For |
|---|---|---|
| Node.js | 24 LTS (`engines: >=24`) | core-api, web, ops, teacher app; repo scripts |
| pnpm | 12.8.1 (`packageManager` in `package.json`) | Workspaces (ADR-0004) |
| Python | 3.12 | ai-service |
| uv | latest (0.11 used) | Python dependencies, `ruff`, `pytest`, `mypy` |
| Ollama | current (0.35 used) | Local LLM for voice extraction (`ollama pull qwen3:8b`, ADR-0007). Optional: without it, notes get rule results only |
| Docker + Docker Compose | current | Local services (§2) |
| Expo CLI / EAS CLI | current | Teacher app builds |
| Terraform | pinned in `infra/` | Cloud environments |

## 2. Local services (`pnpm dev:infra`)

The compose file lives in `infra/local/docker-compose.yml` (project name `link`). `pnpm dev:infra` runs `docker compose up -d --build --wait` with `--env-file .env.local`. Every service has a healthcheck. Databases use named volumes (`pg-data`, `redis-state-data`); nothing bind-mounts `node_modules`. Host ports can be changed in `.env.local` (`POSTGRES_HOST_PORT`, `REDIS_CACHE_HOST_PORT`, …) — e.g. set `POSTGRES_HOST_PORT=5433` when a native PostgreSQL already uses 5432.

| Service | Image / build | Port | Notes |
|---|---|---|---|
| `postgres` | PostgreSQL 16 + pgvector + PostGIS 3 (custom image in `infra/local/postgres/`, based on `pgvector/pgvector:pg16`) | 5432 | Databases `link` and `link_test` (the integration and RLS suites). The init script creates `app_migrator` (owner) and the extensions `postgis`, `vector`, `btree_gist` ([06](06-data-model.md) §0); migration 0001 creates the schemas and the roles `app_user`, `app_worker`, `app_ops` (ADR-0006). |
| `redis-cache` | Redis 7, `maxmemory-policy allkeys-lru` | 6379 | Cache-aside reads ([05](05-architecture.md) §5) |
| `redis-state` | Redis 7, `maxmemory-policy noeviction`, AOF on | 6380 | OTP, seat holds, idempotency, rate limits, locks |
| `aws-local` | Moto server (custom image in `infra/local/aws/`) — **replaces LocalStack**, which now needs an account token (ADR-0006) | 4566 | S3 (voice, media, exports buckets), SNS topic + one SQS queue and DLQ per consumer group (`notifications`, `platform-demo`, and since R3 `followup`, `voice`, `messaging`), KMS aliases `storage` and `fields`, Secrets Manager. In memory: recreated on every start |
| `sms-sink` | Small HTTP fake behind the `SmsSender` adapter (`infra/local/fakes/sms-sink`) | 8093 | Captures every SMS (OTP codes, invites); browse them at `http://localhost:8093`. Host port 8093 because ai-service uses 8090 and the oidc-stub 8092. API: `POST /messages`, `GET /api/messages` |
| `mail-sink` | Mailpit | 8025 (UI), 1025 (SMTP) | Captures email |
| `whatsapp-fake` | Fake provider behind the `WhatsAppSender` adapter (`infra/local/fakes/whatsapp-fake`), R3 | 8094 | Approved parent messages land here (browse `http://localhost:8094`); nothing is delivered. A status moves only when Demo tools or a test ask it to (`POST /v1/messages/{id}/status`, `POST /v1/inbound` for a reply or STOP); it then sends a signed webhook (`x-whatsapp-fake-signature: sha256=<HMAC>` with `WHATSAPP_WEBHOOK_SECRET`) to `WHATSAPP_FAKE_WEBHOOK_URL` — the only way Link changes a message's delivery status (BR-APR-11). `POST /v1/test-controls/redeliver {eventId}` repeats an event. State in memory. Provider value `fake`, refused when `APP_ENV=prod` |
| `fake-pay` | Fake provider behind the `PaymentProvider` and `PayoutProvider` adapters (`infra/local/fakes/fake-pay`) | 8091 | **Now (R2b):** hosted-checkout page for card and wallet (no card fields; it simulates success or failure, and can save the card for the monthly plan), Fawry references (pay at an "outlet" with `POST /v1/fawry-references/{ref}/pay`, even after expiry: a late payment), saved-card charges for renewals, refunds, expiry of an unpaid checkout or reference, `GET /v1/settlements?date=` (2% sample fee), and signed webhooks (`x-fake-pay-signature: sha256=<HMAC>` with `PAYMENT_WEBHOOK_SECRET`) to `FAKE_PAY_WEBHOOK_URL`. Test controls: `POST /v1/test-controls {nextMandateCharge, nextRefund: "fail"}`, `POST /v1/test-controls/redeliver {eventId}`. State is in memory. **Later:** payouts. Provider value `fake`, never allowed in prod ([06](06-data-model.md) `payments.provider`) |
| `oidc-stub` | Local OpenID Connect provider (mock IdP) — **not built yet** (E1-06) | 8092 | Ops console SSO for local and test runs (`OPS_OIDC_ISSUER` points here). Pre-loaded with the ops seed users (§4). Never used outside `local`/`dev`. Until then the ops console uses a stub sign-in page |

The real provider sandboxes (§5) are used from `staging` and in contract tests.

## 3. Environment variables

Names and purpose only. **Never commit values.** `.env.example` lists every name; local values come from `.env.local` (git-ignored); `staging` and `prod` read from the secrets manager.

### Shared
| Name | Purpose |
|---|---|
| `APP_ENV` | `local` \| `dev` \| `staging` \| `prod` |
| `LOG_LEVEL` | Log verbosity |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector |
| `SENTRY_DSN` | Error reporting |
| `POSTHOG_KEY` | Product analytics (no personal data) |
| `FEATURE_FLAGS_BOOTSTRAP` | Default flags for a fresh environment |

### core-api (api, workers, messaging-gateway)
| Name | Purpose |
|---|---|
| `DATABASE_URL` | Connection as `app_user` (RLS enforced) |
| `DATABASE_URL_WORKER` | Connection as `app_worker` |
| `DATABASE_URL_OPS` | Connection as `app_ops` |
| `DATABASE_URL_MIGRATOR` | Migrations only |
| `DATABASE_REPLICA_URL` | Read replica (search, reports) |
| `REDIS_CACHE_URL` | Cache instance |
| `REDIS_STATE_URL` | State instance |
| `S3_ENDPOINT`, `S3_REGION` | Object storage (`aws-local` locally) |
| `S3_BUCKET_VOICE`, `S3_BUCKET_MEDIA`, `S3_BUCKET_EXPORTS` | Buckets |
| `KMS_KEY_STORAGE`, `KMS_KEY_FIELDS` | Storage encryption key; field-level (envelope) encryption key |
| `HMAC_KEY_LOOKUP` | Key for phone and contact HMAC lookup columns |
| `QUEUE_PROVIDER` | `sqs` \| `pubsub` (OD-31) |
| `EVENTS_TOPIC`, `QUEUE_<CONSUMER>`, `DLQ_<CONSUMER>` | Event topic, one queue and one DLQ per consumer group |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_SIGNING_KEY_ID` | Token issuing; the key itself stays in the secrets manager |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` | 15 min / 30 days (MKT-ACC-04) |
| `OPS_OIDC_ISSUER`, `OPS_OIDC_CLIENT_ID`, `OPS_IP_ALLOWLIST` | Ops console SSO and allow-list (locally the issuer is `oidc-stub`) |
| `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET` | `paymob` \| `fawry` \| `kashier` \| `fake` (OD-04). `fake` is refused when `APP_ENV=prod` |
| `PAYOUT_PROVIDER`, `PAYOUT_API_KEY`, `PAYOUT_WEBHOOK_SECRET` | Payout rails |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` | OTP and fallback SMS (OD-45) |
| `EKYC_PROVIDER`, `EKYC_API_KEY`, `EKYC_WEBHOOK_SECRET` | Teacher identity checks (OD-47) |
| `MAPS_PROVIDER`, `MAPS_API_KEY`, `MAPS_MONTHLY_CAP` | Geocoding and cost cap (OD-46) |
| `PUSH_FCM_CREDENTIALS`, `PUSH_APNS_KEY_ID`, `PUSH_APNS_TEAM_ID` | Push notifications |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | Transactional email |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_WEBHOOK_SECRET` | Phase 2 parent messages |
| `AI_SERVICE_URL`, `AI_SERVICE_AUDIENCE` | Calls to ai-service (service identity + on-behalf-of) |

### ai-service
| Name | Purpose |
|---|---|
| `CORE_API_URL` | Write-back through core-api only |
| `STT_PROVIDER`, `STT_API_KEY` | Speech-to-text vendor (chosen by E15-03) |
| `LLM_PROVIDER`, `LLM_API_KEY` | LLM vendor, through the model gateway |
| `MODEL_ROUTING_CONFIG` | Per-task vendor, model and prompt version (JSON, or a path to a `.json` file). Local ai-service keys: `stt_provider`, `stt_model` (`large-v3-turbo` default), `stt_device` (`auto`/`cuda`/`cpu`), `stt_compute`, `llm_provider`, `llm_model` (`qwen3:8b`) |
| `AI_SERVICE_TOKEN` | Shared secret between the pilot server or mock server and ai-service; `pilot:start` and `pnpm demo` generate one at random per start. ai-service refuses to start without it |
| `AI_SERVICE_HOST`, `AI_SERVICE_PORT` | Where ai-service listens: `127.0.0.1:8090`. A non-loopback host is refused |
| `AI_SERVICE_URL` | Where the pilot / mock server reaches ai-service |
| `AI_MODELS_DIR` | Whisper models (`apps/ai-service/.models`, from `pnpm ai:models`) |
| `OLLAMA_URL` | Local Ollama (`http://127.0.0.1:11434`) |
| `AI_USAGE_LOG` | One JSON line per STT/LLM call (task, model, data class, seconds; no text) |
| `AI_JOB_TIMEOUT_S` | Per-note limit (180 s); after it the teacher sees "Type the note instead" |
| `AI_PRELOAD` | `0` = load the Whisper model on the first note instead of at start (`pnpm demo` sets it unless real speech-to-text was left on) |
| `AI_SCORE_PREFILL` | `1` lets a sure voice-extracted score be pre-filled (`pnpm demo` sets it). Default `0`: scores are always in the "check" band (the pilot, until the audio eval on the team's recordings shows score exact match ≥ 95 %) |
| `AI_LLM_BUDGET_S` | The LLM step's share of a note, all attempts together (90 s); a timeout is not retried and the note keeps the rule results |
| `PILOT_VOICE` | `1` turns voice notes on in the pilot (still per teacher consent, OD-52) |
| `AI_BUDGET_DEFAULT_PER_CENTRE` | Monthly cost budget used for alerts (09 §7) |
| `EVAL_GOLD_SET_URI` | Location of the locked gold set (09 §6) |

### Web apps and teacher app
| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | core-api base URL |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `ar` |
| `NEXT_PUBLIC_MAPS_KEY` | Browser maps key (domain-restricted) |
| `NEXT_PUBLIC_POSTHOG_KEY` | Product analytics |
| `EXPO_PUBLIC_API_BASE_URL` | core-api base URL for the teacher app |
| `EXPO_PUBLIC_SENTRY_DSN` | Teacher app error reporting |
| `NEXT_PUBLIC_API_MODE`, `EXPO_PUBLIC_API_MODE` | `mock` (default): MSW handlers in the app, state per browser/device · `mock-server`: the same handlers over HTTP from `pnpm mock:server`, one shared state for all apps · `live`: core-api |
| `NEXT_PUBLIC_USE_MOCKS`, `EXPO_PUBLIC_USE_MOCKS` | Older switch; `false` means `live`. `*_API_MODE` wins when set |
| `NEXT_PUBLIC_APP_ENV`, `EXPO_PUBLIC_APP_ENV` + `*_DEMO_CONTROLS` | `local` + `1` shows the dev-only **Demo controls** (reset scenario, mock provider events, parent reply, offline, Phase 2 switch) on the web dev index `/{lang}/dev`, and from the demo banner's **Demo tools** link as a side panel (Step 2B; the local demo only — production builds compile both out). In the teacher app: a floating button, or the banner's Demo tools for a visitor from the role chooser. Never with `live`, never in production builds |
| `MOCK_SERVER_PORT`, `MOCK_SERVER_URL` | Mock server port (4010) and the URL the scenario script calls |
| `DEMO_DEFAULT_FLAGS` | Demo flags on the mock server's first run (no `packages/mocks/.data/demo-flags.json` yet). `pnpm demo` sets `phase2-only`: Phase 2 on, marketplace off (the MVP pilot). Empty: both on |

### Local infrastructure only
`.env.example` also lists the names `infra/local/docker-compose.yml` and the repo scripts read: `POSTGRES_PASSWORD` (container superuser, never used by apps), `APP_MIGRATOR_PASSWORD`, `APP_USER_PASSWORD` / `APP_WORKER_PASSWORD` / `APP_OPS_PASSWORD` (set on the roles by `pnpm db:migrate`, local only), the `*_HOST_PORT` overrides, `SMS_SINK_URL`, `FAKE_PAY_URL`, `FAKE_PAY_WEBHOOK_URL`, `WHATSAPP_PROVIDER` (`fake` locally), `WHATSAPP_FAKE_URL`, `WHATSAPP_FAKE_WEBHOOK_URL`, `WHATSAPP_WEBHOOK_SECRET`, `GATEWAY_PORT` (messaging-gateway health, 4002), `AI_SERVICE_URL` / `AI_SERVICE_TOKEN` (set by `pnpm dev` when ai-service is installed), `OLLAMA_URL` and `ASK_LINK_MODEL` (Ask Link; off when `OLLAMA_URL` is empty), and dummy `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for `aws-local`.

`pnpm env:check` fails when code (TS, JS, Python, the compose file) reads a name that `.env.example` does not list.

## 4. Seed data (`pnpm db:seed`)

| Set | Content | Marked as |
|---|---|---|
| Reference data | Curricula (NATIONAL, IGCSE, AMERICAN, NILE), school years, academic terms, subjects | `confirmed = false` until OD-07 is decided |
| One district | One governorate + area (designs use Maadi, Cairo) with a few fictional centres, halls, open slots, teachers, groups and sessions | `sample` — fictional names only (OD-06) |
| Commission rules | Global defaults: `rent_fee` 5%, `booking_commission` 5% | Defaults (OD-01, OD-02) |
| Feature flags | Phase 2–3 features off; landing-page Phase 2 sections hidden (OD-48) | — |
| Users | One user per app role — parent, teacher, centre owner, staff — with fake phone numbers whose OTPs land in `sms-sink`. Also a second centre owner (centre B) for the cross-tenant tests | `sample` |
| Ops users | Two `link_ops` users, one with the "agent" bundle and one with the "finance" bundle (OD-37). They sign in to the ops console through the local **`oidc-stub`** (SSO), never with phone OTP (MKT-OPS-08) | `sample` |

The seed never contains a real person's data.

**Built so far (Part 1):** reference data (4 curricula, 31 school years — Nile years wait for OD-07 —, 2 terms of 2026/27, 8 subjects); 2 Maadi centres (Al Nour, verified; Dar El Elm, pending) with 3 halls; 3 teachers with subjects; 9 users and their role assignments; both commission defaults; 10 Phase 2–3 flags, all off. Open slots, groups and sessions arrive with their tables (E5, E6). Seed IDs are fixed and readable (`00000000-0000-7000-8000-a00000000001` = centre 1), so the seed is idempotent. Phone numbers are placeholders in `+2010000000NN`; they only ever reach `sms-sink`.

## 5. Commands

All commands are Node scripts, so they run the same in PowerShell, cmd and bash. Status: **real** = works now; *planned* = arrives with the story named.

| Command | What it does | Status |
|---|---|---|
| `pnpm install` | Install workspace dependencies | real |
| `pnpm dev:infra` | `docker compose up -d --build --wait` for §2; fails fast if Docker is not running | real |
| `pnpm dev:reset` | Drop the local volumes, start §2, migrate and seed (asks first; `--yes` skips) | real |
| `pnpm db:migrate` / `db:rollback` / `db:status` | dbmate, as `app_migrator` (ADR-0006); `db:migrate` also sets local role passwords | real |
| `pnpm db:seed` / `pnpm seed:demo` | **Wipe** the app tables and load the demo world: the same people, phones, centres and halls as the mock fixtures (`apps/core-api/seeds/demo.ts`, deterministic IDs, phones encrypted). `APP_ENV=local` only | real |
| `pnpm seed:demo [--reset \| --if-empty]` | Loads the demo world (wiping the app tables; `APP_ENV=local` only). `--if-empty` keeps a database that already has users (what `pnpm run setup` uses) | real |
| `pnpm ops:verify-centre <centreId|phone>` | Local stand-in for Link ops: a pending centre (C01) or a moved pin becomes verified; audited. `APP_ENV=local` only; also in the live Demo controls | real |
| `pnpm db:types` | Regenerate the Kysely row types (`apps/core-api/src/db/schema.ts`) from the migrated schema; CI fails on a diff | real |
| `pnpm run doctor [--json]` | Read-only machine check: a ✓ / ⚠ / ✗ table (Node 24, pnpm pin, git, Docker running, Python 3.12 + uv, Ollama, ports, `.env.local` names, container health, disk, RAM; on Windows long paths, `core.autocrlf`, WSL 2). Exit 1 on any ✗. Type `run`: `pnpm doctor` is pnpm's own command | real |
| `pnpm run setup [--dry-run] [--skip-ai] [--reset-data]` | From a clean clone to ready: doctor, install, `.env.local`, services, migrate, sample data into an empty database, `uv sync` for ai-service. Idempotent. Windows install order and fixes: [setup-windows.md](setup-windows.md) | real |
| `node scripts/env-local.mjs [--force]` | Write a fresh `.env.local` (local ports, random secrets, every other `.env.example` name as a commented placeholder). On an existing file it only appends the names it lacks; `--force` rewrites it (keeping `FIELD_KEY_LOCAL` and `HMAC_KEY_LOOKUP`) | real |
| `pnpm env:check` | Fail if code reads an env name missing from `.env.example` | real |
| `pnpm dev` | Live mode on this machine: §2 services, migrations, the demo world if the database is empty (`--reset` re-seeds), core-api (api :4000, worker, messaging-gateway :4002; restart on change), web :3000 and the teacher app :8081 with `API_MODE=live`. Codes go to sms-sink :8093. ai-service :8090 too when it is installed (`pnpm ai:models`); whatsapp-fake :8094 catches approved parent messages. The ops console is not started yet | real (R1) |
| `pnpm voice:try [file.wav]` | One sample voice note end to end against `pnpm dev` (needs ai-service): sign-in as Ms Salma, the record due, signed upload to aws-local S3, draft extraction; prints the times and the STT / LLM model versions. Synthetic bench audio by default | real (R3) |
| `pnpm lint` | ESLint + RTL check; `ruff` for ai-service | real |
| `pnpm typecheck` | `tsc`; `mypy` for ai-service | real |
| `pnpm test` | Unit tests (every package; core-api's without a database) | real |
| `pnpm test:api` | core-api integration (accounts, tokens, idempotency, C01, invites), events (outbox → SNS → SQS → consumer, inbox dedupe, DLQ) and the RLS suite, on their own database `link_test` and Redis DB 1 — never your local data. `--fresh` recreates `link_test` | real |
| `pnpm test:rls` | Cross-tenant suite only: RLS on every table (or a documented reason), no role bypasses RLS, owner A reads no row of centre B in any `centre_id` table, phones never in clear, and an API sweep generated from `openapi.json` (every path with an ID: A gets `404` for B) | real |
| `pnpm test:money` | Golden tests for worked examples A–I (Example H also through the real rent-invoice job), property tests on the real ledger (INV-01, INV-15, replay changes nothing), and the seat tests (per-session counting, a hold over a full session, waitlist offers, the database guard, the Redis rebuild, 20 parents for the last 3 seats, 50 for the last one), on `link_test` | real (R2b) |
| `pnpm openapi:generate` | `apps/core-api/openapi.json` from the Zod contract, then `packages/api-client/src/generated/openapi.ts` from it | real |
| `pnpm openapi:check` | Fails when either generated file differs from the code (CI) | real |
| `pnpm test:e2e:mock` / `pnpm test:e2e:live` | The specs in `apps/web/e2e-modes` (sign-in as each role, invites, C01) against `pnpm demo` or `pnpm dev`: the same files in both modes | real |
| `pnpm events:check` | Event-contract (schema registry) compatibility check | *planned* (Part 2) |
| `pnpm i18n:check` | Missing AR/EN keys fail (RTL-11) | real |
| `pnpm ai:eval` | Write one `<id>.pred.json` per gold note with ai-service (`--mode text` or `--mode audio --models a,b [--stt-device cpu]`, `--llm qwen3:8b` or `--no-llm`, `--label`; resumable, into `evals-runs/`), then score them with `link_eval run` into `evals/reports/<date>-<mode>-<model>-<llm>.md` (+ JSON). `--gold apps/ai-service/bench/gold --audio-dir apps/ai-service/bench/audio` runs the Windows-TTS clips; `--calibrate` adds the report-only `link_eval calibrate` (`<name>.calibration.md`) | real |
| `pnpm ai:ingest-recordings <folder>` | The team's gold recordings: matches `syn-NNN.*` to gold v1 ids, writes private mono 16 kHz WAV copies to `evals/gold/audio/` (git-ignored; refuses a tracked folder), reports missing / extra / duplicate takes, writes measured durations to `evals/gold/recording-metadata/` | real |
| `pnpm ai:models [name…]` | Download the Whisper models into `apps/ai-service/.models` (resumable; no name = all three) | real |
| `pnpm ai:bench --models … --devices cuda,cpu` | STT speed and quick WER on the synthetic bench notes (resumable, `apps/ai-service/bench/out`; ADR-0007) | real |
| `uv --directory apps/ai-service run python -m ai_service` | ai-service alone (needs `AI_SERVICE_TOKEN`); `pilot:start` (with `PILOT_VOICE=1`) and `pnpm demo` start it for you | real |
| `pnpm mock:server` | The shared demo mock server on 4010 (same MSW handlers, in-memory state, `APP_ENV=local` only) | real |
| `pnpm scenario:demo-followup` | Reset the running mock server to the Phase 2 demo scenario (§5.1) | real |
| `pnpm demo` | Mock server + web (3000) + teacher app on Expo web (8081), all in `mock-server` mode with Demo controls. First run: Phase 2 on, marketplace off (the MVP pilot, `DEMO_DEFAULT_FLAGS=phase2-only`). Restarts a crashed app up to 3 times. Stop any other `pnpm dev` of the web app first (Next allows one dev server per app) | real |
| `pnpm demo:warm` | After `pnpm demo` is up: requests every Demo Day page and its scripts once, so nothing compiles cold on stage (the first owner page and the teacher bundle each take about a minute cold) | real |
| `pnpm i18n:export-review` / `pnpm i18n:apply-review <csv>` | Export the pilot-screen and demo-path strings to `docs/pilot/strings-to-review.csv`; write the reviewed Arabic back (refuses broken ICU, placeholders or Western digits) | real |
| `pnpm check:public-demo` | Builds the web app as the public demo ships (production, API mode `mock`, no Demo controls) into `apps/web/.next-public` and fails if any presenter tool — the banner's "Demo tools" link or the Demo controls — is in the bundles (Step 2B). Runs in CI | real |
| `pnpm prod:local [--story\|--no-build\|--down\|--wipe]` | The **production** images and `deploy/docker-compose.prod.yml` on this machine with `LINK_ENV=staging` (the only mode where the local fakes and the sample world run next to production builds), behind Caddy on 3000; `--story` then runs the nine-step connected story against it and prints the image sizes. Writes `deploy/.env.staging` once (fresh secrets, git-ignored). Behind a TLS-inspecting proxy set `EXTRA_CA_FILE`. Deploys nothing | real |
| `pnpm prod:env [--domain …]` | Writes `deploy/.env.production` for one server (fresh secrets, mode 600, never overwrites): `LINK_ENV=production`, `PAYMENT_PROVIDER=none`, `WHATSAPP_PROVIDER=manual`, file storage. How to run it: [operations.md](operations.md) | real |
| `deploy/backup.sh` / `deploy/restore.sh` | Encrypted `pg_dump` (keep `BACKUP_KEEP`, optional `BACKUP_S3_URI`) and restore into a new database (or `--over-live`); CI restores a backup and runs the RLS suite on the copy | real |
| `pnpm pilot:*` | The concierge pilot on one laptop (OD-50, ADR-0008): `pilot:init`, `pilot:cert`, `pilot:import`, `pilot:build`, `pilot:check`, `pilot:start`, `pilot:backup`, `pilot:restore`, `pilot:metrics`, `pilot:wipe`, **`pilot:preflight`** (✅/❌ per item with a fix in Arabic and English; exits non-zero on any ❌), **`pilot:practice` / `pilot:practice-wipe`** (the training centre, separate from the real data), **`pilot:guides`** (the quick guides as A4 PDFs). Steps: [docs/pilot/runbook.md](pilot/runbook.md) | real |
| `pnpm --filter @link/pilot test:e2e` | The pilot end to end (PIN sign-in, the loop with hand-sent WhatsApp, axe in AR/EN), the pilot route crawler (`routes.spec.ts`) and the guide's tour 4 (`tour.spec.ts`) on the real pilot builds; run `pnpm pilot:build` first | real |
| `pnpm --filter @link/web test:e2e:demo` | Owner web rule tests (Batch 6), the cross-app Arabic walkthrough, the **route crawler** (`routes.spec.ts`: every screen in `apps/web/src/screens.ts` as each role, AR and EN; fails on 404/500, a not-found page, a console error or a broken link) and the **feature tours** (`guide.spec.ts`: docs/testing/feature-tours.md tours 1–3, step by step) and the **connected story** (`story.spec.ts`: docs/testing/walkthrough.md, the nine steps across roles), against `pnpm demo` (started if not running) | real |
| `http://localhost:3000/{lang}` | The landing page (Figma `68:616`, ADR-0009): path A **Try Link with your centre** (`/{lang}/try`, a demo in the browser under the visitor's centre name) and path B **Request a free pilot** (`/{lang}/pilot`, emailed to `PILOT_REQUEST_TO` through Resend; with no `EMAIL_API_KEY` it prints a redacted line). `/{lang}/sign-in` is "Sign in (pilot centres)". Tests: `apps/web/e2e/landing.spec.ts` (API mode `mock`) and `src/pilot-request.test.ts` | real |
| `pnpm landing:shots` | The six real app screens for "How it works" (Arabic, sample data), captured from the running `pnpm demo` into `apps/web/public/landing/` | real |
| `pnpm og:images` | The landing page's social cards (Open Graph / X), Arabic and English, into `apps/web/public/og/` | real |
| `http://localhost:3000/{lang}/dev` | Dev route index (demo and mock modes only): every screen with its link, status and Figma node, one-click sign-in as each sample user, the teacher app and the Demo controls | real |
| `pnpm testing:walkthrough` | docs/testing/walkthrough.md (the connected story) → `walkthrough.pdf` (A4, one page per role switch) | real |

### 5.1 Demo scenario `demo-followup` (sample data only)
Al Nour Centre · Ms Salma · "Secondary 2 · Maths" (Wed & Sat 5 PM), 18 fictional students. Mariam was absent last session; the voice note for today's session says she is absent again, so confirming the record raises `consecutive_absences` (n = 2), assigned to Reception and due the same day. Her guardian is opted in to WhatsApp. Nour already has an open, overdue case and her guardian replied STOP; Omar's guardian has SMS consent only; Habiba has no guardian phone. Omar Ali's unit-test score was corrected 21 → 12 ("typing error"). "Ahmed Samir" and "Ahmed Samy" make "أحمد" in the voice note ambiguous (T07). The voice fixture is the transcript «مريم غابت النهارده، وأحمد جاب ١٤ من ٢٠ في الكويز، ومحتاجين نراجع قواعد الإشارات الجاية» with one high, one medium and one low confidence item and 17 unmentioned students. Sign in with code `123456`: parent `+20 10 0000 0001`, teacher `…0002`, owner `…0003`, Reception `…0004`. `GET /__demo/state` shows records, flags, cases and messages as JSON.

### 5.2 Demo flags and Demo controls
- **Flags.** `phase2` (follow-up tools: teacher Today and Records, owner follow-up pages, Ask Link, parent updates feed) and `marketplace` (`marketplace.enabled`: search, booking, rooms, earnings, payouts). The teacher tabs follow them (CF-29): Phase 2 only → Today · My groups · Records; marketplace only → My groups · Rooms · Earnings; both → Today · My groups · Rooms · Earnings. The owner nav shows the follow-up items plus Staff when the marketplace is off. A flagged-off part is not rendered at all.
- **Persistence.** The mock server writes the flags to `packages/mocks/.data/demo-flags.json` (git-ignored) and reads them at start, so a restart keeps the presenter's choice. Delete the file to go back to `DEMO_DEFAULT_FLAGS`. Reset scenario keeps the flags and clears the rest.
- **Simulate a new day** (`POST /__demo/new-day`): moves every open case's due date back one day, so a case due today becomes overdue (FUP-CAS-05). Repeatable; Reset scenario undoes it.
- **Provider events** (`POST /__demo/provider` `advance` | `fail`) and **guardian reply** (`POST /__demo/reply`): the only way a message's status moves on the mock (BR-APR-11).
- **Speech-to-text: local Whisper (real) | fixture** (`realStt`, persisted with the flags; off by default and after Reset scenario in the e2e helpers). On: a recorded note is sent to the local ai-service as `synthetic` data and the proposal comes from the real pipeline; Ask Link's microphone transcribes the question for real, while its answers stay scripted and are labelled "Demo answer (scripted)". `pnpm demo` starts ai-service only if `apps/ai-service/.venv` and the `large-v3-turbo` model exist (otherwise the toggle has no effect and the fixture is used) and `DEMO_AI` is not `0` (the e2e configs set `0`). The Whisper model loads at start only if real speech-to-text was left on (`AI_PRELOAD`); otherwise the first real note waits about 10 s for it.

### Troubleshooting (Windows)
- **A port is held by a stuck process** (`pnpm demo` or `pnpm pilot:start` says the port is in use after a crash or a closed window): in PowerShell, `Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess`, then `Stop-Process -Id <pid> -Force`. Demo ports: 3000, 4010, 8081. Pilot ports: 8443, 8444, 3100. Stopping a terminal tab does not always stop the processes it started.
- **Port already in use** (often a native PostgreSQL on 5432): set `POSTGRES_HOST_PORT=5433` (or the matching `*_HOST_PORT`) in `.env.local` and use the same port in the `DATABASE_URL*` values.
- **pnpm installed with npm but Turborepo says `pnpm` is not recognised:** reinstall with `npm install -g --allow-scripts=pnpm pnpm@12.8.1`.
- **Docker not running:** `pnpm dev:infra` stops with a message; start Docker Desktop (WSL2 backend).

## 6. Outside accounts and sandboxes

Request these early; several take weeks.

| Account | Needed for | Request in | In use from | Who requests | Decision |
|---|---|---|---|---|---|
| Cloud account(s) for `dev` / `staging` | E0-03 | M0 | M0 | Eng lead | OD-31 |
| GitHub organisation + Actions | E0-01, E0-02 | M0 | M0 | Eng lead | — |
| Sentry and PostHog projects | E0-10 | M0 | M0 | Eng lead | — |
| Expo EAS account | E0-14 | M0 | M1 | Eng lead | — |
| Payment-provider sandbox + merchant onboarding | E8-03, E8-05, E8-08 | **M0** | M2 | Finance + Eng lead | OD-04 |
| SMS aggregator sandbox | E1-01, E13-01 | **M0** | M1 | Eng lead | OD-45 |
| Ops SSO (OIDC) app registration | E1-06 | M0 | M1 | Eng lead | — |
| Maps / geocoding key with a cost cap | E3-03, E7-02 | M1 | M1 | Eng lead + Finance | OD-46 |
| eKYC vendor sandbox | E4-02 | M1 | M1 (manual review until then) | Founders + Legal | OD-47 |
| Push: Firebase project, Apple developer account (APNs) | E1-07, E13-01 | M1 | M1 | Eng lead | — |
| Email provider | E13-01 | M1 | M1 | Eng lead | — |
| STT and LLM vendor trial accounts | E15-03 | M0 | M2 | Eng (AI) | OD-26 for real data |
| Payout-rails sandbox (bank / wallet) | E10-03 | M2 | M4 | Finance | OD-04 |
| Production cloud account and region | E14-04 | M4 | M5 | Eng lead + Legal | OD-26, OD-31 |
| WhatsApp Business (Meta verification, templates) | Phase 2 | Late Phase 1 | Phase 2 | Founders | OD-40 |
