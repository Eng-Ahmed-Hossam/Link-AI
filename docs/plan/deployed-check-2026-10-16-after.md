# Deployed check — after the fixes (2026-10-16 05:54 UTC)

**Step 1 rerun** (commit `6ecba1a`, every app's `/health` confirmed it): Arabic and English at 390 and 1280 px, the public trial in each role and the live staging with real sign-ins (codes from the private inbox).

| | Before | After |
|---|---|---|
| Page checks | 80 | 92 (the trial teacher's tabs could not be reached before) |
| Clean | 62 | **92** |
| With problems | 18 | **0** |

**Fixed pages:** the public trial's teacher entry and its tabs (T09 groups, J01 rooms with the map, J07 earnings, T01 follow-up) — one sandbox per visitor on the demo API (ADR-0010); C02's map on phones (trial and staging) — the owner web's sidebar folds into a Menu; the staging's signed-out `401 /v1/me` checks are marked expected. Also verified in the deployed bundles: the map provider and the API addresses are inlined (OpenFreeMap; the demo API for the trial apps; core-api for the staging teacher app).

**On GitHub:** the workflow `deployed` passed on `6ecba1a` — [run 38857680719](https://github.com/Eng-Ahmed-Hossam/Link-AI/actions/runs/38857680719): about 5 min in all, of which about 4 min waiting for every app to report the commit and 29 s of checks (quick matrix). The staging sign-in checks are skipped there until the secret `STAGING_SMS_SINK_TOKEN` is added. Issue #8 ("Deployed check failing", from the run before the skip fix) closed itself.

`pnpm smoke:deployed --full` against [deploy/deployed-urls.json](../../deploy/deployed-urls.json): 92 page checks, **92 clean, 0 with problems**, 79 s.

| Env | App | Role | Page | Lang @ width | Main action | Result | Map | Console errors | Failed requests |
|---|---|---|---|---|---|---|---|---|---|
| staging | web | visitor | W00 landing | ar @ 390 | hero + staging banner ✓ | clean | — | — | — |
| staging | web | parent | P01 sign-in | ar @ 390 | phone code from the inbox → search ✓ | clean | — | — | — |
| staging | web | owner | A18 sign-in | ar @ 390 | phone code from the inbox → own centre ✓ | clean | — | — | — |
| staging | web | parent | P09 my children | ar @ 390 | children list loads ✓ | clean | — | — | — |
| staging | web | owner | C03 schedule | ar @ 390 | schedule loads ✓ | clean | — | — | — |
| staging | web | parent | P09 my children | en @ 390 | children list loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T14 sign-in | ar @ 390 | phone code from the inbox → My groups ✓ | clean | — | — | — |
| staging | teacher | teacher | T09 groups | ar @ 390 | /groups tab loads ✓ | clean | — | — | — |
| staging | web | parent | P09 my children | ar @ 1280 | children list loads ✓ | clean | — | — | — |
| staging | web | parent | P09 my children | en @ 1280 | children list loads ✓ | clean | — | — | — |
| staging | web | visitor | P03 map & results | ar @ 390 | results listed, map drawn ✓ | clean | 13 tiles | — | — |
| staging | ops | ops agent | ops sign-in | ar @ 390 | phone code from the inbox → L01 ✓ | clean | — | — | — |
| staging | web | owner | C02 location | ar @ 390 | map drawn, Edit pin opens search ✓ | clean | 10 tiles | — | — |
| staging | ops | ops agent | L01 centre requests | ar @ 390 | pipeline loads ✓ | clean | — | — | — |
| staging | teacher | teacher | J01 rooms | ar @ 390 | /rooms tab loads ✓ | clean | 12 tiles | — | — |
| staging | ops | ops agent | L01 centre requests | en @ 390 | pipeline loads ✓ | clean | — | — | — |
| staging | teacher | teacher | J07 earnings | ar @ 390 | /earnings tab loads ✓ | clean | — | — | — |
| staging | web | owner | C03 schedule | en @ 390 | schedule loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T01 follow-up | ar @ 390 | /today tab loads ✓ | clean | — | — | — |
| staging | ops | ops agent | L01 centre requests | ar @ 1280 | pipeline loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T09 groups | en @ 390 | /groups tab loads ✓ | clean | — | — | — |
| staging | ops | ops agent | L01 centre requests | en @ 1280 | pipeline loads ✓ | clean | — | — | — |
| staging | web | visitor | P04 centre | ar @ 390 | centre map + Google Maps link ✓ | clean | 10 tiles | — | — |
| staging | web | visitor | W00 landing | en @ 390 | hero + staging banner ✓ | clean | — | — | — |
| public trial | web | visitor | W00 landing | ar @ 390 | hero visible ✓ | clean | — | — | — |
| public trial | web | visitor | role chooser | ar @ 390 | three roles offered ✓ | clean | — | — | — |
| public trial | web | visitor | W00 landing | en @ 390 | hero visible ✓ | clean | — | — | — |
| public trial | web | visitor | role chooser | en @ 390 | three roles offered ✓ | clean | — | — | — |
| public trial | web | visitor | W00 landing | ar @ 1280 | hero visible ✓ | clean | — | — | — |
| staging | web | owner | C02 location | en @ 390 | map drawn, Edit pin opens search ✓ | clean | 9 tiles | — | — |
| public trial | web | visitor | role chooser | ar @ 1280 | three roles offered ✓ | clean | — | — | — |
| public trial | web | visitor | W00 landing | en @ 1280 | hero visible ✓ | clean | — | — | — |
| staging | web | owner | C03 schedule | ar @ 1280 | schedule loads ✓ | clean | — | — | — |
| public trial | web | visitor | role chooser | en @ 1280 | three roles offered ✓ | clean | — | — | — |
| staging | teacher | teacher | J01 rooms | en @ 390 | /rooms tab loads ✓ | clean | 10 tiles | — | — |
| staging | teacher | teacher | J07 earnings | en @ 390 | /earnings tab loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T01 follow-up | en @ 390 | /today tab loads ✓ | clean | — | — | — |
| staging | web | visitor | P03 map & results | en @ 390 | results listed, map drawn ✓ | clean | 11 tiles | — | — |
| staging | teacher | teacher | T09 groups | ar @ 1280 | /groups tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P02 search (via Try) | ar @ 390 | Try → parent lands on search ✓ | clean | — | — | — |
| staging | web | owner | C02 location | ar @ 1280 | map drawn, Edit pin opens search ✓ | clean | 12 tiles | — | — |
| staging | web | visitor | P04 centre | en @ 390 | centre map + Google Maps link ✓ | clean | 9 tiles | — | — |
| staging | web | owner | C03 schedule | en @ 1280 | schedule loads ✓ | clean | — | — | — |
| staging | web | visitor | W00 landing | ar @ 1280 | hero + staging banner ✓ | clean | — | — | — |
| staging | teacher | teacher | J01 rooms | ar @ 1280 | /rooms tab loads ✓ | clean | 13 tiles | — | — |
| staging | teacher | teacher | J07 earnings | ar @ 1280 | /earnings tab loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T01 follow-up | ar @ 1280 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P03 map & results | ar @ 390 | results listed, map drawn ✓ | clean | 13 tiles | — | — |
| staging | teacher | teacher | T09 groups | en @ 1280 | /groups tab loads ✓ | clean | — | — | — |
| staging | web | owner | C02 location | en @ 1280 | map drawn, Edit pin opens search ✓ | clean | 11 tiles | — | — |
| staging | web | visitor | P03 map & results | ar @ 1280 | results listed, map drawn ✓ | clean | 13 tiles | — | — |
| public trial | web | owner | C03 schedule (via Try) | ar @ 390 | Try → owner lands on the schedule ✓ | clean | — | — | — |
| staging | teacher | teacher | J01 rooms | en @ 1280 | /rooms tab loads ✓ | clean | 11 tiles | — | — |
| staging | teacher | teacher | J07 earnings | en @ 1280 | /earnings tab loads ✓ | clean | — | — | — |
| staging | teacher | teacher | T01 follow-up | en @ 1280 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P04 centre | ar @ 390 | centre map + Google Maps link ✓ | clean | 10 tiles | — | — |
| public trial | web | parent | P02 search (via Try) | en @ 390 | Try → parent lands on search ✓ | clean | — | — | — |
| staging | web | visitor | P04 centre | ar @ 1280 | centre map + Google Maps link ✓ | clean | 10 tiles | — | — |
| staging | web | visitor | W00 landing | en @ 1280 | hero + staging banner ✓ | clean | — | — | — |
| public trial | web | owner | C02 location | ar @ 390 | map drawn, Edit pin opens search ✓ | clean | 12 tiles | — | — |
| public trial | teacher | teacher | T09 groups (via Try) | ar @ 390 | Try → teacher lands on My groups ✓ | clean | — | — | — |
| public trial | web | owner | C03 schedule (via Try) | en @ 390 | Try → owner lands on the schedule ✓ | clean | — | — | — |
| public trial | web | parent | P03 map & results | en @ 390 | results listed, map drawn ✓ | clean | 11 tiles | — | — |
| staging | web | visitor | P03 map & results | en @ 1280 | results listed, map drawn ✓ | clean | 11 tiles | — | — |
| public trial | teacher | teacher | J01 rooms | ar @ 390 | /rooms tab loads ✓ | clean | 12 tiles | — | — |
| public trial | teacher | teacher | J07 earnings | ar @ 390 | /earnings tab loads ✓ | clean | — | — | — |
| public trial | web | owner | C02 location | en @ 390 | map drawn, Edit pin opens search ✓ | clean | 11 tiles | — | — |
| public trial | teacher | teacher | T01 follow-up | ar @ 390 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | owner | C03 schedule (via Try) | ar @ 1280 | Try → owner lands on the schedule ✓ | clean | — | — | — |
| public trial | teacher | teacher | T09 groups (via Try) | en @ 390 | Try → teacher lands on My groups ✓ | clean | — | — | — |
| staging | web | visitor | P04 centre | en @ 1280 | centre map + Google Maps link ✓ | clean | 9 tiles | — | — |
| public trial | web | parent | P04 centre | en @ 390 | centre map + Google Maps link ✓ | clean | 9 tiles | — | — |
| public trial | web | parent | P02 search (via Try) | ar @ 1280 | Try → parent lands on search ✓ | clean | — | — | — |
| public trial | web | owner | C02 location | ar @ 1280 | map drawn, Edit pin opens search ✓ | clean | 12 tiles | — | — |
| public trial | teacher | teacher | J01 rooms | en @ 390 | /rooms tab loads ✓ | clean | 10 tiles | — | — |
| public trial | teacher | teacher | J07 earnings | en @ 390 | /earnings tab loads ✓ | clean | — | — | — |
| public trial | web | owner | C03 schedule (via Try) | en @ 1280 | Try → owner lands on the schedule ✓ | clean | — | — | — |
| public trial | teacher | teacher | T01 follow-up | en @ 390 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P03 map & results | ar @ 1280 | results listed, map drawn ✓ | clean | 13 tiles | — | — |
| public trial | teacher | teacher | T09 groups (via Try) | ar @ 1280 | Try → teacher lands on My groups ✓ | clean | — | — | — |
| public trial | web | owner | C02 location | en @ 1280 | map drawn, Edit pin opens search ✓ | clean | 11 tiles | — | — |
| public trial | web | parent | P04 centre | ar @ 1280 | centre map + Google Maps link ✓ | clean | 10 tiles | — | — |
| public trial | teacher | teacher | J01 rooms | ar @ 1280 | /rooms tab loads ✓ | clean | 13 tiles | — | — |
| public trial | teacher | teacher | J07 earnings | ar @ 1280 | /earnings tab loads ✓ | clean | — | — | — |
| public trial | teacher | teacher | T01 follow-up | ar @ 1280 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P02 search (via Try) | en @ 1280 | Try → parent lands on search ✓ | clean | — | — | — |
| public trial | teacher | teacher | T09 groups (via Try) | en @ 1280 | Try → teacher lands on My groups ✓ | clean | — | — | — |
| public trial | web | parent | P03 map & results | en @ 1280 | results listed, map drawn ✓ | clean | 11 tiles | — | — |
| public trial | teacher | teacher | J01 rooms | en @ 1280 | /rooms tab loads ✓ | clean | 11 tiles | — | — |
| public trial | teacher | teacher | J07 earnings | en @ 1280 | /earnings tab loads ✓ | clean | — | — | — |
| public trial | teacher | teacher | T01 follow-up | en @ 1280 | /today tab loads ✓ | clean | — | — | — |
| public trial | web | parent | P04 centre | en @ 1280 | centre map + Google Maps link ✓ | clean | 9 tiles | — | — |
