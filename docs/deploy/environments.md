# Environments

Every running copy of Link, one row each. The URLs themselves live in [deploy/deployed-urls.json](../../deploy/deployed-urls.json) (the source for `pnpm smoke:deployed`); every app answers `/health` (teacher apps: `/health.json`) with the commit it runs. For whom each link is: [where-is-what.md](where-is-what.md). **Every deployment builds from `main` only** (CI step `pnpm run check:deploy-branch` covers the deploy configs in the repo; the source branch of a Railway service or a Vercel project is a dashboard setting, recorded here and read on 2026-10-16). Variable **names** only, never values.

## The live staging (Stage 3, 2026-10-16) — sample data, testers only

| Thing | What it is | Branch | URL | Mode | Variable names | How it deploys |
|---|---|---|---|---|---|---|
| **Vercel `link-ai-staging-web`** | landing + parent PWA + owner web on the **real core-api** | `main` | https://link-ai-staging-web.vercel.app | live, `NEXT_PUBLIC_APP_ENV=staging` (banner "Test environment — sample data"), real map | `NEXT_PUBLIC_API_MODE`, `NEXT_PUBLIC_APP_ENV`, `CORE_API_URL` (the `/v1` proxy, so cookies stay first-party), `LINK_PROXY_SECRET` (signs the visitor's address for core-api), `NEXT_PUBLIC_MAP_PROVIDER`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TEACHER_APP_URL` | Vercel Git, root `apps/web` |
| **Vercel `link-ai-staging-teacher`** | teacher app, Expo web build, on the real core-api | `main` | https://link-ai-staging-teacher.vercel.app | live, staging banner, J01 real map | `EXPO_PUBLIC_API_MODE`, `EXPO_PUBLIC_API_BASE_URL` (Bearer + CORS), `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_MAP_PROVIDER`, `EXPO_PUBLIC_SITE_URL` | Vercel Git, root `apps/teacher-app` |
| **Vercel `link-ai-staging-ops`** | ops console on the real core-api | `main` | https://link-ai-staging-ops.vercel.app | live, staging banner; `OPS_IP_ALLOWLIST` empty (open outside production) | `NEXT_PUBLIC_APP_ENV`, `CORE_API_URL` | Vercel Git, root `apps/ops` |
| **Railway `core-api-l9aa`** (project `link-ai-staging`, US East) | the real core-api: `api` + `worker` (no gateway: no provider webhooks yet) | `main` | https://core-api-l9aa-production.up.railway.app | **`LINK_ENV=staging`**, `APP_ENV=staging`; the hosted-staging guard: bookings off (`PAYMENT_PROVIDER=none`), `SMS_PROVIDER=inbox` (the private code inbox at `/__staging/sms`, Basic auth `SMS_SINK_TOKEN`), `WHATSAPP_PROVIDER=manual`, `GEOCODER_PROVIDER=nominatim`; `/__demo` off | as before plus `LINK_ENV`, `SMS_PROVIDER`, `SMS_SINK_TOKEN`, `GEOCODER_PROVIDER`, `GEOCODER_USER_AGENT`, `CORS_ALLOWED_ORIGINS` (both teacher origins); `LINK_PROXY_SECRET` (the web's signed client address); the Codex leftovers were removed on 2026-10-16 (`CORE_API_UPSTREAM_PORT`, `MOCK_SERVER_INTERNAL_URL`, `MOCK_SERVER_PORT`, `DEMO_DEFAULT_FLAGS`, `DEMO_REAL_STT`, `SMS_SINK_URL`) | Railpack; **pre-deploy** `node apps/core-api/dist/migrate.mjs && node apps/core-api/dist/seed-staging.mjs` (the sample world, only into an empty database — loaded 2026-10-16); auto-deploy on push to `main` |
| **Railway `ai-service`** | the public trial's demo API (mock server) + private Whisper `tiny` | `main` | https://ai-service-production-43b7.up.railway.app | mock server, `/__demo` off | `AI_*`, `CORS_ALLOWED_ORIGINS`, `DEMO_REAL_STT`, `HF_HOME`, `XDG_CACHE_HOME`, `MODEL_ROUTING_CONFIG`, `PORT` | `Dockerfile.railway-demo`, healthcheck `/health` |
| **Railway `postgres`** | Postgres 16 + PostGIS + pgvector, volume `postgres-data` | `main` (moved by Ahmed) | private | sample data | `POSTGRES_*`, `PGDATA`, `APP_MIGRATOR_PASSWORD`, `CREATE_TEST_DB` | `deploy/railway-postgres.Dockerfile` |
| **Railway `redis-state`**, **`redis-cache`** | Redis 7 (`redis-state` with a volume) | image | private | — | — | image |

