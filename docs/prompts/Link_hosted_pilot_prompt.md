# Link: hosted pilot, so real centre staff can use it from their own phones

> Saved from Ahmed's message of 2026-10-07. Stage 5 of the launch (last, only when Ahmed says so).

**Goal:** turn the existing pilot build into a **hosted, single-centre instance** on a VPS, reachable over HTTPS on a real domain. Teachers, reception and the owner use it from their own phones and laptops, anywhere. This replaces "laptop at the centre" as the default pilot setup; keep the laptop mode working as the fallback.

**Not in scope:** the full multi-tenant backend (core-api, Postgres RLS), the marketplace, and the WhatsApp API. One instance serves one centre.

**Fill-ins from me (ask if still blank when you need them):**
- [DOMAIN], for example `pilot.link-edu.com`;
- [VPS] (Hostinger KVM plan, region [REGION]) and its root SSH access;
- [CENTRE NAME];
- [VOICE: off | cloud-stt].

---

## 0. Data rules for the hosted version (decide before deploying; record in `docs/13` and ADR-0009)

- **Pseudonymised data only, same as the laptop pilot:** first names or codes, guardian labels, **no phone numbers, no national IDs**, no family names.
- **Where the data lives:** the VPS region [REGION]. Add to `docs/13` a decision that the hosting provider is a processor of pseudonymised pilot data. Update the **centre agreement** and **teacher consent** to say so: the data is on a server operated by [provider] in [region], who can access it, how long it's kept, and how it's deleted.
- **Legal check flag:** add a clear "⚠ Needs legal check before use: Egyptian personal-data law rules on storing personal data outside Egypt" box at the top of both documents. Don't remove it yourself.
- **Voice:**
  - **[VOICE = off] (default):** teachers tap attendance and type notes. Voice is hidden.
  - **[VOICE = cloud-stt]:** only after I approve a named provider. Check its current terms: no training on inputs, retention, and region. Then put it in ADR-0007, mark it `allowsRealData=true`, and name it in the consent. The leak check and tokenisation still run before any LLM call. **Never** send real audio to a provider marked `allowsRealData=false`. The existing guard enforces this; keep its tests.
  - Local Whisper and Ollama on a CPU-only VPS are too slow (more than 40 s per note); don't enable them on the VPS.

## 1. Deployment
- **Docker Compose for production:**
  - the pilot web app (owner and reception);
  - the teacher web app;
  - the pilot API/store;
  - **Caddy** for automatic HTTPS (Let's Encrypt) on [DOMAIN], with `teacher.[DOMAIN]` or a path for the teacher app.
- **Build hardening:** production builds only (no dev servers, no Next.js dev mode). The **existing pilot startup check must run in the container**, and it refuses to start with any demo route, fixture or demo user.
- **`deploy/` folder:**
  - `deploy/README.md`: step-by-step from a fresh Ubuntu VPS: create a non-root user, SSH keys only, the firewall (only ports 22, 80 and 443), unattended security updates, install Docker, set the DNS records, first deploy, update, rollback;
  - `deploy/bootstrap.sh` (idempotent) and `deploy/deploy.sh` (build, then `compose up -d`, then a health check, with automatic rollback on failure).
- **Secrets** live only in a server-side `.env.production`, never in git. Generate them on first deploy.
- **Time zone:** the containers run in UTC, and the app logic stays in Africa/Cairo (already the case; test it).

## 2. Security for the open internet
The laptop pilot was LAN-only; now it isn't.
- **Sessions:**
  - PIN sign-in stays: 5 tries, a 15-minute lock and hashed PINs;
  - add a **per-IP rate limit** on sign-in and on the API;
  - cookies are `Secure`, `HttpOnly` and `SameSite=Lax`;
  - sessions expire after 12 h idle;
  - "sign out everywhere" for the owner.
- **The owner's PIN is longer (8 digits),** and the owner can reset a staff PIN.
- **HTTP hardening:**
  - CORS: an exact allow-list of the two app origins;
  - security headers: HSTS, CSP, frame-ancestors none, no-sniff, referrer policy;
  - request body size limits.
- **Uploads:** no audio upload endpoint at all when [VOICE = off].
- **Audit:** every sign-in, failed sign-in, PIN reset and data export goes to the activity log.
- **Pre-launch check:**
  - run a quick OWASP-style self-check with the existing test tooling: auth bypass attempts, IDOR across staff roles, demo routes absent, headers present;
  - add these as e2e tests against a local production-mode container.

## 3. Backups, monitoring and recovery
- **Backups:**
  - encrypted (age or GPG, with a key that **I** hold, not stored on the server);
  - **every hour** to a second location: a separate cheap object store, or at least a pull to my laptop via a script. Choose the cheapest reliable option, and document the cost.
  - keep 7 days.
- **Restore drill:** restore into a fresh container and verify. Write it in the README, with a test.
- **Health:**
  - a `/healthz` endpoint;
  - a free uptime monitor (for example UptimeRobot) to set up by hand, with steps documented;
  - the disk-space warning in the activity log.
- **`pilot:wipe` on the server:** it deletes all data and backups, including the off-site copies, and prints a deletion receipt.

## 4. Onboarding real users
- **`pnpm pilot:import`** works against the server (an authenticated owner-only upload in the owner web), with the same dry-run validation, roster and schedule CSVs, and pseudonymised fields only. Reject any column that looks like a phone number or an ID.
- **Staff invites:** the owner creates staff and sees each **one-time PIN** once. Print a small slip per staff member: the URL, a QR code for the URL, and "change your PIN on first sign-in". Add **forced PIN change on first sign-in**.
- **"Add to home screen":** make the teacher app and the owner web installable PWAs (a manifest, icons from the logo, a proper app name in Arabic).
- **Guides:** update the quick guides (teacher, reception, owner) for the hosted URL and QR sign-in, and regenerate the PDFs.
- **Practice:** keep the practice centre as a **separate instance** on `practice.[DOMAIN]` (or a separate compose project) that resets nightly. Real data is never mixed into it.

## 5. Phones and quality
- Test on **real phones**: at least one Android (Chrome) and, if available, one iPhone (Safari). Cover sign-in, attendance, a typed note, confirming a record, and the owner flow on a laptop. If no device is available, say so; don't claim it works.
- Measure time to load on a slow 4G connection (Chrome throttling), and keep the first load of the teacher app under 3 s on "Fast 4G".
- The axe checks and all existing suites stay green, in laptop-pilot mode **and** hosted mode.

## 6. Stop and report
1. The live URLs (main + practice), and confirmation that the HTTPS and security headers grade A on a public checker.
2. The `deploy/README.md` steps, timed from a fresh VPS.
3. Security test results (auth, roles, demo routes absent, headers, rate limits).
4. The backup and restore drill result, plus the monthly cost (VPS + backups + domain).
5. The real-phone test results.
6. The updated consent and agreement wording (with the legal-check box), for my approval.
7. **A go-live checklist,** split into what's left for me (DNS, VPS access, legal check, approving the consent, the centre's CSVs, printing the staff slips) and what's done.

No paid services beyond the VPS, the domain and a cheap backup store, each with its cost stated. No real data until I approve the updated consent.
