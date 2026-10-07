# Link: get it in front of trial clients (GitHub, Vercel demo, landing page, polish, hosted pilot)

> Saved from Ahmed's message of 2026-10-07. The order and the sign-up design were overridden by the "landing page first" prompt (2026-10-07): 1 landing page → 2 GitHub → 3 Vercel → 4 UI polish → 5 Hostinger (last).

**The goal has changed:** we now want **real trial clients** (tutoring centres) to see and try Link, and to get their genuine reaction. That needs:
1. the code safely on GitHub;
2. a **public demo + landing page** on Vercel (sample data only) that I can send to any centre;
3. a **UI that looks good and is easy to use**;
4. a **hosted pilot** for centres that agree to try it with their own (pseudonymised) data, on a Hostinger VPS.

App stores (Google Play / App Store) come **later, not now**; keep the Expo app store-ready, but don't build or submit anything.

Repo: `https://github.com/Eng-Ahmed-Hossam/Link-AI.git`

**Where each part runs (keep to this split):**

| What | Where | Data |
|---|---|---|
| Landing page | Vercel | none (only the trial-request form) |
| Public demo: owner web, parent PWA, teacher app (web build) | Vercel, **in-browser mock mode** (MSW), no server | sample data only, resets per visitor |
| Hosted pilot for real centres | Hostinger VPS (Docker, `Link_hosted_pilot_prompt.md`) | pseudonymised real data |
| Voice notes (Whisper/Ollama) | the laptop (for now), or later a cloud STT I approve | — |

Vercel can't run our pilot store (it needs a persistent disk) or the Python speech service, so they never go there.

Work in stages and **stop where marked**. Use the same quality bar as before: tests green, Arabic first, no demo code in pilot builds, no real data anywhere except the hosted pilot.

---

## Stage 1: push to GitHub safely (no stop; report it in Stage 2's report)
1. **Audit before the first push:**
   - run a secret scanner over the **whole history** (for example `gitleaks detect` or `trufflehog git file://.`), and fix anything found;
   - check that `.gitignore` covers: every `.env*` except `.env.example`; `apps/pilot/.env.pilot`; pilot data folders and backups; certificates and keys (`*.pem`, `*.key`, the mkcert CA); `evals/gold/real/`; any team recordings; Whisper and Ollama model files; `node_modules`; build outputs; Playwright reports; `.turbo`, `.next` and `.expo`;
   - find any file over 50 MB in the history (`git rev-list --objects --all` plus sizes). If any exist, tell me before pushing; don't rewrite history without my OK.
