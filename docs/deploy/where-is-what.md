# Where is what (for Ahmed)

One page: every address, what it is for, and who gets which link. Everything is **sample data**. No real people's data until the consent pack is approved (OD-60).

## 1. The public trial: send this to centres and teachers

| Address | What it is | Who gets it |
|---|---|---|
| **https://link-ai-web-sigma.vercel.app** | The website: landing page, then **Try Link** → pick a role (parent, owner, teacher). Every visitor gets **their own sandbox**: nothing they do reaches anyone else, and it starts over after a few hours. | **Anyone you want to show Link to.** No sign-in, no real data. |
| https://link-ai-teacher-demo.vercel.app | The teacher app for the trial. Opened **from Try Link → Teacher**: it joins the visitor's sandbox. | Nobody directly; the website opens it. |

## 2. The live staging: for testers you invite (the real backend)

| Address | What it is | Who gets it |
|---|---|---|
| **https://link-ai-staging-web.vercel.app** | The real web app on the real core-api: parents and owners. A banner says "Test environment — sample data". Bookings are off. | **Testers you invite**, with the sample phone number for their role. |
| **https://link-ai-staging-teacher.vercel.app** | The real teacher app (web build). | Teacher testers. |
| https://link-ai-staging-ops.vercel.app | The ops console. | **You only** (and any ops tester). |
| https://core-api-l9aa-production.up.railway.app/__staging/sms | **The sign-in codes inbox.** The browser asks for a password: any user name; the password is `SMS_SINK_TOKEN` (Railway → `core-api-l9aa` → Variables). Codes stay one hour. | **You only.** Testers ask you for their code. |

**Sample numbers to sign in** (codes appear in the inbox, never as an SMS):

| Role | Number |
|---|---|
| Parent | 010 0000 0001 |
| Teacher | 010 0000 0002 |
| Owner | 010 0000 0003 |
| Reception | 010 0000 0004 |
| Ops agent | 010 0000 0051 |
| Ops finance | 010 0000 0052 |

One person can ask for 3 codes per 10 minutes. Google sign-in comes with the auth stage.

## 3. Behind the scenes: never share these

| Address | What it is |
|---|---|
| https://ai-service-production-43b7.up.railway.app | The demo API behind the trial (sandboxes) plus Whisper. Answers only inside a sandbox. |
| https://core-api-l9aa-production.up.railway.app | The real core-api behind the staging. |
| Railway project `link-ai-staging` · Vercel team `ahmed-hossams-projects-059a8e76` | The dashboards. |

## 4. Is it up?

- Each app answers **`/health`** (the teacher apps: **`/health.json`**) with the commit it runs.
- The GitHub workflow **`deployed`** checks every page after each deploy of `main`, nightly at 02:00 UTC, and when started by hand. If something breaks, an issue called **"Deployed check failing"** opens and GitHub emails you. It closes itself when the check passes again.
- To run it yourself: `pnpm smoke:deployed` (add `--full` for Arabic and English at phone and desktop widths).

Details for engineers: [environments.md](environments.md).
