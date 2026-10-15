# Staging on Vercel + Railway (Codex trial deployment)

Read-only inventory, 2026-10-15. **Source: only the git branches** `origin/codex/deploy-voice-demo` (14 commits) and `origin/codex/vercel-teacher-demo` (3 commits), both by Ahmed, 11–12 Oct. The Vercel and Railway dashboards were **not** opened, so service names, URLs, variable *values* and the run commands set in the dashboards are unknown. Everything marked *inferred* comes from the code; confirm it in the dashboards.

## What is deployed where

| Part | Host | Evidence | Status |
|---|---|---|---|
| Web (landing, parent PWA, owner web) | Vercel | `apps/web/proxy.ts` change, ADR-0009, launch prompt | inferred |
| Teacher app (Expo web build) | Vercel | `apps/teacher-app/vercel.json` (SPA rewrite) | inferred |
| **Demo API** = `packages/mocks` server (sample data) behind `scripts/railway-demo-proxy.mjs` | Railway | proxy sends `/demo/*` to the mock server (port 4010), everything else to core-api (port 4001) | inferred |
| core-api | Railway, same container as the proxy | proxy's `CORE_API_UPSTREAM_PORT` | inferred; may be unused |
| ai-service (private CPU Whisper) | Railway, same container as the demo API | branch Dockerfile runs both, `AI_SERVICE_HOST=127.0.0.1` | inferred |
| Postgres (PostGIS + pgvector) | Railway | `deploy/railway-postgres.Dockerfile` | inferred |
| Redis, worker, messaging-gateway | none seen | no file mentions them | probably not deployed |

## Mode

| Question | Answer |
|---|---|
| Which mode? | **Demo on fakes.** The mock server (`packages/mocks/src/server.ts`) exits unless `APP_ENV=local`, so the Railway container must run with `APP_ENV=local`. It is not `staging` or `production`, and the production guard (`LINK_ENV`) is not in play. |
| Are the fakes on? | Yes. Sample data, no payment provider, no SMS, no WhatsApp. Real speech-to-text is on (`DEMO_REAL_STT=1`), with Whisper on the same container. |
| Web mode | Inferred: `NEXT_PUBLIC_API_MODE=mock-server` with `NEXT_PUBLIC_API_BASE_URL` pointing at the Railway `/demo` path. (`live` mode would need core-api, a real SMS sender and no demo routes.) |
| Differs from `deploy/docker-compose.prod.yml` | It is not that setup: no Caddy, no separate containers, no `LINK_ENV`, no volumes for files and backups, no Redis, no ops console. |

## Variable names it needs (names only)

| Where | Names |
|---|---|
| Vercel (web) | `NEXT_PUBLIC_API_MODE`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TEACHER_APP_URL`, `NEXT_PUBLIC_DEFAULT_LOCALE` (new, see below) |
| Vercel (teacher app) | `EXPO_PUBLIC_*` equivalents of the above (see `apps/teacher-app/.env.example` if present) |
| Railway (demo container) | `PORT`, `APP_ENV` (must be `local`), `MOCK_SERVER_PORT`, `MOCK_SERVER_INTERNAL_URL`, `CORS_ALLOWED_ORIGINS` (the Vercel origins), `DEMO_REAL_STT`, `DEMO_DEFAULT_FLAGS`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN`, `AI_MODELS_DIR`, `CORE_API_UPSTREAM_PORT` |
| Railway (Postgres) | the Railway Postgres defaults (`POSTGRES_*`) |
| Railway build | `RAILWAY_DOCKERFILE_PATH`, if the demo image is selected by path |

## How the web finds the API

The browser calls the demo API **directly, across origins** (hence `CORS_ALLOWED_ORIGINS`), using `NEXT_PUBLIC_API_BASE_URL`. There is no `/v1` rewrite in this mode. In `live` mode the web would instead rewrite `/v1/*` to `CORE_API_URL`, so session cookies stay first-party.

## What differs from `main`