## The public trial ("Try Link": sample data, a sandbox per visitor, ADR-0010)

| Thing | What it is | Branch | URL | Mode | Variable names |
|---|---|---|---|---|---|
| **Vercel `link-ai-web`** | landing + "Try Link" | `main` | https://link-ai-web-sigma.vercel.app | **mock-server** on the demo API, each visitor in their own sandbox (since 2026-10-16), real map | `NEXT_PUBLIC_API_MODE=mock-server`, `NEXT_PUBLIC_API_BASE_URL` (the demo API), `NEXT_PUBLIC_MAP_PROVIDER`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TEACHER_APP_URL` |
| **Vercel `link-ai-teacher-demo`** | teacher app for the trial | `main` | https://link-ai-teacher-demo.vercel.app | mock-server (Railway `ai-service`), real map | `EXPO_PUBLIC_API_MODE`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_MAP_PROVIDER`, `EXPO_PUBLIC_SITE_URL` |

## Local

| Thing | URL | Mode |
|---|---|---|
| `pnpm dev` | :3000 web, :4000 core-api, :8081 teacher, :3001 ops | live on the local fakes |
| `pnpm demo` | :4010 mock server | mock-server |
| `pnpm prod:local` | :3000 | production images, `LINK_ENV=staging` (not the hosted staging: no Railway, bookings on with fake-pay) |

## How a tester gets in (until Google/email sign-in, Stage 1)

Sign in with a **sample** phone number (`010 0000 000x`, docs/14 §4); the code is **not** sent — it lands in the private inbox at `https://core-api-l9aa-production.up.railway.app/__staging/sms` (browser asks for a password: any user name, `SMS_SINK_TOKEN` from Railway → `core-api-l9aa` → Variables). Codes are kept one hour. Bookings are off on staging ("booking opens soon").

## Branch inventory (2026-10-16, Part A)

Before any deletion, every branch not merged by git was archived as a tag `archive/<branch>` on GitHub, so nothing is lost.

