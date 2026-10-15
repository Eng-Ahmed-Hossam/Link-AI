# Environments

Every running copy of Link, one row each. **Every deployment builds from `main` only** (CI step `pnpm run check:deploy-branch` covers the deploy configs in the repo; the source branch of a Railway service or a Vercel project is a dashboard setting, recorded here). Variable **names** only, never values. Checked 2026-10-16.

| Thing | What it is | Branch | URL | Mode | Variable names | How it deploys |
|---|---|---|---|---|---|---|
| **Local dev** (`pnpm dev`) | core-api (api, worker, gateway), web, teacher app, ops, Postgres, Redis, local fakes | any working branch | `http://localhost:3000` (web), `:4000` (core-api), `:8081` (teacher), `:3001` (ops) | live on the local fakes (sms-sink, fake-pay, whatsapp-fake) | `.env.example` (all) | by hand |
| **Local demo** (`pnpm demo`) | mock server + web + teacher app on sample data | any | `http://localhost:4010` (mock server) | mock-server | `DEMO_*`, `MOCK_SERVER_PORT` | by hand |
| **Local staging** (`pnpm prod:local`) | the production images and compose with `LINK_ENV=staging` | any | `http://localhost:3000` | staging, fakes, demo routes behind `DEMO_ROUTES_SECRET` | `deploy/.env.staging` (written once, never committed) | by hand; nightly in CI (`e2e-live.yml`, job `prod-local`) |
| **Railway `core-api-l9aa`** (project `link-ai-staging`, US East) | the real core-api: `api` and `worker` in one container (no gateway yet) | `main` (unpinned 2026-10-16; it was pinned to `9f1dfb2`) | `https://core-api-l9aa-production.up.railway.app` | `APP_ENV=staging`, no `LINK_ENV` (so `development` rules); `PAYMENT_PROVIDER=none`, `SMS_PROVIDER=fake` (no sink reachable), `WHATSAPP_PROVIDER=manual`, `QUEUE_PROVIDER=postgres`, `STORAGE_PROVIDER=file`. `/__demo` off (404). **Not used by either Vercel app yet** | `APP_ENV`, `DATABASE_URL*`, `APP_*_PASSWORD`, `REDIS_*_URL`, `FIELD_KEY`, `HMAC_KEY_LOOKUP`, `STORAGE_KEY`, `JWT_*`, `AI_SERVICE_*`, `PAYMENT_*`, `SMS_*`, `WHATSAPP_*`, `CORS_ALLOWED_ORIGINS`, `OPS_IP_ALLOWLIST`, `TRUST_PROXY`, `FILE_STORAGE_DIR`, `NEXT_PUBLIC_SITE_URL`, `PORT`, plus leftovers from the Codex proxy (`CORE_API_UPSTREAM_PORT`, `MOCK_SERVER_*`, `DEMO_*`) | Railpack build (`pnpm --filter @link/core-api build`); pre-deploy `node apps/core-api/dist/migrate.mjs`; start `main.mjs worker &` + `main.mjs api`; auto-deploy on push to `main` |
| **Railway `ai-service`** | **the public demo API**: the mock server (sample data) on port 8090, with private Whisper `tiny` (ai-service on 127.0.0.1:8091) beside it | `codex/deploy-voice-demo` → **`main`** (Part A) | `https://ai-service-production-43b7.up.railway.app` | mock server, `APP_ENV=local` inside the start command; real speech-to-text on; `/__demo` off (404) from `main` | `AI_*`, `CORS_ALLOWED_ORIGINS`, `DEMO_REAL_STT`, `HF_HOME`, `XDG_CACHE_HOME`, `MODEL_ROUTING_CONFIG`, `PORT` | Dockerfile `apps/ai-service/Dockerfile.railway-demo`; healthcheck `/health`; volume `ai-models` at `/models` (Whisper `tiny` downloaded once) |
| **Railway `postgres`** | Postgres 16 + PostGIS + pgvector, volume `postgres-data` at `/var/lib/postgresql/data` (`PGDATA` under it) | `codex/vercel-teacher-demo` → `main` **after a backup** (waiting, see Part A notes) | private only (`*.railway.internal`) | sample data | `POSTGRES_*`, `PGDATA`, `APP_MIGRATOR_PASSWORD`, `CREATE_TEST_DB` | Dockerfile `deploy/railway-postgres.Dockerfile` |
| **Railway `redis-state`** | Redis 7 with volume `redis-state-data` at `/data` | image `redis:7-alpine` | private only | — | — | image |
| **Railway `redis-cache`** | Redis 7, no volume | image `redis:7-alpine` | private only | — | — | image |
| **Vercel `link-ai-web`** (team `ahmed-hossams-projects-059a8e76`) | landing page + parent PWA + owner web | **not read yet** (Vercel CLI logged out) | `https://link-ai-web-sigma.vercel.app` | in the browser: **mock** (MSW; `mockServiceWorker.js` served, no Railway URL in the app bundles); opens in Arabic (`/ar`) | `NEXT_PUBLIC_API_MODE`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TEACHER_APP_URL`, `NEXT_PUBLIC_DEFAULT_LOCALE`, `NEXT_PUBLIC_CONTACT_*`, `EMAIL_*`, `PILOT_REQUEST_TO` | Vercel Git integration (branch and root folder to be read) |
| **Vercel `link-ai-teacher-demo`** | teacher app, Expo web build | **not read yet** | `https://link-ai-teacher-demo.vercel.app` | **mock-server** against the Railway `ai-service` URL (baked into the bundle) | `EXPO_PUBLIC_API_MODE`, `EXPO_PUBLIC_API_BASE_URL` | Vercel Git integration; `apps/teacher-app/vercel.json` (SPA rewrite) |
| **Vercel `link-platform-demo`** | a single static "Bundled Page" (not this repo's app) | **not read yet** | `https://link-platform-demo.vercel.app` | static | — | to delete if it has no domain, alias or recent deployment (Ahmed's rule 9) |

