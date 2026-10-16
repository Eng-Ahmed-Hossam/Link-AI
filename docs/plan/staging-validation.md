# Staging validation (Part C, 2026-10-16)

Every screen in [app-map.md](../product/app-map.md), opened on the **hosted staging** (the real core-api, sample data; [environments](../deploy/environments.md)) at **390 px** wide, signed in as each sample role through the real sign-in screens (codes from the private inbox). Automatic checks per screen: HTTP status, page errors, the app's error state, horizontal overflow, `dir`, and interactive elements smaller than 24 px (WCAG 2.2 target size; the hidden skip link is not counted). Crawler: a Playwright script run from Ahmed's PC.

**Counts:** works 60 · not crawled 1 · mock-only 1 · missing 2 · no data 1. Nothing found **broken** by the checks; one entry flow was (Try Link in live mode, fixed: see the backlog P0).

| Screen | Role | Route | Result | Phone width (390 px) | Note |
|---|---|---|---|---|---|
| W00 | visitor | `/ar` | works | layout ✓ · RTL ✓ · 3 small target(s) |  |
| P01 | visitor | `/ar/welcome` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A18 | visitor | `/ar/centre` | works | layout ✓ · RTL ✓ · 1 small target(s) |  |
| C01 | visitor | `/ar/add-your-centre` | works | layout ✓ · RTL ✓ · 2 small target(s) |  |
| P02 | visitor | `/ar/search` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| P03 | visitor | `/ar/search/results?radiusKm=50` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| P04 | visitor | `/ar/centres/al-nour-maadi` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| P05 | visitor | `/ar/teachers/salma-fathy-maths` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| P06 | visitor | `/ar/teachers/salma-fathy-maths/reserve` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T14 | visitor | `/sign-in` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| OPS-signin | visitor | `/en/sign-in` | works | layout ✓ · EN (LTR) ✓ · targets ✓ |  |
| P09 | parent | `/ar/children` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| P07 | parent | `/ar/reserve/:id` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| P08 | parent | `/ar/reserve/:id/done` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| P10 | parent | `/ar/enrolments/:id/feedback` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| C03 | owner | `/ar/centre/:id/schedule` | works | ✗ overflows 600 px · RTL ✓ · targets ✓ |  |
| C02 | owner | `/ar/centre/:id/profile` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| C04 | owner | `/ar/centre/:id/reviews` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| C05 | owner | `/ar/centre/:id/rooms` | works | layout ✓ · RTL ✓ · 24 small target(s) |  |
| C06 | owner | `/ar/centre/:id/requests` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| C07 | owner | `/ar/centre/:id/rent-income` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A16 | owner | `/ar/centre/:id/staff` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A01 | owner | `/ar/centre/:id/today` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A02 | owner | `/ar/centre/:id/follow-ups` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A13 | owner | `/ar/centre/:id/students` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A05 | owner | `/ar/centre/:id/sessions` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A11 | owner | `/ar/centre/:id/communication` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A07 | owner | `/ar/centre/:id/rules` | works | layout ✓ · RTL ✓ · 4 small target(s) |  |
| A17 | owner | `/ar/centre/:id/activity` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A03 | owner | `/ar/centre/:id/follow-ups/:id` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| V06 | owner | `/ar/centre/:id/follow-ups/:id/reply` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A08 | owner | `/ar/centre/:id/follow-ups/:id/outcome` | works | layout ✓ · RTL ✓ · 1 small target(s) |  |
| A10 | owner | `/ar/centre/:id/follow-ups/:id/outcome/done` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A04 | owner | `/ar/centre/:id/students/:id` | works | layout ✓ · RTL ✓ · 1 small target(s) |  |
| A14 | owner | `/ar/centre/:id/sessions/:id` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| J05/T09 | teacher | `/groups` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| J01 | teacher | `/rooms` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| J03 | teacher | `/room-requests` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| J04 | teacher | `/profile` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| J06 | teacher | `/enrolments` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| J07 | teacher | `/earnings` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T01 | teacher | `/today` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| J02 | teacher | `/room/:id` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T10 | teacher | `/group/:id` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T13 | teacher | `/group/:id/history` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T02 | teacher | `/record/:id/attendance` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T03 | teacher | `/record/:id/scores` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T04 | teacher | `/record/:id/observation` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| V01 | teacher | `/record/:id/voice` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| V02 | teacher | `/record/:id/understood` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T07 | teacher | `/record/:id/identity` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T05 | teacher | `/record/:id/review` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T06 | teacher | `/record/:id/saved` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T08 | teacher | `/record/:id/failed` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| L01 | ops agent | `/ar/centres` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| L01-teachers | ops agent | `/ar/teachers` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| L02 | ops agent | `/ar/reviews` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| OPS-data | ops agent | `/ar/data-requests` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| L03 | ops finance | — | not crawled | — | finance user not signed in (code limits); covered by ops.spec |
| V07 | owner | — | mock-only | — | Ask Link is off in live without a local LLM (by design) |
| A15 | owner | — | missing | — | blocked (OD-21) |
| A19 | owner | — | missing | — | blocked (OD-21) |
| T12 | teacher | `/student/:id` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| T11 | teacher | `/student/:id/note` | works | layout ✓ · RTL ✓ · targets ✓ |  |
| A06/A09 | owner | — | no data | — | no parent message in the staging sample world (all A11 tabs at 0); covered by the follow-up integration tests |

## Other runs on staging

| Run | Result |
|---|---|
| Pin flow e2e (`e2e-modes/location.spec.ts`) against the staging URLs | **passed** (20 s): owner search (Nominatim) → drag → save → under review → ops approve → public map updated |
| `accounts.spec.ts` | 6 passed; 2 failed on the test (hard-coded localhost: fixed), 3 on the per-phone code limit (3 codes / 10 min for one sample person; staging keeps its rate limits, local runs reset them) |
| `ops.spec.ts` | failed on the test (hard-coded localhost:3001: fixed) |
| Story spec | **not runnable on staging by design**: it starts with a demo-route reset and pays for a seat; demo routes and bookings are off on the hosted staging |
| Voice path (sample bench clip, 7.9 s) | works: upload 1.2 s, **draft after 145 s**; Whisper **tiny** int8 on the Railway trial CPU (ai-service log: `faster-whisper:tiny@int8/cpu latency_ms=143738`); transcript poor, 0 items matched to the roster |
| Real map | OpenFreeMap tiles + Arabic labels on C02, P03 (clusters), P04, J01; no console errors under the production CSP |
