# Backlog (Part C, 2026-10-16)

One prioritised list of what is left, from the staging validation ([staging-validation.md](staging-validation.md)), the status report ([status-before-hosting.md](status-before-hosting.md)), the decisions list ([decisions-for-ahmed.md](decisions-for-ahmed.md)) and the auth plan ([auth-map-staging.md](auth-map-staging.md)).

- **P0:** broken, or blocks testers.
- **P1:** needed before the first real centre.
- **P2:** later.

Size: S ≤ 1 day · M ≤ 1 week · L > 1 week. Owner: **agent** (code) or **Ahmed** (a decision, an account, money, a person).

## P0

| # | What | Why it matters | Size | Owner | Evidence | State |
|---|---|---|---|---|---|---|
| P0-1 | "Try Link" on the live staging did nothing (it called the demo settings route — off — and stored mock sessions) | It is the obvious way in for testers on https://link-ai-staging-web.vercel.app | S | agent | [staging-validation](staging-validation.md) · `apps/web/src/demo/try.ts` | **Fixed** (2026-10-16): in live mode each role opens its sign-in page; unit test `src/demo/try.test.ts` |

No other screen was broken on staging (60 of 60 crawled screens work).

## P1 — before the first real centre

| # | What | Why it matters | Size | Owner | Evidence |
|---|---|---|---|---|---|
| P1-1 | **Auth stage, Google first** (Stage 1 of the plan): user identities, Google sign-in (PKCE, server-side token checks), linking, roles and switcher, allowlist, private-testing screen | Testers can sign in only as sample people with codes from the private inbox | L | agent; **Ahmed**: the Google OAuth client | [auth-map-staging §1–5](auth-map-staging.md) |
| P1-2 | **Email sign-in** (code by email) | Second sign-in method; Resend's shared sender reaches only Ahmed's own address | M | agent, after **Ahmed** buys a domain and verifies it in Resend | [auth-map-staging §5](auth-map-staging.md) |
| P1-3 | **SMS provider adapter** | Production refuses to start without a real `SmsSender`; nobody can sign in by phone | M | **Ahmed** picks the provider and signs; agent writes the adapter | [provider-choice](provider-choice.md) · [go-live-switches](../go-live-switches.md) |
| P1-4 | **Payment provider adapter** (hosted checkout, Fawry, wallet, saved card, refunds, settlement) | No bookings without it (Follow-up can start alone with `PAYMENT_PROVIDER=none`) | L | **Ahmed** (merchant account, papers); agent | [provider-choice](provider-choice.md) |
| P1-5 | **WhatsApp adapter** (Meta Cloud API) | Approved parent updates are sent by hand (`manual`) until then | M | **Ahmed** (Business account, number, templates); agent | [provider-choice](provider-choice.md) |
| P1-6 | **Consent pack and legal texts** reviewed by a lawyer, then wired in (versions, terms + privacy at sign-up, re-consent on change) | No real data before it (OD-60) | M (lawyer) · S (agent) | **Ahmed** (lawyer); agent | [docs/legal](../legal/README.md) · [decisions-for-ahmed #7](decisions-for-ahmed.md) |
| P1-7 | **Move to one server** (Hostinger or similar) with `deploy/docker-compose.prod.yml`: region chosen with counsel, volumes for Postgres, files and backups, Caddy HTTPS | Railway's free plan has no room for more services, core-api keeps voice audio with no volume (lost on every redeploy), and the region is US East | M | **Ahmed** (server, domain); agent (setup, runbook) | [environments](../deploy/environments.md) · [before-real-users](before-real-users.md) |
| P1-8 | **Nightly backup** of the staging database | Railway refused the cron service ("Free plan resource provision limit exceeded"); the image is ready (`deploy/backup.Dockerfile`) | S | **Ahmed** (paid plan, or remove a service, or run it on the new server); agent | [environments → open points](../deploy/environments.md) |
| P1-9 | **Voice speed and quality**: 145 s for an 8 s note with Whisper `tiny` on the trial CPU; transcript poor, 0 roster matches | Teachers will not wait 2 minutes; the accuracy-tested model (large-v3-turbo) needs a bigger CPU or a GPU | M | **Ahmed** (server size); agent (model, timings) | [staging-validation → voice](staging-validation.md) · ai-service log `latency_ms=143738` |
| P1-10 | **Sign-in rate limits behind the Vercel proxy**: core-api may see every web tester as one address (20 codes an hour for all) | A tester round can lock itself out | S | agent | `apps/core-api/src/identity/otp.ts` (`perIpHour`); to verify on staging |
| P1-11 | **C03 room schedule overflows a phone** (600 px sideways) | Owners check the schedule on a phone too | S | agent | [staging-validation → C03](staging-validation.md) |
| P1-12 | **Small tap targets**: C05 time-slot chips (25 below 24 px), A07 and A08 tick buttons, A04 "review the follow-up" link | WCAG 2.2 target size; fat-finger errors | S | agent | [staging-validation](staging-validation.md) |
| P1-13 | **Uptime check and alert**, Sentry on | Nobody is told when staging or production stops | S | agent; **Ahmed** (where alerts go) | [status-before-hosting §3](status-before-hosting.md) |
| P1-14 | **Arabic review**: 2,168 Arabic strings flagged for a native copywriter | Arabic first: the copy must be right before real users | M | **Ahmed** (reviewer); agent (`pnpm i18n:apply-review`) | `packages/i18n/messages/proposed.ar.json` |
| P1-15 | **Ops sign-in**: phone code + allow-list today; SSO with MFA before ops handle real money (CF-56) | Ops can move money | M | **Ahmed** decides; agent | [decisions-for-ahmed #10](decisions-for-ahmed.md) |
| P1-16 | **Fee and processing-cost decisions** (OD-01, OD-02, OD-15) and the refund policy (OD-03) | The money rules before the first booking | — | **Ahmed** | [decisions-for-ahmed #1–5](decisions-for-ahmed.md) |

## P2 — later

| # | What | Why | Size | Owner | Evidence |
|---|---|---|---|---|---|
| P2-1 | A staging smoke spec (no demo routes, bookings off) to run after each deploy | The story spec needs demo routes and bookings, both off on staging | S | agent | [staging-validation](staging-validation.md) |
| P2-2 | A sample parent message in the staging world (A06/A09 have nothing to open) | Lets testers see the message review screens | S | agent | [staging-validation](staging-validation.md) |
| P2-3 | Native map in the teacher app (Android) | J01 shows a list with distances on phones; the map is web-only | M | agent | [map-provider](map-provider.md) |
| P2-4 | Google Geocoding for better Egyptian address search (needs a card) | Nominatim gave the city, not the district, for «شارع ٩ المعادي» | S | **Ahmed** (OK for a billing account); agent | [map-provider](map-provider.md) · staging pin e2e |
| P2-5 | Clean-ups: `link-platform-demo` (Vercel), leftover Codex variables on `core-api-l9aa` | Tidiness | S | **Ahmed** OK; agent | [environments → open points](../deploy/environments.md) |
| P2-6 | Ask Link on a hosted model (off in live without a local LLM) | Phase 2 extra | M | **Ahmed** (model choice); agent | [app-map V07](../product/app-map.md) |
| P2-7 | CSP nonces instead of `'unsafe-inline'`; the 2 high `pnpm audit` items in Expo build tools | Hardening | S–M | agent | [security-checklist](../security-checklist.md) #11, #26 |
| P2-8 | App stores (Android preview build first) | Teachers on phones | M | **Ahmed** (Expo account or Android Studio) | [teacher-app-android](../teacher-app-android.md) |
| P2-9 | Phase 3 analytics; import students and centre-run groups (OD-21) | Later phases | L | — | [app-map A15, A19](../product/app-map.md) |
