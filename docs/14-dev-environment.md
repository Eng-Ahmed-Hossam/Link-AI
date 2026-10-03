# 14 · Development environment

How to run Link locally, which settings it reads, which seed data it ships with, and which outside accounts each milestone needs. The local services, migrations, seed and env files are **real** (walking skeleton, Part 1). Commands still marked *planned* in §5 arrive with the stories named there ([12-backlog-phase1.md](12-backlog-phase1.md)).

**Quick start (Windows, macOS, Linux):** install Docker Desktop (WSL2 backend on Windows), Node 24+, pnpm 12 (`npm install -g --allow-scripts=pnpm pnpm@12.8.1`), Python 3.12 and uv. Then:

```bash
pnpm install
cp .env.example .env.local     # fill in local values (any random strings for passwords and secrets)
pnpm dev:infra                 # build + start §2 and wait until every service is healthy
pnpm db:migrate && pnpm db:seed
```

`pnpm dev:reset` drops the local volumes and does all of the above again (asks first).

> **Synthetic data only.** `dev` and `staging` never hold real personal data. Real data arrives only in production (E14-04), after OD-26 is decided. Consented real voice notes for E15 follow the same rule for vendors outside Egypt.

---

## 1. Tools

| Tool | Version (pin in `.tool-versions`) | For |
|---|---|---|
| Node.js | 24 LTS (`engines: >=24`) | core-api, web, ops, teacher app; repo scripts |
| pnpm | 12.8.1 (`packageManager` in `package.json`) | Workspaces (ADR-0004) |
| Python | 3.12 | ai-service |
| uv | latest | Python dependencies, `ruff`, `pytest`, `mypy` |
| Docker + Docker Compose | current | Local services (§2) |
| Expo CLI / EAS CLI | current | Teacher app builds |
| Terraform | pinned in `infra/` | Cloud environments |

## 2. Local services (`pnpm dev:infra`)

The compose file lives in `infra/local/docker-compose.yml` (project name `link`). `pnpm dev:infra` runs `docker compose up -d --build --wait` with `--env-file .env.local`. Every service has a healthcheck. Databases use named volumes (`pg-data`, `redis-state-data`); nothing bind-mounts `node_modules`. Host ports can be changed in `.env.local` (`POSTGRES_HOST_PORT`, `REDIS_CACHE_HOST_PORT`, …) — e.g. set `POSTGRES_HOST_PORT=5433` when a native PostgreSQL already uses 5432.

| Service | Image / build | Port | Notes |
|---|---|---|---|
| `postgres` | PostgreSQL 16 + pgvector + PostGIS 3 (custom image in `infra/local/postgres/`, based on `pgvector/pgvector:pg16`) | 5432 | Database `link`. The init script creates `app_migrator` (owner) and the extensions `postgis`, `vector`, `btree_gist` ([06](06-data-model.md) §0); migration 0001 creates the schemas and the roles `app_user`, `app_worker`, `app_ops` (ADR-0006). |
| `redis-cache` | Redis 7, `maxmemory-policy allkeys-lru` | 6379 | Cache-aside reads ([05](05-architecture.md) §5) |
| `redis-state` | Redis 7, `maxmemory-policy noeviction`, AOF on | 6380 | OTP, seat holds, idempotency, rate limits, locks |
| `aws-local` | Moto server (custom image in `infra/local/aws/`) — **replaces LocalStack**, which now needs an account token (ADR-0006) | 4566 | S3 (voice, media, exports buckets), SNS topic + one SQS queue and DLQ per consumer group (`notifications`, `platform-demo`), KMS aliases `storage` and `fields`, Secrets Manager. In memory: recreated on every start |
| `sms-sink` | Small HTTP fake behind the `SmsSender` adapter (`infra/local/fakes/sms-sink`) | 8090 | Captures every SMS (OTP codes, invites); browse them at `http://localhost:8090`. API: `POST /messages`, `GET /api/messages` |
| `mail-sink` | Mailpit | 8025 (UI), 1025 (SMTP) | Captures email |
| `fake-pay` | Fake provider behind the `PaymentProvider` and `PayoutProvider` adapters (`infra/local/fakes/fake-pay`) | 8091 | **Now:** hosted-checkout page (no card fields; it simulates success or failure) and signed webhooks (`x-fake-pay-signature: sha256=<HMAC>` with `PAYMENT_WEBHOOK_SECRET`; `POST /v1/test-webhook` sends one). **With E8-03:** Fawry reference, refunds, payouts, settlement reports. Provider value `fake`, never allowed in prod ([06](06-data-model.md) `payments.provider`) |
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
| `MODEL_ROUTING_CONFIG` | Per-task vendor, model and prompt version |
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
| `NEXT_PUBLIC_APP_ENV`, `EXPO_PUBLIC_APP_ENV` + `*_DEMO_CONTROLS` | `local` + `1` shows the dev-only **Demo controls** (reset scenario, mock provider events, parent reply, offline, Phase 2 switch). Never with `live`, never in production builds |
| `MOCK_SERVER_PORT`, `MOCK_SERVER_URL` | Mock server port (4010) and the URL the scenario script calls |

