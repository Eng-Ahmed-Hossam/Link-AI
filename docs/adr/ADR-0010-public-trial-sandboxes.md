# ADR-0010 · The public trial: one sandbox per visitor on the demo API

- **Status:** Accepted (2026-10-16). Supersedes ADR-0009 decision 4 ("Path A runs in the browser") for the hosted trial.
- **Deciders:** Ahmed (brief of 2026-10-16); implemented in `packages/mocks` (server, `sandbox.ts`), `apps/web/src/sandbox.ts`, `apps/teacher-app/src/sandbox.ts`.

## Context

The public trial (`link-ai-web` + `link-ai-teacher-demo`) lets an anonymous visitor walk the connected story as parent, owner and teacher. The web ran on the in-browser mock (MSW); the teacher app ran on the hosted demo API (the mock server on Railway `ai-service`) — **one world shared by every visitor**, which any visitor could reset or flip through `/__demo/*`. Stage 0 locked `/__demo/*` on hosted servers (rightly: anyone could reset everyone), and the teacher entry broke, because it called `POST /__demo/settings` (found in Railway's HTTP logs from Ahmed's own browser, 2026-10-16).

The trial needs: every visitor isolated; the web and the teacher app sharing **one** world (the story crosses apps: the teacher's room request appears on the owner's page); nobody able to touch another visitor's world or the shared seed; the dangerous routes locked.

## Options

| Option | Isolation | Web ↔ teacher app share a world? | Server surface |
|---|---|---|---|
| A. **Per-visitor sandboxes on the demo API** | One world per sandbox id (128-bit, unguessable) | **Yes**: the role chooser hands the same id to the teacher app | A few demo routes, scoped to the caller's sandbox and rate-limited |
| B. In-browser mode for both apps (MSW / in-app mocks) | Perfect (each browser holds its own state) | **No**: the web and the teacher app are different origins, so their browser storage is separate; the story breaks between apps | None |

## Decision

**Option A.**

- Every request goes to `<demo API>/sb/<id>/…`. The id is made once per browser (`crypto.getRandomValues`, 16 bytes, base64url) and kept in `localStorage`; the web's role chooser passes it to the teacher app (`/try?sandbox=<id>`).
- The server keeps one world per id (marketplace, follow-up, demo flags, payout accounts, uploaded audio). For each request it swaps that world in, handles the request, and swaps it out; requests run **one at a time**, so worlds never mix (demo traffic is small). A new id starts from a **fresh copy** of the sample seed; the seed is never written.
- **Time limit and clean-up:** a sandbox idle for 2 hours, or older than 8 hours, is dropped; past 300 live sandboxes the least recently used goes.
- **Rate limits:** 600 requests a minute and 20 new sandboxes an hour per address (Railway's `X-Real-IP`).
- **Routes:** a request without a sandbox gets **400**. Inside a sandbox, a browser may call only `POST /__demo/settings` (Phase 2 and marketplace flags only — never real speech-to-text or fault switches), `POST /__demo/reset` (its own world) and `GET /__demo/state`. Every other `/__demo` route stays **404** (or needs `DEMO_ROUTES_SECRET`).
- Locally (`pnpm demo`) nothing changes: no sandboxes, one shared world for the presenter; the `/sb/<id>` prefix is accepted and ignored.

## Consequences

- ✅ The trial works again for anonymous visitors, isolated, across the web and the teacher app.
- ✅ Tests: `packages/mocks/src/sandbox.test.ts` — "two sandboxes never share a world; a new one starts from the seed", "runs one request at a time, even when they overlap", "expires idle and old sandboxes, and drops the least recently used past the cap", "limits requests and new sandboxes per address", "visitor B can't see, reset or change visitor A's sandbox", "global and dangerous demo routes stay locked, even inside a sandbox", "rate-limited per address: requests, and new sandboxes"; `server-gate.test.ts` for the 400/404/401 rules.
- ⚠️ State is in memory: a redeploy of `ai-service` starts every visitor over (acceptable for a trial).
- ⚠️ One request at a time limits throughput (fine for a trial; a real backend is core-api).
- The web trial now calls the demo API cross-origin (`NEXT_PUBLIC_API_MODE=mock-server`, `NEXT_PUBLIC_API_BASE_URL`); its CSP adds that origin to `connect-src`, and the demo API's `CORS_ALLOWED_ORIGINS` lists the web's origin.