| Branch / place | What it holds | In `main`? | Works? | Decision |
|---|---|---|---|---|
| `origin/codex/deploy-voice-demo` (14 commits) | Railway voice demo: proxy, mock-server settings, small Whisper models, demo ai-service image | **Yes**, merged 2026-10-15 as files (`4da296e`), except two refusals: the production ai-service Dockerfile overwrite (kept as `Dockerfile.railway-demo`) and the English-default web (now `NEXT_PUBLIC_DEFAULT_LOCALE`) | yes (it is what Railway runs) | archive tag `archive/codex-deploy-voice-demo`; **deleted** 2026-10-16 (ai-service builds from `main`) |
| `origin/codex/vercel-teacher-demo` (3 commits) | Teacher-app SPA rewrite, Railway Postgres Dockerfile, English-default web | **Yes**, same merge, same locale refusal | yes | archive tag `archive/codex-vercel-teacher-demo`; delete once `postgres` builds from `main` |
| `codex/setup-golive` (local only, worktree `D:\Link_Edu-codex`, 1 commit of 9 Oct, no uncommitted changes) | An earlier, separate version of `pnpm doctor` / `pnpm setup` and the go-live guide | **Superseded**: S0 (PR #3, `17d2216`) merged a different, larger implementation of the same scripts; its two test files test the other implementation | its tests target code `main` doesn't have | **Not merged** (duplicate, not a rule problem); archive tag `archive/codex-setup-golive`; worktree unregistered and branch deleted. The folder `D:Link_Edu-codex` still holds files (Windows path length, and a guard on this PC blocks deleting it): Ahmed deletes it by hand |
| `codex/nlp-eval` (local) | NLP eval work | yes (fully merged) | — | deleted |
| `origin/claude/serene-gauss-ey7d2z`, `origin/claude/link-implementation-finish-shqdku` | S0–S4 work branches | yes (fully merged) | — | deleted |
| `chore/merge-codex-deploy`, `docs/staging-inventory`, `docs/cleanup`, `fix/prod-local`, `stage0/demo-lock` (local + origin) | the 2026-10-15 task branches | yes (merged) | — | deleted |
| Stashes | none | — | — | — |

## Proof of the demo-route lock on the live URLs (2026-10-16)

| Request (anonymous) | Answer |
|---|---|
| `ai-service` `GET /__demo/state/en`, `POST /__demo/reset`, `POST /__demo/settings` | 404 |
| `ai-service` `POST /demo/__demo/reset`, `/x/__demo/reset`, `/%5F%5Fdemo/reset` | 404 |
| `core-api-l9aa` `POST /__demo/story/reset`, `POST /demo/__demo/reset` | 404 |
| `ai-service` `GET /health`, `GET /v1/feature-flags`; `core-api-l9aa` `GET /health` | 200 |

`DEMO_ROUTES_SECRET` is unset on Railway (Ahmed's decision 6), so the routes are off rather than behind a secret.

## Open points (waiting on Ahmed)

| # | What | Why it waits |
|---|---|---|
| 1 | **Nightly backup on Railway** (`deploy/backup.Dockerfile`, a cron service running `deploy/backup.sh`) | Railway refused a new service: "Free plan resource provision limit exceeded". Needs a paid plan, or one service removed, or the backup run elsewhere (your choice) |

## Map settings (Part B, 2026-10-16)

| Where | Variable | Today | To switch on the real map |
|---|---|---|---|
| Vercel `link-ai-web` | `NEXT_PUBLIC_MAP_PROVIDER` | unset → the drawn map | `openfreemap` (no key; redeploy) |
| Vercel `link-ai-teacher-demo` | `EXPO_PUBLIC_MAP_PROVIDER` | unset → the drawn map | `openfreemap` |
| Railway `core-api-l9aa` | `GEOCODER_PROVIDER`, `GEOCODER_USER_AGENT` | unset → sample places | `nominatim` and `Link-staging (https://link-ai-web-sigma.vercel.app)`; matters from Stage 3, when the web calls core-api |

Proof on staging (2026-10-16): core-api ran migration 0019 in its pre-deploy step ("1 applied, 18 already there"); `/v1/geo/search` answers 401 without a session; the C02 picker flow (search → pick → drag → save → "Location under review" beside the approved pin) passed on `https://link-ai-web-sigma.vercel.app` in mock mode. Ops approval on staging waits for Stage 3 (the web on core-api); it is proven locally by `e2e-modes/location.spec.ts` (live).

## Changes on 2026-10-16 (the trial fix)

- The public trial's teacher entry was broken by the `/__demo` lock; the demo API now runs one sandbox per visitor (ADR-0010) and the trial web calls it (`mock-server`); `ai-service` `CORS_ALLOWED_ORIGINS` lists both trial origins.
- `link-platform-demo` deleted (Ahmed's approval).
- Both teacher projects build with `pnpm --filter @link/teacher-app run build:web` (writes `health.json`).
- The deployed check runs after every deploy of `main`, nightly and on demand (workflow `deployed`).