| Branch change | Effect | Decision (task 2) |
|---|---|---|
| `scripts/railway-demo-proxy.mjs` (new) | One public port in front of core-api and the demo API | merged |
| `packages/mocks/src/server.ts`, `ai-client.ts`, `owner-handlers.ts` | `PORT` fallback, internal callback URL, extra CORS origins from `CORS_ALLOWED_ORIGINS`, `DEMO_REAL_STT`, 180 s timeout, error detail in logs | merged (mock server only; still refuses non-local `APP_ENV`) |
| `apps/ai-service/ai_service/stt.py` | `tiny`, `base`, `small` Whisper models; beam 1 for tiny/base | merged |
| `apps/ai-service/Dockerfile` | Replaces the production image with a demo image: bundles Node and the mock server, binds `127.0.0.1`, removes the CA-secret mount | **not merged as is**: it breaks the production ai-service. Kept as a separate `apps/ai-service/Dockerfile.railway-demo`. Railway must be pointed at it. |
| `apps/web/proxy.ts` | Public site opens in English instead of Arabic | **not merged as is**: Arabic is the default. Now `NEXT_PUBLIC_DEFAULT_LOCALE` (empty = `ar`); set `en` on Vercel to keep the Codex behaviour |
| `apps/teacher-app/vercel.json` | SPA rewrite for Expo web | merged |
| `deploy/railway-postgres.Dockerfile` | Postgres 16 + PostGIS + pgvector from the repo root | merged |

## Risks

| # | Risk | Severity | What to do |
|---|---|---|---|
| 1 | **Can a real person sign in or leave data?** Demo sign-in picks a sample user, no real accounts. But the landing form sends requests by email (ADR-0009) and a visitor can type a real name or number into demo forms; the mock server **stores state on the container disk** and shares it between visitors. | Medium | Tell visitors not to type real data; keep the "Demo, sample data" bar visible; reset state on deploy |
| 2 | **Sample-data banner.** The Try bar (`apps/web/src/demo/TryBar.tsx`) is the only place that says it. Not checked on the live site (no dashboard, no browsing). | Medium | Open the site once and check |
| 3 | **Secrets in commits.** None found in the two branches (names only; the Dockerfile commit *removed* secret mounts). The CI `secrets` job passes on `main`. | Low | none |
| 4 | **Demo routes / Demo tools public.** The mock server's `/__demo`-style controls (flags, reset) are reachable by anyone who can reach `/demo/*`, and `APP_ENV=local` is the only switch. The public-demo check only covers the web bundle, not the Railway API. | **High if the URL is shared** | Put the demo API behind the Vercel origin only (CORS is already origin-limited, but `curl` is not), or add a token to the control routes. Needs your decision |
| 5 | **`APP_ENV=local` on a public server.** The guard that stops fakes in production does not apply, because this is not `production`. Fine for a sample-data demo, never for real users. | Medium | Never point real users, payments or a real SMS provider at this stack |
| 6 | **Whisper on a trial CPU** is slow and memory-bound; the branch tuned timeouts three times. Voice notes in the demo may time out. | Low | Expected on a trial plan |
| 7 | **Vercel Hobby is for non-commercial use.** A site presenting a business to centres is commercial. | Medium | Move to Vercel Pro (paid, your call) or another host before sending the link to customers |
| 8 | **Railway trial limits.** Trial credits and sleeping services can take the demo down without warning. No uptime alert exists. | Low | Add the uptime check from the status report |
| 9 | **Branches keep drifting.** Until the merge in this PR lands, the deployed code is not on `main`. | Low | Deploy from `main` after this PR |

## Five-line summary

1. Web and teacher app on Vercel; one Railway container with the demo API, proxy and Whisper; Railway Postgres (inferred from branches, dashboards not opened).
2. It runs the **sample-data mock server** with fakes (`APP_ENV=local`), not core-api in staging or production mode.
3. No secrets are committed; no real accounts exist; real data must not be entered.
4. The demo controls and API are public to anyone with the Railway URL (risk 4).
5. Vercel Hobby is non-commercial (risk 7) — fix before sending the link to centres.
