# Security checklist

Ship job S1, checked on 2026-10-09 against the code, the production images (`pnpm prod:local`) and CI. **Pass** = built and tested; **Partial** = built, with a gap named; **Not yet** = needs an account, a choice or a later stage. Rules behind each item: [docs/10](10-security-privacy.md).

## Start-up and configuration

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Production refuses every local fake (fake-pay, sms-sink, whatsapp-fake, a local ai-service, aws-local) | **Pass** | `LINK_ENV=production` guard, `apps/core-api/src/platform/guard.ts`; `test/unit/guard.test.ts` (15 tests); CI job `images` runs the image with local settings and expects the refusal |
| 2 | Production refuses demo routes, Demo tools, mock mode and the sample world | **Pass** | Guard (demo routes, sample users in the database); web build refuses `NEXT_PUBLIC_API_MODE≠live` and `NEXT_PUBLIC_DEMO_CONTROLS` (`apps/web/next.config.ts`); no demo marker in the production web bundle (checked: 11 markers, 0 files) |
| 3 | Production refuses the developer phone key and local JWT values | **Pass** | `FIELD_KEY_LOCAL` refused outside local (config and guard); `JWT_SIGNING_KEY_ID=local…` and a localhost issuer refused |
| 4 | Every wrong setting is named, never its value | **Pass** | `formatProblems`; test "never prints a secret value" |
| 5 | ai-service refuses fake STT/LLM and demo score pre-fill in production; listens off this machine only with a switch and a 24+ character token | **Pass** | `apps/ai-service/ai_service/app.py` `startup_problems`; `tests/test_startup.py` |
| 6 | No secret in git | **Pass** | gitleaks in CI (`secrets` job); `.env*` git-ignored except the name-only examples; `pnpm prod:env` writes `deploy/.env.production` with mode 600 |

## Network and HTTP

