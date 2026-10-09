# Ship progress (S0–S4)

The running log of the "ready to ship" job (Ahmed's brief of 2026-10-09). **A new session continues from this file alone**: read it, then `docs/PRODUCT_BRIEF.md`, then the stage you are on. Update it after every stage (and whenever something changes the plan).

**Goal.** Everything that needs code is done. Once Ahmed buys hosting and opens the provider accounts, going live is configuration only. Deployment waits for Ahmed: build for it, prove it locally, deploy nothing.

**Rules.** One PR into `main` per stage; wait for CI (including `story-live`); merge it yourself; continue. Stop only for an irreversible decision that could go either way, or anything needing money, an account or a legal choice — write it under "Open questions" and carry on with what doesn't depend on it. Sample data only; mock mode, the public-demo check and the pilot check keep passing; the gold set stays locked; no secrets in commits; docs win over the mock; no paid services or sign-ups. While working run only the related tests; the full suites once per stage before the PR.

**Branch.** `claude/serene-gauss-ey7d2z` (reset onto `main` after each merge).

## Status

| Stage | What | State | PR | Merged commit |
|---|---|---|---|---|
| S0 | `pnpm run doctor`, `pnpm run setup`, setup-windows, go-live-switches, RUNNING/local-checks | **done** | #3 | `17d2216` |
| S1 | Production images, prod compose (one VPS + Caddy), production guard, security pass, backups, monitoring, `pnpm prod:local` | built, PR open | — | — |
| S2 | Ops console (`apps/ops`), consent pack drafts, legal drafts, user rights | — | — | — |
| S3 | Payout batches, rent shortfall, home-area screen, `bookingsEnabled`, Android preview build docs, approved Arabic strings | — | — | — |
| S4 | `docs/plan/provider-choice.md` (payments, SMS, WhatsApp) → stop and report | — | — | — |

**Last green commit on `main`:** `17d2216` (S0 merge, CI green in about 4 min).

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

## Known gaps found (to close in later stages)

- ~~No AWS on one VPS~~ — closed in S1 (see decisions).
- **Production cannot start before a real SMS adapter** (the guard refuses `SMS_PROVIDER=fake`, and sign-in needs codes). Expected: the SMS adapter is the first code after the S4 choice.
- `pnpm audit`: 2 high in Expo/Metro build tools only (no fix published; in no server image) — [security-checklist.md](../security-checklist.md) #26.
- CSP allows inline scripts (Next's boot script); nonces are a later hardening (#11).
- **No real provider adapters** (SMS, payments, WhatsApp): by design until Ahmed picks providers after S4. Going live then needs one adapter class per provider — the only code left, and small (one interface each).
- docs/10 §7 says the ops console uses SSO with MFA and an IP allow-list; the brief for S2 says phone OTP for ops staff. S2 follows the brief (OTP + `link_ops` role) and keeps an IP allow-list setting; recorded as a CF in docs/13 in S2.

## Open questions for Ahmed

_None yet._

## Next step

S1: run the full suites, open the PR, wait for CI (including `images` and `story-live`), merge. Then S2 from the top of its list (ops console first).
