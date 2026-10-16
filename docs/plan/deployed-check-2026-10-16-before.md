# Deployed check — before the fixes (2026-10-16 05:05 UTC)

**Step 1 of the brief of 2026-10-16:** reproduced before any change. Findings:

| # | Finding | Pages | Cause |
|---|---|---|---|
| 1 | **Public trial: the teacher entry is broken** — Try → teacher answers `404 /__demo/settings` on the demo API, the sample sign-in never happens, every teacher tab fails | T09, J01, J07, T01 (public trial) | The `/__demo` lock (Stage 0) closed the routes the trial's teacher app calls; the trial also shared ONE demo world between all visitors |
| 2 | **C02's map does not show on a phone** (canvas off-screen, flagged blank) | C02 at 390 px (trial and staging) | The owner shell keeps its 256 px sidebar at every width: the page gets ~70 px |
| 3 | Anonymous staging pages answer `401 /v1/me` and `401 /v1/auth/refresh` | staging web, signed out | Expected: the app asks for a session the visitor does not have (to be marked expected in the check) |
| — | P03, P04, J01 maps on staging and P03/P04 on the trial | — | Tiles 200 and drawn |

`pnpm smoke:deployed --full` against [deploy/deployed-urls.json](../../deploy/deployed-urls.json): 80 page checks, **62 clean, 18 with problems**, 281 s.

