# 14 · Development environment

How to run Link locally, which settings it reads, which seed data it ships with, and which outside accounts each milestone needs. **No code exists yet**: names and commands below are the agreed targets. Make them real in E0 (see [12-backlog-phase1.md](12-backlog-phase1.md)).

> **Synthetic data only.** `dev` and `staging` never hold real personal data. Real data arrives only in production (E14-04), after OD-26 is decided. Consented real voice notes for E15 follow the same rule for vendors outside Egypt.

---

## 1. Tools

| Tool | Version (pin in `.tool-versions`) | For |
|---|---|---|
| Node.js | current LTS | core-api, web, ops, teacher app |
| pnpm | 9.x | Workspaces (ADR-0004) |
| Python | 3.12 | ai-service |
| uv | latest | Python dependencies, `ruff`, `pytest`, `mypy` |
| Docker + Docker Compose | current | Local services (§2) |
| Expo CLI / EAS CLI | current | Teacher app builds |
| Terraform | pinned in `infra/` | Cloud environments |

## 2. Local services (`docker compose up`)

The compose file lives in `infra/local/docker-compose.yml`.

| Service | Image / build | Port | Notes |
|---|---|---|---|
| `postgres` | PostgreSQL 16 + PostGIS + pgvector (custom image in `infra/local/postgres/`) | 5432 | Extensions created by migrations: `postgis`, `vector`, `btree_gist` ([06](06-data-model.md) §0). Roles `app_user`, `app_worker`, `app_ops`, `app_migrator`. |
| `redis-cache` | Redis 7, `maxmemory-policy allkeys-lru` | 6379 | Cache-aside reads ([05](05-architecture.md) §5) |
| `redis-state` | Redis 7, `maxmemory-policy noeviction`, AOF on | 6380 | OTP, seat holds, idempotency, rate limits, locks |
| `localstack` | LocalStack | 4566 | S3 (voice, media, exports buckets), SQS/SNS (events + DLQs), KMS (field-encryption and storage keys), Secrets Manager |
| `sms-sink` | Small HTTP fake behind the `SmsSender` adapter | 8090 | Captures every SMS (OTP codes, invites); browse them at `http://localhost:8090` |
| `mail-sink` | Mailpit | 8025 | Captures email |
| `fake-pay` | Fake provider behind the `PaymentProvider` and `PayoutProvider` adapters | 8091 | Hosted-checkout page, Fawry reference, signed webhooks, settlement reports — for tests without a sandbox. Provider value `fake`, never allowed in prod ([06](06-data-model.md) `payments.provider`) |
| `oidc-stub` | Local OpenID Connect provider (mock IdP) | 8092 | Ops console SSO for local and test runs (`OPS_OIDC_ISSUER` points here). Pre-loaded with the ops seed users (§4). Never used outside `local`/`dev` |

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
| `S3_ENDPOINT`, `S3_REGION` | Object storage (LocalStack locally) |
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

## 4. Seed data (`pnpm db:seed`)

| Set | Content | Marked as |
|---|---|---|
| Reference data | Curricula (NATIONAL, IGCSE, AMERICAN, NILE), school years, academic terms, subjects | `confirmed = false` until OD-07 is decided |
| One district | One governorate + area (designs use Maadi, Cairo) with a few fictional centres, halls, open slots, teachers, groups and sessions | `sample` — fictional names only (OD-06) |
| Commission rules | Global defaults: `rent_fee` 5%, `booking_commission` 5% | Defaults (OD-01, OD-02) |
| Feature flags | Phase 2–3 features off; landing-page Phase 2 sections hidden (OD-48) | — |
| Users | One user per app role — parent, teacher, centre owner, staff — with fake phone numbers whose OTPs land in `sms-sink` | `sample` |
| Ops users | Two `link_ops` users, one with the "agent" bundle and one with the "finance" bundle (OD-37). They sign in to the ops console through the local **`oidc-stub`** (SSO), never with phone OTP (MKT-OPS-08) | `sample` |

The seed never contains a real person's data.

## 5. Commands (placeholders until code exists)

| Command | What it does |
|---|---|
| `pnpm install` | Install workspace dependencies |
| `docker compose -f infra/local/docker-compose.yml up -d` | Start local services (§2) |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / load seed data |
| `pnpm dev` | Run api, workers, gateway, web, ops and the teacher app locally |
| `pnpm lint` | ESLint + Prettier; `ruff` for ai-service |
| `pnpm typecheck` | `tsc`; `mypy` for ai-service |
| `pnpm test` | Unit + integration tests |
| `pnpm test:rls` | Cross-tenant suite: a user of centre A gets `404` for centre B on every endpoint (10 §2) |
| `pnpm test:money` | Ledger property tests (INV-01, INV-15) + golden tests for worked examples A–I + seat tests (08 §9) |
| `pnpm openapi:check` | OpenAPI drift check; regenerates `packages/api-client` |
| `pnpm events:check` | Event-contract (schema registry) compatibility check |
| `pnpm i18n:check` | Missing AR/EN keys fail (RTL-11) |
| `pnpm ai:eval` | Run the eval harness against the gold set (E15-02) |

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
