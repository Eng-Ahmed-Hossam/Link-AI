# Ship progress (S0–S4)

The running log of the "ready to ship" job (Ahmed's brief of 2026-10-09). **A new session continues from this file alone**: read it, then `docs/PRODUCT_BRIEF.md`, then the stage you are on. Update it after every stage (and whenever something changes the plan).

**Goal.** Everything that needs code is done. Once Ahmed buys hosting and opens the provider accounts, going live is configuration only. Deployment waits for Ahmed: build for it, prove it locally, deploy nothing.

**Rules.** One PR into `main` per stage; wait for CI (including `story-live`); merge it yourself; continue. Stop only for an irreversible decision that could go either way, or anything needing money, an account or a legal choice — write it under "Open questions" and carry on with what doesn't depend on it. Sample data only; mock mode, the public-demo check and the pilot check keep passing; the gold set stays locked; no secrets in commits; docs win over the mock; no paid services or sign-ups. While working run only the related tests; the full suites once per stage before the PR.

**Branch.** S0–S1: `claude/serene-gauss-ey7d2z`. From S2 (session of 2026-10-10): `claude/link-implementation-finish-shqdku`, reset onto `main` after each merge.

## Status

| Stage | What | State | PR | Merged commit |
|---|---|---|---|---|
| S0 | `pnpm run doctor`, `pnpm run setup`, setup-windows, go-live-switches, RUNNING/local-checks | **done** | #3 | `17d2216` |
| S1 | Production images, prod compose (one VPS + Caddy), production guard, security pass, backups, monitoring, `pnpm prod:local` | **done** | #4 | `31febef` |
| S2 | Ops console (`apps/ops`), consent pack drafts, legal drafts, user rights | **done** | #5 | `f0d0a9e` |
| S3 | Payout batches, rent shortfall, home-area screen, `bookingsEnabled`, Android preview build docs, approved Arabic strings | **done** (Arabic: review file ready, waits on the reviewer) | #6 | `74f207a` |
| S4 | `docs/plan/provider-choice.md` (payments, SMS, WhatsApp) → stop and report | **done** (docs only, with S3); reported to Ahmed | #6 | `74f207a` |

**Last green commit on `main`:** `74f207a` (S3 + S4 merge; CI green including `images` and `story-live`).

## Decisions taken on the way (reversible)

- **`pnpm run doctor` / `pnpm run setup`, not `pnpm doctor` / `pnpm setup`.** Both names are pnpm built-ins (`pnpm doctor` checks pnpm itself; `pnpm setup` edits the shell profile), and pnpm runs its built-in over a package script. The scripts are named `doctor` and `setup`, so `pnpm run …` works everywhere; the docs say so.
- `env-local.mjs` without `--force` now **appends** missing names (known ones with local defaults, the rest as `# NAME=` placeholders) instead of refusing; values are never changed. That makes it safe for `pnpm run setup` to run every time, and lets `pnpm run doctor` check that `.env.local` lists every name in `.env.example` (names only).
- `pnpm seed:demo --if-empty` keeps a database that has users (setup uses it); `--reset-data` asks for a typed `reset`.
- Stopped Link containers are ⚠ in doctor (setup/dev start them); unhealthy ones are ✗.
- PRODUCT_BRIEF §5 lists "not now" items this job builds (real-payment readiness, the ops console beyond 3 screens). Ahmed's brief of 2026-10-09 asks for them explicitly; the brief itself is not edited (only Ahmed changes it).

- **S1: one server, no cloud account.** `QUEUE_PROVIDER=postgres` (the outbox is the queue; retries and a dead state in `platform.queue_failures`), `STORAGE_PROVIDER=file` (AES-256-GCM files on a volume), `FIELD_KEY` (a server secret instead of KMS). SNS/SQS and S3 stay as switches.
- **S1: `PAYMENT_PROVIDER=none`** (checkout answers 503 `payments_off`): production can run Follow-up only before a payment provider exists.
- **S1: Caddy sends `/v1/*` straight to core-api**; the web app's own `/v1` rewrite stays for `pnpm dev`. The rewrite proxy hung on POSTs whose response body was never read — which also exposed an api-client bug (a 401 body left unread), fixed in `packages/api-client`.
- **S1: `LINK_ENV`** (`development` \| `staging` \| `production`): staging is the only mode where fakes, demo routes and the sample world run with production builds (`pnpm prod:local`). Production refuses each and names the setting.
- **S1: core-api ships as an esbuild bundle** with its own dbmate-compatible migration runner (`src/migrate.ts`), so the image needs no dbmate binary or dev dependencies.

- **S2: ops sign in with a phone code** (the brief), not SSO with MFA (MKT-OPS-08 AC1, 10 §7) — recorded as CF-56. Every `/v1/ops/*` call checks `OPS_IP_ALLOWLIST` first (empty = closed in production, open locally), then an active `link_ops` role and the route's permission (OD-37). The console lives on its own host (`ops.<domain>`); Caddy sends its `/v1` straight to core-api so the allow-list sees the real address.
- **S2: ops work runs as `app_ops`** (`DATABASE_URL_OPS`, RLS `ctx_is_ops()`), audit row and event in the same transaction; refund decisions reuse the money paths (SYSTEM) with the ops user as the decider. Migration 0017 adds the L01 stage, ops notes, data requests and the app_ops grants.
- **S2: ops access is granted by a server command** (`node dist/main.mjs ops-access grant <phone> agent|finance|agent+finance`; `pnpm ops:access` locally), never from the web. Sample ops users: 0051 (agent), 0052 (finance).
- **S2: consent labels are a setting** (`CONSENT_VERSIONS`, `identity/consent-pack.ts`); production refuses draft labels (OD-60, CF-57). Drafts for the lawyer: `docs/legal/`.
- **S2: user rights** — Account → My data in the parent app (copy, correction, deletion; one open per kind); ops answer in the console with an audited JSON export. Teacher app and owner web: by email for now (one card each later).
- **S2 scope of the console:** L01, teacher checks, L02, L03 refunds, data requests, audit lookup. Disputes, reconciliation, commission rules, reference data, ledger adjustments and payout monitoring (MKT-OPS-05…07, -10, -11) come with their features (payouts in S3).

- **S3: payouts are paid by hand** (provider `manual`): the Thursday batch (worker, off a developer machine; "Make this week's batch" in the console), a CSV for the bank or InstaPay, then sent / bounced / retry. A payout API is one more provider value after S4. Payees add their own payout account (teacher app, owner web); ops finance check every new one (BR-OUT-03).
- **S3: rent shortfall** paid by card, wallet or Fawry from the teacher app's Earnings (`/v1/rent-invoices/{id}/checkout`, P4 on the webhook, the rest of Link's fee share); the provider returns to a website page that only says "being confirmed".
- **S3: `bookings.enabled`** = `PAYMENT_PROVIDER≠none`: the parent app says "booking opens soon" and core-api refuses to hold a seat (503 `payments_off`) — a Follow-up-only start never leaves a dead checkout.
- **S3: home area** from `GET /v1/areas` (areas with a verified centre).
- **S3: Android preview** — `eas.json` (`preview` live, `preview-demo` sample) and docs/teacher-app-android.md; building needs Ahmed's free Expo account or Android Studio.
- **S3: "approved Arabic strings"** — no reviewed Arabic has come back yet (`reviewed_arabic` is empty in both review files). The new S2–S3 strings are in `docs/plan/arabic-review-ship.csv` (266, `pnpm i18n:export-review-ship`); `pnpm i18n:apply-review <file>` applies whatever the reviewer fills in.