| Env | App | Role | Page | Lang @ width | Main action | Result | Map | Console errors | Failed requests |
|---|---|---|---|---|---|---|---|---|---|
| staging | web | visitor | W00 landing | ar @ 390 | hero + staging banner ✓ | clean | — | — | — |
| staging | web | parent | P01 sign-in | ar @ 390 | phone code from the inbox → search ✓ | **problem** | — | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| staging | web | parent | P09 my children | ar @ 390 | children list loads ✓ | clean | — | — | — |
| staging | web | owner | A18 sign-in | ar @ 390 | phone code from the inbox → own centre ✓ | **problem** | — | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| staging | teacher | teacher | T14 sign-in | ar @ 390 | phone code from the inbox → My groups ✓ | clean | — | — | — |
| staging | web | parent | P09 my children | en @ 390 | children list loads ✓ | clean | — | — | — |
| staging | web | owner | C03 schedule | ar @ 390 | schedule loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T09 groups | ar @ 390 | /groups tab loads ✓ | clean | — | — | — |
| staging | web | parent | P09 my children | ar @ 1280 | children list loads ✓ | clean | — | — | — |
| staging | web | parent | P09 my children | en @ 1280 | children list loads ✓ | clean | — | — | — |
| staging | web | visitor | P03 map & results | ar @ 390 | results listed, map drawn ✓ | **problem** | 13 tiles | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| staging | web | owner | C02 location | ar @ 390 | map drawn, Edit pin opens search ✓ | **problem** | 10 tiles, **blank** | — | — |
| staging | teacher | teacher | J01 rooms | ar @ 390 | /rooms tab loads ✓ | clean | 12 tiles | — | — |
| staging | ops | ops agent | ops sign-in | ar @ 390 | phone code from the inbox → L01 ✓ | clean | — | — | — |
| staging | teacher | teacher | J07 earnings | ar @ 390 | /earnings tab loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T01 follow-up | ar @ 390 | /today tab loads ✓ | clean | — | — | — |
| staging | ops | ops agent | L01 centre requests | ar @ 390 | pipeline loads ✓ | clean | — | — | — |
| staging | web | owner | C03 schedule | en @ 390 | schedule loads ✓ | clean | — | — | — |
| staging | web | visitor | P04 centre | ar @ 390 | centre map + Google Maps link ✓ | **problem** | 10 tiles | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| staging | ops | ops agent | L01 centre requests | en @ 390 | pipeline loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T09 groups | en @ 390 | /groups tab loads ✓ | clean | — | — | — |
| staging | ops | ops agent | L01 centre requests | ar @ 1280 | pipeline loads ✓ | clean | — | — | — |
| staging | web | visitor | W00 landing | en @ 390 | hero + staging banner ✓ | clean | — | — | — |
| staging | ops | ops agent | L01 centre requests | en @ 1280 | pipeline loads ✓ | clean | — | — | — |
| public trial | web | visitor | W00 landing | ar @ 390 | hero visible ✓ | clean | — | — | — |
| public trial | web | visitor | role chooser | ar @ 390 | three roles offered ✓ | clean | — | — | — |
| public trial | web | visitor | W00 landing | en @ 390 | hero visible ✓ | clean | — | — | — |
| staging | web | owner | C02 location | en @ 390 | map drawn, Edit pin opens search ✓ | **problem** | 9 tiles, **blank** | — | — |
| public trial | web | visitor | role chooser | en @ 390 | three roles offered ✓ | clean | — | — | — |
| staging | teacher | teacher | J01 rooms | en @ 390 | /rooms tab loads ✓ | clean | 10 tiles | — | — |
| staging | teacher | teacher | J07 earnings | en @ 390 | /earnings tab loads ✓ | clean | — | — | — |
| public trial | web | visitor | W00 landing | ar @ 1280 | hero visible ✓ | clean | — | — | — |
| staging | web | visitor | P03 map & results | en @ 390 | results listed, map drawn ✓ | **problem** | 11 tiles | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| staging | teacher | teacher | T01 follow-up | en @ 390 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | visitor | role chooser | ar @ 1280 | three roles offered ✓ | clean | — | — | — |
| staging | web | owner | C03 schedule | ar @ 1280 | schedule loads ✓ | clean | — | — | — |
| public trial | web | visitor | W00 landing | en @ 1280 | hero visible ✓ | clean | — | — | — |
| public trial | web | visitor | role chooser | en @ 1280 | three roles offered ✓ | clean | — | — | — |
| staging | teacher | teacher | T09 groups | ar @ 1280 | /groups tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P02 search (via Try) | ar @ 390 | Try → parent lands on search ✓ | clean | — | — | — |
| staging | web | visitor | P04 centre | en @ 390 | centre map + Google Maps link ✓ | **problem** | 9 tiles | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| staging | web | owner | C02 location | ar @ 1280 | map drawn, Edit pin opens search ✓ | clean | 12 tiles | — | — |
| staging | web | visitor | W00 landing | ar @ 1280 | hero + staging banner ✓ | clean | — | — | — |
| staging | web | owner | C03 schedule | en @ 1280 | schedule loads ✓ | clean | — | — | — |
| staging | teacher | teacher | J01 rooms | ar @ 1280 | /rooms tab loads ✓ | clean | 13 tiles | — | — |
| staging | teacher | teacher | J07 earnings | ar @ 1280 | /earnings tab loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T01 follow-up | ar @ 1280 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P03 map & results | ar @ 390 | results listed, map drawn ✓ | clean | 13 tiles | — | — |
| staging | teacher | teacher | T09 groups | en @ 1280 | /groups tab loads ✓ | clean | — | — | — |
| staging | web | visitor | P03 map & results | ar @ 1280 | results listed, map drawn ✓ | **problem** | 13 tiles | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| staging | web | owner | C02 location | en @ 1280 | map drawn, Edit pin opens search ✓ | clean | 11 tiles | — | — |
| public trial | web | parent | P04 centre | ar @ 390 | centre map + Google Maps link ✓ | clean | 10 tiles | — | — |
| staging | teacher | teacher | J01 rooms | en @ 1280 | /rooms tab loads ✓ | clean | 11 tiles | — | — |
| public trial | web | owner | C03 schedule (via Try) | ar @ 390 | Try → owner lands on the schedule ✓ | clean | — | — | — |
| staging | teacher | teacher | J07 earnings | en @ 1280 | /earnings tab loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T01 follow-up | en @ 1280 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P02 search (via Try) | en @ 390 | Try → parent lands on search ✓ | clean | — | — | — |
| staging | web | visitor | P04 centre | ar @ 1280 | centre map + Google Maps link ✓ | **problem** | 10 tiles | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| staging | web | visitor | W00 landing | en @ 1280 | hero + staging banner ✓ | clean | — | — | — |
| public trial | web | owner | C02 location | ar @ 390 | map drawn, Edit pin opens search ✓ | **problem** | 10 tiles, **blank** | — | — |
| public trial | web | parent | P03 map & results | en @ 390 | results listed, map drawn ✓ | clean | 11 tiles | — | — |
| public trial | web | owner | C03 schedule (via Try) | en @ 390 | Try → owner lands on the schedule ✓ | clean | — | — | — |
| staging | web | visitor | P03 map & results | en @ 1280 | results listed, map drawn ✓ | **problem** | 11 tiles | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| public trial | web | owner | C02 location | en @ 390 | map drawn, Edit pin opens search ✓ | **problem** | 9 tiles, **blank** | — | — |
| public trial | web | parent | P04 centre | en @ 390 | centre map + Google Maps link ✓ | clean | 9 tiles | — | — |
| public trial | web | parent | P02 search (via Try) | ar @ 1280 | Try → parent lands on search ✓ | clean | — | — | — |
| public trial | web | owner | C03 schedule (via Try) | ar @ 1280 | Try → owner lands on the schedule ✓ | clean | — | — | — |
| staging | web | visitor | P04 centre | en @ 1280 | centre map + Google Maps link ✓ | **problem** | 9 tiles | — | 401 link-ai-staging-web.vercel.app/v1/me; 401 link-ai-staging-web.vercel.app/v1/auth/refresh |
| public trial | web | parent | P03 map & results | ar @ 1280 | results listed, map drawn ✓ | clean | 13 tiles | — | — |
| public trial | web | owner | C02 location | ar @ 1280 | map drawn, Edit pin opens search ✓ | clean | 12 tiles | — | — |
| public trial | web | owner | C03 schedule (via Try) | en @ 1280 | Try → owner lands on the schedule ✓ | clean | — | — | — |
| public trial | web | parent | P04 centre | ar @ 1280 | centre map + Google Maps link ✓ | clean | 10 tiles | — | — |
| public trial | web | parent | P02 search (via Try) | en @ 1280 | Try → parent lands on search ✓ | clean | — | — | — |
| public trial | web | owner | C02 location | en @ 1280 | map drawn, Edit pin opens search ✓ | clean | 11 tiles | — | — |
| public trial | web | parent | P03 map & results | en @ 1280 | results listed, map drawn ✓ | clean | 11 tiles | — | — |
| public trial | web | parent | P04 centre | en @ 1280 | centre map + Google Maps link ✓ | clean | 9 tiles | — | — |
| public trial | teacher | teacher | T09 groups (via Try) | ar @ 390 | Try → teacher lands on My groups ✗ [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed | **problem** | — | — | 404 ai-service-production-43b7.up.railway.app/__demo/settings |
| public trial | teacher | teacher | J01 rooms | ar @ 390 | /rooms tab loads ✗ [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed | **problem** | — | — | — |
| public trial | teacher | teacher | J07 earnings | ar @ 390 | /earnings tab loads ✗ [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed | **problem** | — | — | — |
| public trial | teacher | teacher | T01 follow-up | ar @ 390 | /today tab loads ✗ [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed | **problem** | — | — | — |