2. **Make the repo understandable:**
   - a **README.md** at the root: what Link is (2 lines), the repo map (link `docs/dev/repo-map.md`), quick start for demo and pilot practice, links to the docs, the Figma file and the Eraser diagrams, and the "sample data only" rule;
   - a **LICENSE**: ask me (keep it "All rights reserved" if I don't answer);
   - **SECURITY.md** with how to report an issue.
3. **Push:**
   - `git remote add origin https://github.com/Eng-Ahmed-Hossam/Link-AI.git`, then `git push -u origin main`, using my credentials on this machine;
   - tell me whether the repo is public or private. **I recommend private** until the pilot ends, because `docs/` includes draft consent documents and internal decisions.
4. **GitHub Actions:**
   - make the existing CI run on GitHub: lint, typecheck, unit tests, the Python tests and `i18n:check`;
   - add the secret scanner as a CI step;
   - e2e can be manual-trigger only, to save minutes;
   - give me the branch-protection settings to click (require CI on `main`).

## Stage 2: public demo on Vercel (sample data) — **stop and report**
1. **Demo build mode:** `LINK_MODE=public-demo`.
   - All apps run with **in-browser MSW** (no mock server, no shared state); each visitor gets their own fresh scenario.
   - A persistent banner on every page: «نسخة تجريبية — بيانات افتراضية» / "Demo — sample data".
   - A "Reset demo" button.
   - **Hide** the developer bits: the `/dev` index and the raw Demo controls. Keep only friendly demo actions where the story needs them ("Simulate parent reply", "Mark delivered"), each clearly labelled as a demo action.
   - Voice: use the scripted demo note, labelled "Demo voice note (scripted)". There's no microphone upload in the public demo.
   - A test confirms the pilot code paths, the pilot data and the `/dev` index aren't in this build.
2. **Vercel projects** (monorepo, Turborepo):
   - **`link-web`:** root `apps/web`; landing at `/`, owner demo at `/{lang}/centre`, parent PWA at `/{lang}/welcome`;
   - **`link-teacher`:** the Expo **web export** of `apps/teacher-app` as a static site, in the same mock mode;
   - add a `vercel.json` / project settings for each (build command via turbo, output dirs, Node 24, pnpm);
   - environment variables only from `.env.example` names; no secrets are needed for the public demo;
   - cross-links: the landing page's "Try the demo" opens a small chooser (Owner/Reception · Teacher · Parent) with one-click sign-in as the sample user.
3. **Write `docs/deploy/vercel.md`:** connect the repo, create the two projects, set the env vars, add a custom domain later.
   - **I'll do the clicking in Vercel.** You prepare everything, and verify locally with `vercel build`, or a production build, plus a static preview.
4. **Checks on the production build:**
   - the crawler (all routes, ar/en);
   - axe;
   - Lighthouse on the landing and on the first demo page: target **≥ 90** for performance, accessibility, best practices and SEO on mobile;
   - the first load of the teacher web app under 3 s on "Fast 4G".

**Stop and report:**
- Stage 1 results: the secret-scan result, the big-files result, the push, and whether the repo is public or private.
- The exact Vercel steps for me.
- The local production-build check results.
- Anything that differs between the public demo and the local `pnpm demo`.

---

## Stage 3: landing page (show the product off)
- **Build it from Figma:** page `68:605`, frame `68:616`, using the `Link/Web/*` text styles and the `Link Web / Button` and `FAQ item` components (`docs/11`).
- **Update the copy to today's product:** OD-48 and CF-19 now resolve in favour of the **follow-up product**, so the landing page **leads with follow-up**:
  - the problem: students drifting away unnoticed;
  - how it works: voice note → teacher confirms → readable flag → assigned follow-up → approved parent message → logged outcome;
  - trust points: the teacher confirms every record; nothing is sent without staff approval; missing data is not absence; data handling in plain words.
  - Record that decision in `docs/13`.
  - The marketplace sections stay hidden by flag.
- **No invented claims.** No numbers, no testimonials, no client logos, and no "AI that predicts dropouts". Pilot results can be added later as real quotes, with permission.
- **Call to action:** "اطلب تجربة مجانية لمركزك" / "Request a free trial for your centre", as a form with centre name, contact name, phone or WhatsApp, area, number of teachers, a consent tick ("you may contact me about Link"), and an anti-spam honeypot.
  - Submissions go to a **free** destination that needs no database on Vercel: an email to me (via a free transactional email tier) **or** a form service. Pick one, record it, and add a short privacy note under the form.
  - Never store leads in the repo.
- **Plus:** "Try the demo" (Stage 2 chooser), a short "How a pilot works" section (7 days, free, laptop or hosted, pseudonymised), the FAQ, and a footer with contact, privacy note and language switch.
- **Promo video:** add a slot for the video (`docs/` has the Higgsfield plan). Leave it empty until I supply the file; the page must look complete without it.
- **Quality:**
  - Arabic first, RTL correct;
  - SEO metadata, Open Graph image and social cards in ar/en;
  - privacy-friendly analytics with no personal data (Vercel Analytics or the PostHog setup without personal data);
  - Lighthouse ≥ 90 on mobile.

## Stage 4: make it appealing and easy to use (the UI quality pass)
Do **Part 2 of `Link_walkthrough_and_ui_quality_prompt.md`** now, scoped to:
- the landing;
- the public demo path (owner Today → case → message → outcome; teacher record flow; parent welcome → search → reserve);
- the pilot screens.

If I've sent `docs/testing/findings.md`, merge my findings first. Also include:
- **First-time experience:** a 3-step welcome tour per role (skippable, shown once), plus empty states that tell the user what to do next.
- **Fewer taps:** for the three daily tasks (teacher confirms a record, reception handles a follow-up, owner checks Today), count the taps and screens, then remove at least one step from each where the rules allow. Never remove a required approval or confirmation.
- **Plain Arabic:** simplify any label that sounds technical. List the changes for my review in `strings-to-review.csv`.
- **Speed:** skeleton loaders, optimistic UI where safe, and no layout shift.
- **Before/after:** screenshots and the audit scores, as specified in Part 2.

**Stop and report after Stages 3–4:**
- the landing page preview (local production build), with the Lighthouse scores;
- the before/after images;
- the tap counts before and after;
- the strings for me to review.

---

## Stage 5: hosted pilot on Hostinger
Do `Link_hosted_pilot_prompt.md` in full: VPS, Docker, HTTPS, hardening, backups, PIN invites with QR slips, the practice instance, and the consent update with the legal-check box.
- Link it from the landing page **only** as "Sign in" for existing pilot centres, never as an open sign-up.
- **Stop and report** with that prompt's go-live checklist.

## Later (don't build now)
App stores: write `docs/deploy/app-stores.md` only.
- **What it covers:** EAS Build/Submit, the Google Play and Apple developer accounts, privacy labels and data-safety forms, icons and splash from the brand, and the review risks (login demo account, microphone permission text in Arabic and English).
- **App config:** make sure `app.json` already has the bundle IDs, an Arabic display name, and the permission strings, so it's ready when we decide.

---

**Model:** run all of this on Opus 5.5, high effort. **My parallel tasks:** create the Vercel account and connect GitHub; buy a domain; get the Hostinger VPS; get the legal check on hosting; contact centres with the demo link once it's live.