## Known gaps found (to close in later stages)

- ~~No AWS on one VPS~~ — closed in S1 (see decisions).
- **Production cannot start before a real SMS adapter** (the guard refuses `SMS_PROVIDER=fake`, and sign-in needs codes). Expected: the SMS adapter is the first code after the S4 choice.
- `pnpm audit`: 2 high in Expo/Metro build tools only (no fix published; in no server image) — [security-checklist.md](../security-checklist.md) #26.
- CSP allows inline scripts (Next's boot script); nonces are a later hardening (#11).
- **No real provider adapters** (SMS, payments, WhatsApp): by design until Ahmed picks providers after S4. Going live then needs one adapter class per provider — the only code left, and small (one interface each).
- ~~docs/10 §7 SSO vs the brief's phone OTP for ops~~ — built per the brief, CF-56 (S2).
- Re-consent when a text's label changes, and recording `terms`/`privacy` at sign-up: after Ahmed approves the texts (before-real-users §3).
- In this cloud session Docker Hub rate-limits pulls and Debian's apt mirrors are blocked: local images were pulled through mirror.gcr.io, and the local Postgres image was assembled from `postgis/postgis:16-3.5` plus pgvector's files (not committed; CI builds the real Dockerfile).

## Open questions for Ahmed

1. **Ops sign-in (CF-56):** phone code + office IP allow-list is built. Do you want SSO with MFA (Google Workspace or similar) instead? It would replace only the sign-in page.
2. **Consent pack and legal texts (OD-60):** the drafts in `docs/legal/` need a lawyer; its README lists 8 questions for them.
3. **Arabic review:** a native reviewer fills `reviewed_arabic` in `docs/pilot/strings-to-review.csv` (pilot screens) and `docs/plan/arabic-review-ship.csv` (S2–S3 screens); then `pnpm i18n:apply-review` on each.
4. **Expo account** (free) for the Android preview build — or build locally with Android Studio (docs/teacher-app-android.md).
5. **Providers (S4):** pick from [provider-choice.md](provider-choice.md) (recommended: Paymob, then Kashier; an Egyptian SMS aggregator plus a global fallback; Meta Cloud API) and send each the questions there. All need the company papers first.
6. **Processing fee vs the 5% commission (OD-02, OD-15):** at 2.85% + EGP 3 (an older published rate, to verify) Link earns nothing on payments under about EGP 140. Ask providers for the flat fee; decide whether the commission or OD-15 changes.

## Next step

S0–S4 are merged. The job now waits on Ahmed: the open questions above. After the provider choice, the first code is the real `SmsSender` (production cannot start without it), then the `PaymentProvider` adapter against the chosen sandbox.