## Not yet true (Stage 3 changes it)

- The Vercel apps run on the mock, not on the real core-api. Stage 3 points them at `core-api-l9aa` in `LINK_ENV=staging`.
- core-api runs without `LINK_ENV`, so the staging guard rules of Stage 3 do not apply yet; it holds sample data only.
- No messaging-gateway on Railway (no provider webhooks yet).

## Branch inventory (2026-10-16, Part A)

Before any deletion, every branch not merged by git was archived as a tag `archive/<branch>` on GitHub, so nothing is lost.

| Branch / place | What it holds | In `main`? | Works? | Decision |
|---|---|---|---|---|
| `origin/codex/deploy-voice-demo` (14 commits) | Railway voice demo: proxy, mock-server settings, small Whisper models, demo ai-service image | **Yes**, merged 2026-10-15 as files (`4da296e`), except two refusals: the production ai-service Dockerfile overwrite (kept as `Dockerfile.railway-demo`) and the English-default web (now `NEXT_PUBLIC_DEFAULT_LOCALE`) | yes (it is what Railway runs) | archive tag, delete once `ai-service` builds from `main` |
| `origin/codex/vercel-teacher-demo` (3 commits) | Teacher-app SPA rewrite, Railway Postgres Dockerfile, English-default web | **Yes**, same merge, same locale refusal | yes | archive tag, delete once `postgres` builds from `main` |
| `codex/setup-golive` (local only, worktree `D:\Link_Edu-codex`, 1 commit of 9 Oct, no uncommitted changes) | An earlier, separate version of `pnpm doctor` / `pnpm setup` and the go-live guide | **Superseded**: S0 (PR #3, `17d2216`) merged a different, larger implementation of the same scripts; its two test files test the other implementation | its tests target code `main` doesn't have | **Not merged** (duplicate, not a rule problem); archive tag pushed, worktree removed, branch deleted |
| `codex/nlp-eval` (local) | NLP eval work | yes (fully merged) | — | deleted |
| `origin/claude/serene-gauss-ey7d2z`, `origin/claude/link-implementation-finish-shqdku` | S0–S4 work branches | yes (fully merged) | — | deleted |
| `chore/merge-codex-deploy`, `docs/staging-inventory`, `docs/cleanup`, `fix/prod-local`, `stage0/demo-lock` (local + origin) | the 2026-10-15 task branches | yes (merged) | — | deleted |
| Stashes | none | — | — | — |
