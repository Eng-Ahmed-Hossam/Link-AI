# App map

Every role → app → screen → status: the quickest way to find your way around. Product rules: [PRODUCT_BRIEF](../PRODUCT_BRIEF.md). Screen details and differences from Figma: [screen log](../frontend/screen-log.md). Figma inventory: [docs/11 §7](../11-design-system.md#7-screen-inventory).

One way in: the role chooser at `/{lang}/try` opens each app signed in as a sample user. The connected story across the roles, step by step: [walkthrough](../testing/walkthrough.md) (screens in `docs/frontend/walkthroughs/connected-story/`); what is still sample-only: [sample-only](sample-only.md). One home per role: Parent → Search, Teacher → My groups, Centre owner → Room schedule. "· Follow-up" marks a screen of the paid extra (on in the demo, OD-58). Thumbnails are the Arabic screenshots from the e2e runs. Run the demo with `pnpm demo`; every screen with one-click sign-in is at http://localhost:3000/ar/dev.

**Live / Mock** says what each screen runs on with `pnpm dev` (live mode, the real core-api, Postgres and local fakes — see [RUNNING](../RUNNING.md)). Every screen also runs in mock mode (`pnpm demo`) on sample data. "live" = served by core-api from the database, with sign-in; nothing on it is scripted.

## Visitor: Website (`apps/web`, route group `(site)`)

4 of 4 built.

| ID | Screen | Route | Figma | Status | Live / Mock | Screenshot |
|---|---|---|---|---|---|---|
| W00 | Landing page (copy of Figma) | `/{lang}` | [68:616](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=68-616) | built | static page (no data) | <img src="../frontend/screenshots/landing/W00-landing.ar.desktop.png" width="96" alt=""> |
| W-TRY | Try Link: choose a role (Parent · Teacher · Centre owner) | `/{lang}/try` | — | built | mock only (sample sign-in; not in live) | <img src="../frontend/screenshots/landing/W-TRY.ar.mobile.png" width="96" alt=""> |
| W-PILOT | Request a free pilot | `/{lang}/pilot` | — | built | live (emails the request; no data kept) | <img src="../frontend/screenshots/landing/W-PILOT.ar.mobile.png" width="96" alt=""> |
| W-SIGNIN | Sign in (pilot centres) | `/{lang}/sign-in` | — | built | pilot build only | <img src="../frontend/screenshots/landing/W-SIGNIN.en.mobile.png" width="96" alt=""> |

## Parent: Parent app (`apps/web`, mobile web)

10 of 10 built.

| ID | Screen | Route | Figma | Status | Live / Mock | Screenshot |
|---|---|---|---|---|---|---|
| P01 | Welcome & sign up | `/{lang}/welcome` | [39:260](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=39-260) | built | live | <img src="../frontend/screenshots/batch-1/P01-welcome.ar.png" width="96" alt=""> |
| P02 | Search home | `/{lang}/search` | [39:334](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=39-334) | built | live | <img src="../frontend/screenshots/batch-1/P02-search.ar.png" width="96" alt=""> |
| P03 | Map & results | `/{lang}/search/results` | [40:261](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=40-261) | built | live | <img src="../frontend/screenshots/batch-1/P03-results-map.ar.png" width="96" alt=""> |
| P04 | Centre profile | `/{lang}/centres/[slug]` | [40:374](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=40-374) | built | live | <img src="../frontend/screenshots/batch-1/P04-centre.ar.png" width="96" alt=""> |
| P05 | Teacher profile | `/{lang}/teachers/[slug]` | [42:262](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=42-262) | built | live | <img src="../frontend/screenshots/batch-1/P05-teacher.ar.png" width="96" alt=""> |
| P06 | Choose a group & start date | `/{lang}/teachers/[slug]/reserve` | [42:357](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=42-357) | built | live | <img src="../frontend/screenshots/batch-1/P06-choose.ar.png" width="96" alt=""> |
| P07 | Reserve & pay | `/{lang}/reserve/[id]` | [43:264](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=43-264) | built | live | <img src="../frontend/screenshots/batch-1/P07-pay-monthly.ar.png" width="96" alt=""> |
| P08 | Place reserved | `/{lang}/reserve/[id]/done` | [43:372](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=43-372) | built | live | <img src="../frontend/screenshots/batch-1/P08-reserved.ar.png" width="96" alt=""> |
| P09 | My children (+ approved updates with Follow-up) | `/{lang}/children` | [44:268](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=44-268) | built | live | <img src="../frontend/screenshots/batch-1/P09-children.ar.png" width="96" alt=""> |
| P10 | Leave feedback | `/{lang}/enrolments/[id]/feedback` | [44:362](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=44-362) | built | live | <img src="../frontend/screenshots/batch-1/P10-feedback.ar.png" width="96" alt=""> |

## Teacher: Teacher app (`apps/teacher-app`, Expo)

23 of 23 built.

| ID | Screen | Route | Figma | Status | Live / Mock | Screenshot |
|---|---|---|---|---|---|---|
| T14 | Sign in (phone + code) | `/sign-in` | [23:237](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=23-237) | built | live | <img src="../frontend/screenshots/batch-3/T14.ar.png" width="96" alt=""> |
| J01 | Rooms near you | `/rooms` | [59:358](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=59-358) | built | live | <img src="../frontend/screenshots/batch-3/J01.ar.png" width="96" alt=""> |
| J02 | Request a slot | `/room/[hallId]` | [59:462](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=59-462) | built | live | <img src="../frontend/screenshots/batch-3/J02.ar.png" width="96" alt=""> |
| J03 | My room requests | `/room-requests` | [51:341](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=51-341) | built | live | <img src="../frontend/screenshots/batch-3/J03.ar.png" width="96" alt=""> |
| J04 | My teacher profile | `/profile` | [51:447](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=51-447) | built | live | <img src="../frontend/screenshots/batch-3/J04.ar.png" width="96" alt=""> |
| J05 | My groups & fees (home; one screen with T09) | `/groups` | [60:358](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=60-358) | built | live | <img src="../frontend/screenshots/batch-3/J05.ar.png" width="96" alt=""> |
| J06 | New enrolments | `/enrolments` | [60:452](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=60-452) | built | live | <img src="../frontend/screenshots/batch-3/J06.ar.png" width="96" alt=""> |
| J07 | Earnings | `/earnings` | [61:373](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=61-373) | built | live | <img src="../frontend/screenshots/batch-3/J07.ar.png" width="96" alt=""> |
| T09 | My groups (follow-up parts, with J05) | `/groups` | [18:146](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=18-146) | built | live | <img src="../frontend/screenshots/batch-5/T09.ar.png" width="96" alt=""> |
| T01 | Today (the Follow-up tab) · Follow-up | `/today` | [7:183](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-183) | built | live | <img src="../frontend/screenshots/batch-5/T01.ar.png" width="96" alt=""> |
| T02 | Confirm attendance · Follow-up | `/record/[id]/attendance` | [7:209](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-209) | built | live | <img src="../frontend/screenshots/batch-5/T02.ar.png" width="96" alt=""> |
| T03 | Scores · Follow-up | `/record/[id]/scores` | [7:242](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-242) | built | live | <img src="../frontend/screenshots/batch-5/T03.ar.png" width="96" alt=""> |
| T04 | Observation · Follow-up | `/record/[id]/observation` | [7:272](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-272) | built | live | <img src="../frontend/screenshots/batch-5/T04.ar.png" width="96" alt=""> |
| V01 | Voice note · Follow-up | `/record/[id]/voice` | [34:237](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=34-237) | built | live with ai-service; else "Type the note instead" | <img src="../frontend/screenshots/batch-5/V01.ar.png" width="96" alt=""> |
| V02 | What the AI understood · Follow-up | `/record/[id]/understood` | [34:327](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=34-327) | built | live with ai-service | <img src="../frontend/screenshots/batch-5/V02.ar.png" width="96" alt=""> |
| T07 | Check the student · Follow-up | `/record/[id]/identity` | [8:130](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=8-130) | built | live | <img src="../frontend/screenshots/batch-5/T07.ar.png" width="96" alt=""> |
| T05 | Review before saving · Follow-up | `/record/[id]/review` | [7:294](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-294) | built | live | <img src="../frontend/screenshots/batch-5/T05.ar.png" width="96" alt=""> |
| T06 | Record saved · Follow-up | `/record/[id]/saved` | [7:317](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-317) | built | live | <img src="../frontend/screenshots/batch-5/T06.ar.png" width="96" alt=""> |
| T08 | Save failed · Follow-up | `/record/[id]/failed` | [8:152](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=8-152) | built | live | <img src="../frontend/screenshots/batch-5/T08.ar.png" width="96" alt=""> |
| T10 | Group roster · Follow-up | `/group/[id]` | [19:152](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=19-152) | built | live | <img src="../frontend/screenshots/batch-5/T10.ar.png" width="96" alt=""> |
| T11 | Note about a student · Follow-up | `/student/[id]/note` | [21:152](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=21-152) | built | live | <img src="../frontend/screenshots/batch-5/T11.ar.png" width="96" alt=""> |
| T12 | Student detail · Follow-up | `/student/[id]` | [22:154](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=22-154) | built | live | <img src="../frontend/screenshots/batch-5/T12.ar.png" width="96" alt=""> |
| T13 | Records history · Follow-up | `/group/[id]/history` | [23:156](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=23-156) | built | live | <img src="../frontend/screenshots/batch-5/T13.ar.png" width="96" alt=""> |

## Centre owner / staff: Centre web (`apps/web`, desktop)

26 of 28 built.

| ID | Screen | Route | Figma | Status | Live / Mock | Screenshot |
|---|---|---|---|---|---|---|
| A18 | Owner sign-in (phone + code) | `/{lang}/centre` | [31:233](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=31-233) | built | live | <img src="../frontend/screenshots/batch-2/A18.ar.png" width="96" alt=""> |
| C01 | Add my centre to Link | `/{lang}/add-your-centre` | [45:273](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=45-273) | built | live | <img src="../frontend/screenshots/batch-2/C01.ar.png" width="96" alt=""> |
| C02 | Public profile editor (Edit pin → "Location under review", CF-44) | `…/profile` | [46:274](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=46-274) | built | live | <img src="../frontend/screenshots/batch-2/C02.ar.png" width="96" alt=""> |
| C03 | Room schedule (home) | `/{lang}/centre/[id]/schedule` | [56:375](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=56-375) | built | live | <img src="../frontend/screenshots/batch-2/C03.ar.png" width="96" alt=""> |
| C04 | Reviews & private feedback | `…/reviews` | [48:295](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=48-295) | built | live | <img src="../frontend/screenshots/batch-2/C04.ar.png" width="96" alt=""> |
| C05 | Rooms & rent (+ Add room, CF-44) | `…/rooms` | [57:364](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=57-364) | built | live | <img src="../frontend/screenshots/batch-2/C05.ar.png" width="96" alt=""> |
| C06 | Room requests | `…/requests` | [49:307](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=49-307) | built | live | <img src="../frontend/screenshots/batch-2/C06.ar.png" width="96" alt=""> |
| C07 | Rent income | `…/rent-income` | [58:358](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=58-358) | built | live | <img src="../frontend/screenshots/batch-2/C07.ar.png" width="96" alt=""> |
| C-EXTRA | Follow-up: what's included (centres without the extra) | `…/followup-extra` | — | built | static page (no data) | <img src="../frontend/screenshots/batch-2/C-EXTRA.ar.png" width="96" alt=""> |
| A16 | Staff & access (with marketplace permissions) | `…/staff` | [29:215](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=29-215) | built | live | <img src="../frontend/screenshots/batch-2/A16.ar.png" width="96" alt=""> |
| A01 | Today · Follow-up | `/{lang}/centre/[id]/today` | [5:2](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-2) | built | live | <img src="../frontend/screenshots/batch-6/A01.ar.png" width="96" alt=""> |
| A02 | Follow-ups · Follow-up | `…/follow-ups` | [5:83](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-83) | built | live | <img src="../frontend/screenshots/batch-6/A02.ar.png" width="96" alt=""> |
| A03 | Follow-up case · Follow-up | `…/follow-ups/[caseId]` | [5:153](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-153) | built | live | <img src="../frontend/screenshots/batch-6/A03.ar.png" width="96" alt=""> |
| V06 | Parent replied · Follow-up | `…/follow-ups/[caseId]/reply` | [36:284](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=36-284) | built | live (reply from whatsapp-fake) | <img src="../frontend/screenshots/batch-6/V06.ar.png" width="96" alt=""> |
| A08 | Record outcome · Follow-up | `…/follow-ups/[caseId]/outcome` | [7:47](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-47) | built | live | <img src="../frontend/screenshots/batch-6/A08.ar.png" width="96" alt=""> |
| A10 | Outcome saved · Follow-up | `…/follow-ups/[caseId]/outcome/done` | [7:143](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-143) | built | live | <img src="../frontend/screenshots/batch-6/A10.ar.png" width="96" alt=""> |
| A13 | Students · Follow-up | `…/students` | [25:168](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=25-168) | built | live | <img src="../frontend/screenshots/batch-6/A13.ar.png" width="96" alt=""> |
| A04 | Student profile · Follow-up | `…/students/[studentId]` | [5:229](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-229) | built | live | <img src="../frontend/screenshots/batch-6/A04.ar.png" width="96" alt=""> |
| A05 | Sessions · Follow-up | `…/sessions` | [5:302](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-302) | built | live | <img src="../frontend/screenshots/batch-6/A05.ar.png" width="96" alt=""> |
| A14 | Session record · Follow-up | `…/sessions/[recordId]` | [26:178](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=26-178) | built | live | <img src="../frontend/screenshots/batch-6/A14.ar.png" width="96" alt=""> |
| A11 | Parent messages · Follow-up | `…/communication` | [15:79](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=15-79) | built | live | <img src="../frontend/screenshots/batch-6/A11.ar.png" width="96" alt=""> |
| A06 | Review parent message · Follow-up | `…/messages/[messageId]` | [5:367](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-367) | built | live | <img src="../frontend/screenshots/batch-6/A06.ar.png" width="96" alt=""> |
| A09 | Approved message · Follow-up | `…/messages/[messageId]` | [7:103](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-103) | built | live | <img src="../frontend/screenshots/batch-6/A09.ar.png" width="96" alt=""> |
| A07 | Rules & settings · Follow-up | `…/rules` | [5:423](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-423) | built | live | <img src="../frontend/screenshots/batch-6/A07.ar.png" width="96" alt=""> |
| A17 | Activity history · Follow-up | `…/activity` | [30:230](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=30-230) | built | live | <img src="../frontend/screenshots/batch-6/A17.ar.png" width="96" alt=""> |
| V07 | Ask Link (side panel) · Follow-up | every owner page | [38:250](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=38-250) | built | off in live unless a local LLM (`OLLAMA_URL`); scripted in mock | <img src="../frontend/screenshots/batch-6/V07.ar.png" width="96" alt=""> |
| A15 | Import students | — | [27:197](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=27-197) | blocked (OD-21) | — | — |
| A19 | Centre setup: groups & teachers | — | [32:235](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=32-235) | blocked (OD-21) | — | — |

## Link ops: Ops console (later, PRODUCT_BRIEF §5)

0 of 3 built.

| ID | Screen | Route | Figma | Status | Live / Mock | Screenshot |
|---|---|---|---|---|---|---|
| L01 | Centre join requests & verification | — | [52:344](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=52-344) | later | not built: `pnpm ops:verify-centre` | — |
| L02 | Review moderation | — | [53:355](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=53-355) | later | not built | — |
| L03 | Refunds & disputes | — | [53:445](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=53-445) | later | not built: `pnpm ops:refunds` | — |
