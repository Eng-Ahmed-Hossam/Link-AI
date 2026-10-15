# Plan: real sign-up (email + Google), the centre map, and a real staging

Stage 0 plan, 2026-10-15. It covers Stages 1–3 of Ahmed's brief of the same day. It follows the decisions in that brief. Where this plan disagrees with one, or adds a detail the brief left open, the reason is in §7. Nothing here is built yet.

## 1. Data model (Stage 1: migrations `0019_…` onward; old migrations are never edited)

| Change | Detail | Why |
|---|---|---|
| **New `identity.user_identities`** | `id`, `user_id` FK → users, `provider` (`phone` \| `email` \| `google`, text + CHECK), `subject` bytea NOT NULL, `contact_enc` bytea NULL, `hint` text NOT NULL, `verified_at`, `last_used_at`, `created_at`. `UNIQUE (provider, subject)` | One person, several sign-in methods |
| `subject` | **Always an HMAC** (`HMAC_KEY_LOOKUP`) of the normalised value: the `+20…` phone, the lower-cased and trimmed email, or Google's `sub`. No plaintext anywhere | The same rule as phones today (06 §0, 10 §5) |
| `contact_enc` | The phone or email, envelope-encrypted with the field key, so a code or a notice can be sent. NULL for Google (Google's email is stored as its own `email` identity only when the user adds it) | Decrypted only to send |
| `hint` | Masked display: `•••• 0003`, `a•••@gmail.com`, `Google · a•••@gmail.com` | Settings shows it; ops sees only this |
| **`identity.users`** | `phone_hmac`, `phone_enc` and `phone_last4` become **nullable** (an email-only or Google-only user has no phone yet). They stay the account's **verified contact phone** (SMS, WhatsApp, invites), and are written in the same transaction as the `phone` identity row. A constraint trigger keeps them equal | Many paths already read `users.phone_*`; this avoids moving them all at once |
| Backfill | One migration inserts a `phone` identity for every existing user from `users.phone_hmac` / `phone_enc` / `phone_last4`, `verified_at = created_at` | Existing phone users keep signing in |
| **New `identity.access_allowlist`** | `id`, `kind` (`email` \| `phone`), `subject` bytea (HMAC), `hint`, `note`, `audience` (`app` \| `ops`), `added_by`, `created_at`, `used_at`, `removed_at`. `UNIQUE NULLS NOT DISTINCT (kind, subject, audience) WHERE removed_at IS NULL` | Invite-only staging; an ops screen manages it |
| `auth_sessions` | Add `amr` text (`phone` \| `email` \| `google`) and `authenticated_at` | "Recent sign-in" check before adding or removing a method |
| `users` | Add `active_role` text NULL (with `active_centre_id`) | The role switcher remembers the last workspace; permissions still come from every active role |
| Consent | `org.consent_events` rows for `terms` and `privacy` at sign-up, with the draft version label (already a setting, OD-60) | Recorded from the first sign-up |
| Audit | `audit.audit_events` rows `identity.linked`, `identity.unlinked`, `identity.sign_in_failed` (no PII; IDs and provider only) in the same transaction | Append-only, as everywhere |

**RLS.** `user_identities`: `SELF` reads its own rows, but only `id`, `provider`, `hint`, `verified_at`, `last_used_at` through a view. `subject` and `contact_enc` are never readable by `app_user`. Sign-in looks a subject up through a `SECURITY DEFINER` function, the same pattern as today's phone lookup. `OPS` reads the masked view only. `access_allowlist`: `OPS` (`ops.verify`) and `SYSTEM`. Both tables join the cross-tenant suite (`pnpm test:rls`): a user must get nothing of another user's identities.

## 2. Endpoints (Stage 1; docs/07 and the generated client are updated in the same PR)

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/v1/auth/email/request` | public | `{email}` → always `202 {resendAfterSeconds, expiresInSeconds}`, whether or not the address has an account or is allowlisted |
| POST | `/v1/auth/email/verify` | public | `{email, code}` → tokens + `{user, isNewUser}`; or `403 private_testing` when the address proved itself but has no account and is not allowlisted |
| GET | `/v1/auth/google/start?client=web&returnTo=` | public | 302 to Google with `state`, `nonce` and a PKCE `code_challenge`. The verifier, state and nonce sit in a signed httpOnly cookie for 10 min. `returnTo` must be a path on our own origins |
| GET | `/v1/auth/google/callback` | public | Exchanges the code, verifies the ID token **on the server** (JWKS signature, `iss`, `aud`, `exp`, `nonce`, `email_verified`), signs in or creates the account, then 302 to `returnTo` |
| POST | `/v1/auth/google/native` | public | Teacher app (`expo-auth-session`, PKCE): `{code, codeVerifier, redirectUri}` → the same checks, tokens in the body |
| GET | `/v1/me/sign-in-methods` | any | The masked list |
| POST | `/v1/me/sign-in-methods/email/request` · `…/email/verify` | any, recent sign-in | Add an email (a code to that address) |
| POST | `/v1/me/sign-in-methods/phone/request` · `…/phone/verify` | any, recent sign-in | Add a phone. On staging: `503 sms_unavailable` ("verification coming soon") |
| GET | `/v1/me/sign-in-methods/google/start` | any, recent sign-in | Link Google: the same flow, with `mode=link` bound to this session in the state cookie |
| DELETE | `/v1/me/sign-in-methods/{id}` | any, recent sign-in | `409 last_method` for the only method; else removed, audited, notice sent |
| GET | `/v1/me` | any | Adds `activeRole`, `activeCentreId`, `signInMethods` (count and providers only) |
| PUT | `/v1/me/active-role` | any | `{role, centreId?}`: only a role the user holds; `403` otherwise |
| GET · POST · DELETE | `/v1/ops/access-allowlist` | ops (`ops.verify`) | Manage the staging allowlist (masked list; add by email or phone) |
| POST | `/v1/ops/auth/email/request` · `…/verify` | public | Ops console sign-in: email code only, the address must be on the `ops` allowlist **and** hold `link_ops`; the IP allow-list still applies |

**Rate limits** (Redis, the existing `hit()` counters; every key is an HMAC):

| Limit | Value (setting) |
|---|---|
| Codes per email | 3 per 15 min, 10 per day |
| Codes per IP | 10 per hour |
| Verify tries | 5 per code; 30 per IP per hour (as phone) |
| Resend wait | 60 s |
| Email code life | **10 min** (phone stays 5 min, see §7) |
| Daily email cap | 80 per day for the whole staging (Resend free tier: 100/day); above it `503 email_unavailable` and an ops alert |
| Google start per IP | 30 per hour |

## 3. Screens (Stage 1; Arabic first, English, axe-clean, logical CSS only)

| Role | Screen | Change |
|---|---|---|
| Parent | P01 Welcome & sign up (web) | "Continue with Google" · "Email" · "Phone"; email → code screen; draft consent shown and recorded |
| Owner / staff | A18 Owner sign-in (web) | The same three choices |
| Teacher | T14 Sign in (teacher app) | The same three; Google through `expo-auth-session` |
| Ops | Ops sign-in | Email code only |
| Everyone | **Settings → Sign-in methods** (web Account, teacher app Settings) | Masked list, add email, add phone ("verification coming soon" on staging), link Google, remove (not the last) |
| Everyone with 2+ roles | **Role switcher** (web header menu; teacher app Settings) | Parent ↔ teacher ↔ centre (per centre) |
| Not allowlisted | **"Link is in private testing — request access"** | Opens the existing pilot-request form, email prefilled |
| Parent before booking or WhatsApp, owner before verification, teacher accepting a phone invite | **"Add and verify your phone"** step | On staging: "verification coming soon"; the action stays blocked |
| Ops | **Access allowlist** screen | Add or remove testers |

Figma has A18, P01 and T14 with phone only. The Google and email buttons have no Figma frame, so they follow `docs/11` tokens and Google's own button rules. Ahmed reviews them in the Stage 1 PR.

## 4. Security risks and how each is tested

| # | Risk | Defence | Test |
|---|---|---|---|
| 1 | Account enumeration | `email/request` answers the same for every address; the phone and Google paths reveal nothing more | Integration test: known, unknown, allowlisted and blocked addresses give byte-identical responses |
| 2 | Code guessing | 6 digits, 5 tries per code, per-IP limit, stored as a hash | Integration: the 6th try fails even with the right code |
| 3 | Code replay | The code is deleted on first success | Integration: the same code twice → the second fails |
| 4 | Email bombing, Resend quota burned | Per-email, per-IP and daily caps | Integration: the 4th request in 15 min → 429; the daily cap → 503 |
| 5 | Forged or wrong Google token | Server-side checks of signature (JWKS), `iss`, `aud`, `exp`, `nonce`, `email_verified` | Unit + integration against a **mock OIDC server** (in CI and locally, never real Google): wrong `aud`, expired, bad signature, wrong nonce, `email_verified=false` → all refused |
| 6 | Login CSRF and code interception | `state` + PKCE + nonce in a signed, httpOnly, SameSite=Lax, 10-min cookie | Integration: a callback with a missing or foreign state → 400 |
| 7 | Open redirect | `returnTo` is a path checked against our origins | Unit: `//evil.com`, `https://evil.com`, `/\evil.com` refused |
| 8 | **Takeover by automatic linking** | Never link on a matching email. A new Google sign-in whose verified email equals another account's email identity is refused with "sign in with your email code, then add Google in Settings" | Integration: no new identity row is written on that account |
| 9 | Linking without being the owner | Link and remove need a signed-in session with a sign-in in the last 10 min; the Google link state is bound to that session | Integration: no session → 401; old session → 403 `reauth_required`; a link callback with another session's state → 400 |
| 10 | Locking yourself out | The last method can't be removed | Integration → 409 `last_method` |
| 11 | Silent account change | Audit row plus a notice to the account's other contact on every link and unlink | Integration: audit row written; the fake mailer or SMS sink got the notice |
| 12 | Allowlist bypass | Checked on the server when an account is **created**, by every method | Integration: email, Google and phone sign-up of a non-allowlisted person → no user row, `private_testing` |
| 13 | Identity leakage across users | RLS `SELF`; `subject` and `contact_enc` never readable by `app_user` | `pnpm test:rls`: the new tables in the cross-tenant sweep |
| 14 | PII in logs and events | Logs and events carry IDs and providers, never an email or phone | Integration: captured logs contain no test email |
| 15 | Ops console takeover | Email code + ops allowlist + `link_ops` role + IP allow-list | `ops-access.test.ts` extended |
| 16 | Open demo routes on staging | **Fixed in Stage 0**: secret header, else off | `demo-secret.test.ts`, `demo-gate.test.ts`, `server-gate.test.ts` |
| 17 | Role switch to a role not held | Server checks the role list | Integration → 403 |

## 5. What Ahmed must create, step by step

| # | What | Steps | Needed for |
|---|---|---|---|
| 1 | **The right Railway sign-in on this PC** | `railway logout`, then `railway login` with the account that owns `link-ai-staging` (today the CLI and the MCP see only `practical-endurance` and `lively-manifestation`) | Stage 0 deploy, Stage 3 |
| 2 | **Vercel sign-in on this PC** | `vercel login` (the CLI is logged out) | Stage 3 |
| 3 | **`DEMO_ROUTES_SECRET` on Railway** | Railway → `link-ai-staging` → each service that serves `/__demo` (`core-api-l9aa`, `ai-service`) → Variables → New variable `DEMO_ROUTES_SECRET` = a long random value (e.g. from a password manager). Keep it to yourself; testers never need it | Stage 0 (optional: without it the routes are simply off) |
| 4 | **A domain** for email (Resend's shared sender only delivers to your own address, so codes can't reach testers without one) | Any registrar (a yearly fee). **Paid: your call**. The same domain serves the site later | Stage 1 email to testers |
| 5 | **Resend** (free tier, no card) | resend.com → Domains → Add domain → add the DNS records it shows (SPF, DKIM) at your registrar → wait for "Verified" → API Keys → Create (sending access only) → put it in Railway `core-api` as `EMAIL_API_KEY`; set `EMAIL_FROM` = `Link <no-reply@your-domain>` | Stage 1 |
| 6 | **Google OAuth client** (free) | console.cloud.google.com → new project `link-staging` → APIs & Services → OAuth consent screen: External, **Testing** mode, app name "Link (testing)", support email yours, scopes `openid email profile`, **Test users**: each tester's Gmail (max 100) → Credentials → Create credentials → OAuth client ID → *Web application* → Authorised redirect URIs (exact): `http://localhost:4000/v1/auth/google/callback`, `https://<railway-api-domain>/v1/auth/google/callback`, and the Vercel web domain's `/v1/auth/google/callback` if the web proxies `/v1` → copy the client ID to `GOOGLE_CLIENT_ID` and the secret to `GOOGLE_CLIENT_SECRET` in Railway `core-api`. The teacher app needs an *Android* client later (package name + SHA-1); the Expo web demo uses the web client | Stage 1 |
| 7 | **The allowlist** | After Stage 1: ops console → Access allowlist → add each tester's email; or, for the first ops user, `STAGING_OPS_EMAILS` on Railway | Stage 1 |
| 8 | **Map key** | After Stage 2's comparison (`docs/plan/map-provider.md`); free tier only; no card unless you OK it | Stage 2 |

Exact variable names and where they go are repeated in `docs/go-live-switches.md` in each stage's PR. Values are never written to the repo.

## 6. Estimate per stage (agent working time)

| Stage | Work | Estimate | Main risk |
|---|---|---|---|
| 0 | Demo-route lock (done in this PR); Railway re-point and pre-deploy migrations | 0.5 day after the Railway login | Railway access |
| 1 | Identities, email and Google sign-in, linking, roles, allowlist, screens on 3 apps + ops, mock OIDC, tests | 5–7 days | Breadth: four sign-in surfaces; Google on Expo |
| 2 | Map adapter, provider comparison, C02 picker, P02/P05/J01 maps, ops pin review, tests | 3–4 days | Provider terms (caching, Arabic labels) |
| 3 | Real core-api on Railway in `LINK_ENV=staging`, staging guard (fakes only for payments, SMS, WhatsApp), banner, Vercel wiring, e2e against the deployed URLs, docs | 2–3 days | Railway resource limits (Whisper memory); US-East region (OD-26, sample data only) |

## 7. Where this plan differs from, or adds to, the brief

**Code lifetime.** The brief says the email code follows "the same rules as the phone OTP: 10 minutes". The phone code today lives **5 minutes** (`otp.ts`, docs/10 §4, and the SMS text says so). I recommend 10 minutes for email, because email can arrive late and the code is useless if it expires in transit. The phone stays at 5 minutes, so its SMS text and docs/10 stay true. If you'd rather have one number, I'd move both to 10 and change the SMS text, the docs and the test together.

**Identity subjects are always HMACs.** The brief lists the subject as "the HMAC'd phone, the normalised email, or the Google `sub`". I store an HMAC for all three (and the encrypted email next to it), so no plaintext email or Google ID sits in an indexed column. That matches the brief's own rule that emails are stored like phones.

**The allowlist lives in a table, managed in the ops console**, with an env variable (`STAGING_OPS_EMAILS`) only to let the first ops user in. An env variable alone would mean a redeploy for every new tester.

**Non-allowlisted email sign-ups.** To keep "no response reveals an account", the code request answers the same for everyone. A non-allowlisted person sees "private testing — request access" only **after** proving the address with the code. Google sign-ups are told at once, because Google has already proved the address.

**Google email equal to another account's email.** The brief forbids auto-linking. That case would otherwise create a second account for one person, which breaks "one person = one account". So the sign-up is refused, and the screen tells the person to sign in with the email code and add Google in Settings.

## 8. Stage 0 status

| Item | State |
|---|---|
| Lock `/__demo/*` | **Code done** (core-api `DemoSecretGuard` + `demoRoutesAllowed`, mock server `demo-gate.ts`); tests pass; **deploy and the anonymous-reset proof wait on item 1 of §5** |
| Railway services → `main`, auto-deploy, pre-deploy migrations | **Blocked** on the Railway login (§5 #1). Plan below |
| Unused resources | Listed below; nothing removed |

**Railway plan, once signed in (read first, then change):**

| Service | Today (Ahmed's read) | Change | Needs Ahmed's OK? |
|---|---|---|---|
| `core-api-l9aa` | `main`, last deploy 12 Oct, auto-deploy apparently off | Source `main`, auto-deploy on; **pre-deploy command** `node dist/migrate.mjs` (the image's dbmate-compatible runner; the image has no `dbmate` binary); set `DEMO_ROUTES_SECRET` | No (not a database redeploy) |
| `ai-service` | `codex/deploy-voice-demo` | Source `main`, Dockerfile `apps/ai-service/Dockerfile.railway-demo` (`RAILWAY_DOCKERFILE_PATH`), auto-deploy on | No |
| `postgres` | `codex/vercel-teacher-demo`, volume `postgres-data` | Source `main`, Dockerfile `deploy/railway-postgres.Dockerfile` (the same file, now on `main`) | **Yes: it redeploys the database** |
| `redis-state`, `redis-cache` | image `redis:7-alpine` | none | — |

**Unused-looking resources (nothing removed; your call):**

| Resource | What it looks like | Recommendation |
|---|---|---|
| Volume `ai-models` (not mounted) | Meant for the Whisper models (`AI_MODELS_DIR=/models`); unmounted, so the models are fetched again on every deploy | **Mount it** on `ai-service` at `/models` rather than delete it |
| Vercel project `link-platform-demo` | Created once, never updated | Delete, if you confirm nothing links to it |
| Branches `codex/deploy-voice-demo`, `codex/vercel-teacher-demo` | Merged into `main` (with the changes in the staging doc) | Delete after the services stop deploying from them |
