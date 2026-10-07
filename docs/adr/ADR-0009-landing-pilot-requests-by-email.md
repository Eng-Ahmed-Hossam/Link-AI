# ADR-0009 · Landing page: pilot requests by email (Resend), demo in the browser, cookieless analytics

- **Status:** Accepted for the public website before the hosted pilot (launch Stage 1). Replaced by core-api leads (`POST /v1/leads`) when there is a backend.
- **Date:** 2026-10-07
- **Deciders:** Founder; implemented in `apps/web` (`app/api/pilot-request`, `src/site`, `src/demo/try.ts`)

## Context

The landing page (Figma `68:616`) needs two ways in, before Link has a server or database of its own:

- **A. Try it now:** a visitor opens a demo under their own centre's name, as owner, Reception or teacher.
- **B. Request a free pilot:** a short form that reaches Ahmed.

There must be no passwords, no accounts and no paid service. Leads must not be stored anywhere except the email that delivers them, and their contents must not be logged.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Path B is a Next.js route handler** (`POST /api/pilot-request`). It validates the fields (`src/pilot-request.ts`, shared with the form), answers a filled honeypot field as a success but sends nothing, allows **5 requests per address per 10 minutes** (in memory, per server instance), then emails the request to `PILOT_REQUEST_TO`. | It's a serverless function on Vercel (Stage 3), with no server of our own. In-memory rate limiting is enough for a landing form; a bot that spreads across instances still meets the honeypot and validation. |
| 2 | **Email provider: Resend**, over its HTTP API with `fetch`, with no SDK. Key in `EMAIL_API_KEY`, sender in `EMAIL_FROM` (`EMAIL_PROVIDER=resend`). **Free tier (resend.com/pricing, checked 2026-10-07): 3,000 emails a month, 100 a day, 3 domains.** Without a verified domain, the shared sender `onboarding@resend.dev` delivers only to the Resend account owner's own address, which is exactly this use: requests go to Ahmed. | Free and simple: one HTTP call, no SMTP and no dependency. A domain can be verified later, at no cost, to send from `@link…`. Alternatives considered: Brevo (300 a day free, more setup), Postmark (100 a month free). |
| 3 | **No storage, no logging of contents.** The email is the only copy. Logs show only the provider's HTTP status on failure. With no key (local dev) the handler prints a redacted line (`010******78`, first letter and length of each name) and still confirms. | PDPL (Law 151/2020): collect only what is needed to call back, keep it in one place. |
| 4 | **Path A runs in the browser.** The in-browser mock backend (MSW, API mode `mock`) holds the sample scenario. "Your centre name" renames the sample centre in the scenario loader (`resetFollowupDb({ centreName })`), so drafts and screens say the visitor's centre. The visitor is signed in as the role they chose (sample accounts). Everything lives in `localStorage` and is wiped by "Reset demo". A teacher opens the teacher app's `/try`, which renames its own copy. | Nothing to host or secure; nothing a visitor types reaches us. A test proves no request leaves the browser except to our own static files (`apps/web/e2e/landing.spec.ts`). |
| 5 | **Analytics: PostHog, cookieless.** Only page views of the website pages and the two landing buttons (try, pilot) are sent. Each page load gets a random id kept in memory, person profiles are off, and URLs are sent without their query. It is off unless `NEXT_PUBLIC_POSTHOG_KEY` is set; the EU host is the default. | The stack's analytics tool (docs/05), used with no personal data, so no cookie banner is needed. |
| 6 | **The website pages ship none of the app's client code** (data layer, session, translations catalog, mock worker). The app providers moved from the root layout into the app sections' layouts. The forms receive their strings from the server page. The demo code loads only when "Open my demo" is pressed. | Lighthouse mobile ≥ 90 (performance) and search engines see the full page. |

## Consequences

- ✅ Both paths work on Vercel's free plan with no backend; tests cover validation, the honeypot, the rate limit and the no-network property of the demo.
- ⚠️ Resend's shared sender only reaches the account owner. To send elsewhere (for example a team inbox), verify a domain first.
- ⚠️ The rate limit resets when a serverless instance is recycled. Acceptable for a landing form; revisit if spam appears.
- ⚠️ Vercel's Hobby plan is for non-commercial use (Stage 3 note): move to a paid plan or our own hosting before charging centres.