### Local infrastructure only
`.env.example` also lists the names `infra/local/docker-compose.yml` and the repo scripts read: `POSTGRES_PASSWORD` (container superuser, never used by apps), `APP_MIGRATOR_PASSWORD`, `APP_USER_PASSWORD` / `APP_WORKER_PASSWORD` / `APP_OPS_PASSWORD` (set on the roles by `pnpm db:migrate`, local only), the `*_HOST_PORT` overrides, `SMS_SINK_URL`, `FAKE_PAY_URL`, `FAKE_PAY_WEBHOOK_URL`, and dummy `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for `aws-local`.

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
| `pnpm db:seed` | Load the §4 sample data (refused when `APP_ENV=prod`) | real |
| `pnpm env:check` | Fail if code reads an env name missing from `.env.example` | real |
| `pnpm dev` | Run api, workers, gateway, ai-service, web, ops and the teacher app locally | *planned* (Part 2) |
| `pnpm lint` | ESLint + RTL check; `ruff` for ai-service | real (TS); *planned* (Python) |
| `pnpm typecheck` | `tsc`; `mypy` for ai-service | real (TS); *planned* (Python) |
| `pnpm test` | Unit + integration tests | real (frontend packages) |
| `pnpm test:rls` | Cross-tenant suite: a user of centre A gets `404` for centre B on every endpoint (10 §2) | *planned* (Part 2) |
| `pnpm test:money` | Ledger property tests (INV-01, INV-15) + golden tests for worked examples A–I + seat tests (08 §9) | *planned* (E8-01) |
| `pnpm openapi:check` | OpenAPI drift check; regenerates `packages/api-client` | *planned* (Part 2) |
| `pnpm events:check` | Event-contract (schema registry) compatibility check | *planned* (Part 2) |
| `pnpm i18n:check` | Missing AR/EN keys fail (RTL-11) | real |
| `pnpm ai:eval` | Run the eval harness against the gold set (E15-02) | *planned* (placeholder in Part 2) |
| `pnpm mock:server` | The shared demo mock server on 4010 (same MSW handlers, in-memory state, `APP_ENV=local` only) | real |
| `pnpm scenario:demo-followup` | Reset the running mock server to the Phase 2 demo scenario (§5.1) | real |
| `pnpm demo` | Mock server + web (3000) + teacher app on Expo web (8081), all in `mock-server` mode with Demo controls and the Phase 2 flag on. Stop any other `pnpm dev` of the web app first (Next allows one dev server per app) | real |

### 5.1 Demo scenario `demo-followup` (sample data only)
Al Nour Centre · Ms Salma · "Secondary 2 · Maths" (Wed & Sat 5 PM), 18 fictional students. Mariam was absent last session; the voice note for today's session says she is absent again, so confirming the record raises `consecutive_absences` (n = 2), assigned to Reception and due the same day. Her guardian is opted in to WhatsApp. Nour already has an open, overdue case and her guardian replied STOP; Omar's guardian has SMS consent only; Habiba has no guardian phone. Omar Ali's unit-test score was corrected 21 → 12 ("typing error"). "Ahmed Samir" and "Ahmed Samy" make "أحمد" in the voice note ambiguous (T07). The voice fixture is the transcript «مريم غابت النهارده، وأحمد جاب ١٤ من ٢٠ في الكويز، ومحتاجين نراجع قواعد الإشارات الجاية» with one high, one medium and one low confidence item and 17 unmentioned students. Sign in with code `123456`: parent `+20 10 0000 0001`, teacher `…0002`, owner `…0003`, Reception `…0004`. `GET /__demo/state` shows records, flags, cases and messages as JSON.

### Troubleshooting (Windows)
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
