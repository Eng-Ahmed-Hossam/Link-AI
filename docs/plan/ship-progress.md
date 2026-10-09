# Ship progress (S0–S4)

The running log of the "ready to ship" job (Ahmed's brief of 2026-10-09). **A new session continues from this file alone**: read it, then `docs/PRODUCT_BRIEF.md`, then the stage you are on. Update it after every stage (and whenever something changes the plan).

**Goal.** Everything that needs code is done. Once Ahmed buys hosting and opens the provider accounts, going live is configuration only. Deployment waits for Ahmed: build for it, prove it locally, deploy nothing.

**Rules.** One PR into `main` per stage; wait for CI (including `story-live`); merge it yourself; continue. Stop only for an irreversible decision that could go either way, or anything needing money, an account or a legal choice — write it under "Open questions" and carry on with what doesn't depend on it. Sample data only; mock mode, the public-demo check and the pilot check keep passing; the gold set stays locked; no secrets in commits; docs win over the mock; no paid services or sign-ups. While working run only the related tests; the full suites once per stage before the PR.

**Branch.** `claude/serene-gauss-ey7d2z` (reset onto `main` after each merge).

## Status

| Stage | What | State | PR | Merged commit |
|---|---|---|---|---|
| S0 | `pnpm run doctor`, `pnpm run setup`, setup-windows, go-live-switches, RUNNING/local-checks | in progress | — | — |
| S1 | Production images, prod compose (one VPS + Caddy), production guard, security pass, backups, monitoring, `pnpm prod:local` | next | — | — |
| S2 | Ops console (`apps/ops`), consent pack drafts, legal drafts, user rights | — | — | — |
| S3 | Payout batches, rent shortfall, home-area screen, `bookingsEnabled`, Android preview build docs, approved Arabic strings | — | — | — |
| S4 | `docs/plan/provider-choice.md` (payments, SMS, WhatsApp) → stop and report | — | — | — |

**Last green commit on `main`:** `1087fae` (R4 merge, CI green 3 m 17 s).

## Decisions taken on the way (reversible)

- **`pnpm run doctor` / `pnpm run setup`, not `pnpm doctor` / `pnpm setup`.** Both names are pnpm built-ins (`pnpm doctor` checks pnpm itself; `pnpm setup` edits the shell profile), and pnpm runs its built-in over a package script. The scripts are named `doctor` and `setup`, so `pnpm run …` works everywhere; the docs say so.
- `env-local.mjs` without `--force` now **appends** missing names (known ones with local defaults, the rest as `# NAME=` placeholders) instead of refusing; values are never changed. That makes it safe for `pnpm run setup` to run every time, and lets `pnpm run doctor` check that `.env.local` lists every name in `.env.example` (names only).
- `pnpm seed:demo --if-empty` keeps a database that has users (setup uses it); `--reset-data` asks for a typed `reset`.
- Stopped Link containers are ⚠ in doctor (setup/dev start them); unhealthy ones are ✗.
- PRODUCT_BRIEF §5 lists "not now" items this job builds (real-payment readiness, the ops console beyond 3 screens). Ahmed's brief of 2026-10-09 asks for them explicitly; the brief itself is not edited (only Ahmed changes it).

## Known gaps found (to close in later stages)

- **No AWS on one VPS (S1).** Events use SNS/SQS (`src/worker/events.ts`) and field encryption only has the local key wrapper (`src/platform/crypto.ts`); storage asks for SSE-KMS. S1 adds a Postgres-backed queue (`QUEUE_PROVIDER=postgres`), a server-secret key wrapper, and S3-compatible storage without KMS (MinIO on the server or R2), so one VPS needs no cloud account.
- **No real provider adapters** (SMS, payments, WhatsApp): by design until Ahmed picks providers after S4. Going live then needs one adapter class per provider — the only code left, and small (one interface each).
- docs/10 §7 says the ops console uses SSO with MFA and an IP allow-list; the brief for S2 says phone OTP for ops staff. S2 follows the brief (OTP + `link_ops` role) and keeps an IP allow-list setting; recorded as a CF in docs/13 in S2.

## Open questions for Ahmed

_None yet._

## Next step

S0: finish docs, run the full suites, open the PR, wait for CI, merge. Then S1 from the top of its list.