| # | Item | Result | Evidence |
|---|---|---|---|
| 7 | HTTPS everywhere, HSTS | **Pass** | Caddy: automatic certificates for `LINK_DOMAIN`, `Strict-Transport-Security` (1 year) — `deploy/Caddyfile` |
| 8 | Only the reverse proxy is published; databases, Redis, core-api and ai-service stay private | **Pass** | `deploy/docker-compose.prod.yml` publishes only Caddy's 80/443 |
| 9 | Internal routes never public | **Pass** | Caddy answers 404 for `/v1/internal/*` and `/__demo*`; core-api's ai-service callback also checks the address and the shared token |
| 10 | Security headers on the web | **Pass** | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy` on every page |
| 11 | Content Security Policy on the web | **Partial** | Production builds: `default-src 'self'`, no framing, no plugins, `form-action 'self'`, analytics host only when set. Gap: `script-src` allows `'unsafe-inline'` (Next's inline boot script); moving to nonces is a later hardening |
| 12 | Security headers on the API | **Pass** | `nosniff`, `DENY`, `no-referrer`, `CORP same-site`, deny-all CSP, `Cache-Control: no-store` (`apps/core-api/src/server.ts`) |
| 13 | Strict CORS | **Pass** | Exact origins from `CORS_ALLOWED_ORIGINS`, no credentials, fixed header list; on one domain the list is empty (same origin); production refuses localhost origins |
| 14 | Cookie flags | **Pass** | Session cookies `HttpOnly`, `SameSite=Lax`, `Secure` outside local (`apps/core-api/src/identity/auth.controller.ts`) |
| 15 | Request size limits | **Pass** | JSON 100 kB (core-api), audio 15 MB (signed upload), Caddy 16 MB per request |
| 16 | Rate limits on sign-in codes | **Pass** | Send: 20/hour per address, 3 per 10 min and 10/day per phone, 60 s between codes; verify: 5 tries per code and 60/hour per address (new) |
| 17 | Rate limits on every public form | **Pass** | C01 "Add my centre": 10/hour per address, 3/day per phone; pilot request (web): per address; other writes need a signed-in user |
| 18 | The client address behind the proxy is right (so per-address limits work) | **Pass** | `TRUST_PROXY=loopback, uniquelocal` in the production compose |
| 19 | WAF, DDoS protection, bot filtering at the edge | **Not yet** | Needs the hosting choice (a CDN in front of the server); listed in [before real users](plan/before-real-users.md) |

## Data

| # | Item | Result | Evidence |
|---|---|---|---|
| 20 | Phones and bank details encrypted in the database | **Pass** | Envelope encryption with `FIELD_KEY` on a server; key IDs recorded (`platform.data_keys`) |
| 21 | Voice audio encrypted at rest, deleted after 30 days | **Pass** | `STORAGE_PROVIDER=file`: AES-256-GCM per file, hashed names (`test/integration/one-server.test.ts`); S3 with SSE; retention job |
| 22 | Backups encrypted, kept N days, restorable | **Pass** | `deploy/backup.sh` (AES-256, PBKDF2), `deploy/restore.sh`; CI restores a backup into a fresh database and runs the RLS suite on it |
| 23 | Tenant isolation | **Pass** | RLS on every tenant table and the API sweep (`pnpm test:rls`, 79 tests), also on the restored copy |
| 24 | No personal data in logs or error reports | **Pass** | Redaction at the source (`platform/logger.ts`); error tracking sends message, stack and named safe fields only (`test/unit/errors.test.ts`) |
| 25 | Card data never touches Link | **Pass** | Hosted checkout only; no card field (checked by the e2e story) |

## Dependencies and images

| # | Item | Result | Evidence |
|---|---|---|---|
| 26 | `pnpm audit` high and critical | **Partial** | 2 high, 0 critical. Both are in the teacher app's Expo/Metro build tools (`node-forge` via `@expo/cli`; `braces` via Metro), have no patched version yet, and are in **no** server image (checked: neither directory in `link/core-api` or `link/web`). Re-check when Expo publishes fixes. 2 moderate, same tooling |
| 27 | Images small, multi-stage, non-root | **Pass** | core-api 318 MB (user `node`), web 313 MB (user `node`), ai-service 797 MB (uid 10001; models are a volume) |
| 28 | Images built in CI | **Pass** | CI job `images` (never pushed) |
| 29 | Container image scanning, SAST, penetration test | **Not yet** | Before launch (docs/10 §7); needs a scanner choice and a tester |

## Accounts and operations

| # | Item | Result | Evidence |
|---|---|---|---|
| 30 | Ops console: staff only, audited | **Pass** (S2) | `apps/ops` on its own host (`ops.<domain>`, no-store, noindex, CSP); every `/v1/ops/*` call checks `OPS_IP_ALLOWLIST` (empty = closed in production), an active `link_ops` role and the route's permission (OD-37); access is granted only by a server command (`ops-access`); every view of personal data and every decision is audited (MKT-OPS-08). Tests: `test/integration/ops.test.ts`, `test/unit/ops-access.test.ts`, `e2e-modes/ops.spec.ts`. Sign-in is a phone code, not SSO with MFA (CF-56) |
| 34 | Consent pack approved before real data | **Enforced** (S2) | The production guard refuses draft consent labels (`CONSENT_VERSIONS`, OD-60, CF-57); drafts for the lawyer in [legal/](legal/README.md) |
| 35 | Data-subject rights (PDPL) | **Pass** (S2) | Account → My data (access, correction, deletion); ops answer in the console within 30 days, with an audited JSON export for access requests; procedure in [legal/data-requests.md](legal/data-requests.md) |
| 31 | Error tracking | **Pass** (optional) | `SENTRY_DSN` empty = off; no account needed to run |
| 32 | Health checks on every service | **Pass** | core-api `/health` `/ready`, worker `/health` (4003), gateway `/health`, ai-service `/health` `/ready`, web `/api/health`; compose health checks on each |
| 33 | Key rotation documented | **Pass** | [operations.md](operations.md#rotate-keys) |
