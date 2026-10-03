<!--
Frontend plan: the Figma-to-code prompt, kept verbatim as the brief for Batches 1–8.
Decisions taken since it was written win over this text:
- CF-27 (closed): P10 has separate text for the teacher and the centre.
- CF-28 (closed): no "No seats" pin state; "Waitlist only" only (overrides the P02/P03 row in §4).
- Logo (§5 Batch 1): the orb ships as a raster (OD-49); the wordmark is SVG outlines.
- Order: "Demo Day order" (Batch 5 and 6 after Batch 1) is in effect.
-->
# Link: turn every Figma screen into code

This prompt replaces `Link_frontend_phase1_prompt.md`. It covers **every app screen in the Figma file**: Phase 1 (marketplace), Phase 2 (follow-up, voice and assistant) and Phase 3 (analytics). Batch 0 (the foundation) is already done; this prompt starts at Batch 1.

**Where the repo stands:**
- **Frontend foundation:** `packages/tokens`, `ui` (web), `ui-native`, `i18n`, `mocks` and the draft `api-client` exist, and so do the `apps/web`, `apps/ops` and `apps/teacher-app` shells.
- **Local stack:** Postgres, Redis, aws-local, sms-sink, mail-sink and fake-pay all run. dbmate and Kysely are in place (ADR-0006).
- **Part 2 of the dev-environment task:** this covers core-api, the worker, the gateway, ai-service at `apps/ai-service` and the `mock | live` switch. It may or may not be finished when you start, so follow the rules in §3.4.

Read these first:
- `CLAUDE.md`.
- `docs/11-design-system.md`: tokens, components, the RTL rules RTL-01 to RTL-11, and the screen inventory in §7.
- `docs/02` (Phase 1), `docs/03` (Phase 2) and `docs/04` (Phase 3). Each has a **screen → story map**, which tells you what each screen must do.
- `docs/01-business-rules.md` and `docs/13-open-decisions.md` (the CF list runs to CF-20; your next number is CF-21).
- `docs/07-api.md` for data shapes, and `docs/glossary.md` for wording.
- `docs/frontend/token-audit.md`, `docs/frontend/screen-log.md` and ADR-0005.

**Out of scope:**
- **The landing page** (Figma page `68:605`). It is still being designed. Batch 8 covers it, but only when I say so.
- **Screens blocked by OD-21:** A15 and A19.
- **Real providers:** no real payments, SMS, WhatsApp, maps or AI vendors.
- **Backend:** no backend work beyond the mock handlers, except for what §3.4 allows.

Work batch by batch (§5). **Stop after each batch** and report (§7) before you start the next.

---

## 1. Ground rules

1. **The docs win over Figma.** Figma holds sample data and some older decisions. §4 lists every known difference. If you find a new one:
   - log it in `docs/13` Part B as the next CF number;
   - build the docs version;
   - note it in the screen log.
2. **Don't invent business rules.**
   - If a screen needs a rule the docs don't have, use the default in `docs/13`, or build a clearly marked placeholder.
   - List every such case in the batch report.
   - If the gap blocks the screen's main purpose, stop and ask.
3. **Figma is a reference, not code to paste.**
   - Rebuild each screen from `packages/tokens` and the existing components, with flex and grid layouts.
   - Never copy absolute positions, raw hex values or one-off font sizes.
   - If a needed component is missing, add it to `packages/ui` or `ui-native` with a Storybook story first.
4. **Arabic first.**
   - Arabic RTL is the default, and English must be complete.
   - Most frames are English, so build the Arabic version from the RTL rules.
   - Where an Arabic frame exists (AR01–AR05, A12), it is the reference for that screen's Arabic version.
5. **Phases sit behind flags.**
   - Phase 2 and Phase 3 screens and widgets are off by default, through the flag keys in `docs/05` §5 and the seed (paid extras per centre and per teacher, OD-05).
   - A flagged-off item does not render at all: no "coming soon" teasers.
   - A dev-only flag panel turns them on for demos and screenshots.
6. **Sample data only.** Fixtures use fictional people and places (Maadi, "Al Nour"), with Egyptian Arabic names in Arabic fixtures. Never use a real person's data or real voice.
7. **Commits:** small Conventional Commits, one per screen or component. Add a `docs/CHANGELOG.md` line whenever you change a doc.

---

## 2. Reading Figma

- **File:** `3TteHvTvk9JrvUthg2AyE7`.
  - App screens are on page `0:1`.
  - The node IDs are in `docs/11` §7, and copied in §5 below.
- **Tools per screen:**
  - `get_design_context` and `get_screenshot` for the node;
  - `get_metadata` when you need the layer structure;
  - `get_variable_defs` when a value looks off against the tokens.
  - If the Figma MCP isn't connected, ask me for PNG exports.
- **Foundations:**
  - Start here `4:22`, Button `4:6`, Status `4:16`, Operational honesty states `8:166`, Logo `65:385`;
  - Mastery band `85:618`, Definitions `85:619`.
- **Skip** the `Link/Web/*` styles and components. They belong to the landing page.
- **Icons:** use the same set as Figma. If it's a standard pack, install the package; otherwise export the icons as SVG into `packages/ui/icons`. Mirror directional icons in RTL and nothing else (RTL-03).
- **Visual comparison:** for every screen, save the Figma screenshot and our Playwright screenshot at the same width side by side in `docs/frontend/compare/<ID>.png`.
  - Fix differences in spacing, type, colour, radius, elevation and alignment.
  - The only differences left should be the intended ones from §4.

---

## 3. Shared rules for every screen

### 3.1 Formatting and RTL (11 §5)
- **Money:** from piasters with `Intl.NumberFormat`: "EGP 550" in English and "٥٥٠ ج.م" in Arabic, with no `.00`.
- **Digits:**
  - Arabic-Indic digits in the Arabic UI.
  - Phone numbers, reference codes and IDs in Western digits inside `<bdi dir="ltr">`.
  - Inputs accept both digit sets.
- **Dates:** in `Africa/Cairo`.
- **Plurals:** ICU plurals with all six Arabic forms.
- **Names:**
  - Mixed-direction text goes in `<bdi>`.
  - Arabic names may wrap to two lines.
  - Initials avatars use Arabic initials in Arabic.
- **Gestures follow direction too.** "Slide left to cancel" (V01) becomes "slide toward the start edge" in RTL. Log it as a CF.

### 3.2 Accessibility and states
- **Accessibility (NFR-05):** WCAG 2.1 AA; touch targets at least 44 × 44 pt on mobile; status shown as a dot **and** text; never `--color-blue` for text.
- **Checks:** `@axe-core/playwright` runs on **every web page** (parent, public, centre, ops), in both languages, with zero serious or critical violations.
- **States:** every list and form has empty, loading, offline and error states, using the "Operational honesty" copy (11 §4).
- **No prototype banners:** remove any "Prototype — nothing is sent" banner. The Mock badge does that job.

### 3.3 Mock behaviour
| Flow | How it behaves in mock mode |
|---|---|
| OTP | Code `123456`; "Resend in 0:60"; a 5-minute code; 5 tries. |
| Pay | Use the local hosted-checkout page (fake-pay where available), then "Confirming…" until the mock webhook arrives. Include a Fawry variant with a reference code and a 24-hour expiry. **No card field anywhere in Link's UI** (BR-MNY-06). |
| Seat hold | A 10-minute countdown (24 hours for Fawry), plus a "hold expired" state. |
| Voice | Record real audio on the device (or use the web mic in preview). The mock returns a fixed transcript and extraction from fixtures in Egyptian Arabic, with high, medium and low confidence items, one ambiguous name and unmentioned students. |
| Assistant | Replies stream token by token from a mock SSE stream. |
| Messages | Status moves Queued → Sent → Delivered, or → Failed, **only** when the mock "provider" emits an event (BR-APR-11). Include an opted-out guardian and a guardian with SMS consent only. |
| Offline | The voice queue and the record drafts survive an app restart. Use a storage interface. Its dev implementation must be labelled "not encrypted — placeholder". The encrypted implementation is a later story (FUP-VOI-01 AC4); list it in the report. |

### 3.4 Mock vs live
- Every screen must work fully in `mock` mode.
- If the `mock | live` switch from Part 2 exists, wire each screen's hooks through the generated `api-client`. A screen uses `live` only where core-api already has the endpoint.
- **Don't build new backend endpoints in this task.** List the endpoints each batch needs in the report.

### 3.5 Per-screen definition of done
1. Read the screen's stories (screen → story map) and the rules they cite.
2. Fetch the Figma context and screenshot.
3. Build the screen from tokens and components, with fixtures and mock handlers typed from the api-client.
4. Write Arabic and English strings. Add new Arabic strings to `proposed.ar.json` for review.
5. Build every state and the screen's own variants (listed in §4).
6. Make the Playwright screenshots in Arabic and English and the side-by-side comparison, and run axe on web pages.
7. **Write a Playwright test (web) or a Jest/RNTL test (app) for every business rule in §4 that applies to the screen**, not only a screenshot.
8. Pass lint (including the RTL rule), typecheck and `i18n:check`.
9. Add a `docs/frontend/screen-log.md` row: ID, route, phase and flag, status (`built` / `needs design review`), stories covered, differences from Figma with their CF numbers, placeholders, and the screenshot paths.

---

## 4. What to build differently from Figma

### Phase 1
| Screen | Build this (source) |
|---|---|
| P01, T14, A18 | Phone OTP for everyone (CF-02). A18 has **no** email/password form. T14 drops "No account? Your centre admin adds teachers" (CF-03). P01 offers parent, teacher and centre owner. |
| P02, P03 | Child selector (curriculum + school year). Distance filter defaults to ≤ 5 km. Pins can show "No seats" or "Waitlist only". Keep "Ratings come only from parents whose children are enrolled". The map sits behind `MapView` with fixture pins (OD-46). |
| P04 | Fees read "set by each teacher" (CF-05). Trust badges come from Link's data. |
| P05 | The "% recorded" badge is Phase 2 (flag). |
| P06 | Seats left **per session** ("2 seats left on Sat 3 Oct"). A full group shows "Full — join waitlist". A curriculum or year mismatch warns but doesn't block. |
| P07 | "Monthly plan", never "subscription" (CF-06). Monthly plan = card only; single month and per session = card, Fawry or wallet. Booking fee EGP 0. The phone-sharing checkbox is **unticked by default**. Show the refund rule. A full covered session is named, with the waitlist offered. |
| P08 | "Confirming…" until the webhook. Fawry variant. The teacher-confirmation step appears only when `reviewEachEnrolment` is on (off by default, OD-08). |
| P09 | The enrolment status (8 states, 08 §4) and the refund status are shown separately. The "Updates from the centre" feed is Phase 2 (flag). |
| P10 | Verified parent only. Public review or private feedback. Up to 600 characters. Separate centre and teacher ratings. |
| C01 | "Free to list; Link keeps a small fee on rent". The 3-step promise. Hall-count ranges. |
| C02 | Completeness percentage, a live preview, and trust badges that can't be edited. |
| C03 | Week grid Saturday to Thursday. Seats per session ("38 / 40"). The nav label is "Room schedule" (CF-16). |
| C04 | Tabs: public, private, reported. Reply and report only; no delete or hide (BR-REV-06). |
| C05 | One rent rule per hall (fixed per session, per student per session, or % of fees). Open-slot grid. Auto-approve off by default. The per-student basis is open (CF-12 / OD-13): mark it in the UI copy as pending. |
| C06 | Kanban: Requested → Phone call → Meeting → Approved. "Approve instantly" appears only when every auto-approve rule is met. |
| C07 | Link's fee is its own line. The net is computed from fixtures; never the Figma "EGP 7,860" (CF-13). A centre switcher appears for multi-centre owners. |
| Owner side nav | Built as 11 §3 lists it. Phase 1 shows the Marketplace items plus Staff. Today, Follow-ups, Students, Sessions, Parent communication, Rules & settings and Activity history appear only with the Phase 2 flag. |
| A16 | Phase 1: invite staff by phone, with `bookings.manage` and `reviews.reply`; edit; remove. Phase 2 (flag): the full role matrix from 10 §1. Whether teachers see guardian phones is open (CF-11 / OD-25): hide them and mark the item pending. |
| J02 | "You keep ≈". The commission is labelled illustrative (OD-02). Show auto-approve eligibility. |
| J04 | eKYC checklist; the profile is public only after verification; "Open to new teaching slots" switch. |
| J05 | Seat cap ≤ hall capacity; seats filled; per-session and monthly fee; "Offer the monthly plan" toggle. |
| J06 | Default: a read-only "New enrolments" list. Accept and decline appear only when `reviewEachEnrolment` is on. |
| J07 | Parents paid, Link commission (its own line), rent per centre, payout. Next payout on Thursday. The payout account shows only its last digits. |
| L01–L03 | SSO stub. L01: "Approve" unlocks only when every check is done. L02: time left against the 48 h target. L03: an "auto-eligible" tag; approving a refund needs `ops.finance` (mocked). |

### Phase 2 (all behind the follow-up flag)
| Screen | Build this (source: `docs/03`) |
|---|---|
| Teacher tabs | 11 §3 gives Phase 2 tabs (Today · My groups · Records) and marketplace tabs (My groups · Rooms · Earnings). With both on, the combined set isn't decided. Build **Today · My groups · Rooms · Earnings**, with Records reached from My groups and Today, log a CF, and put it in the report as a question. |
| J05 + T09 | One "My groups" screen. The marketplace parts (fees, seats) are always on; the follow-up parts (records complete "6 / 7", open follow-ups, next session) are flagged. Log a CF. |
| T01 / AR01 | "Before your next session" shows reminders from **confirmed** observations only, with their source. "Needs you" lists unconfirmed drafts. |
| T02 | Each student is marked Present, Absent or Late explicitly, with **nothing pre-selected**. Unmarked students stay "Not recorded". "Save draft" is allowed with gaps. ✎ opens the note sheet. |
| T03 | The teacher names the assessment, its maximum and its series. Blank stays blank, and absence never becomes 0. A score above the maximum is **blocked** with the honest-state copy ("24 exceeds the maximum of 20…"), never capped. |
| T04 | Voice or text. Show the tips. Show "Internal teaching notes are not automatically shared with parents". |
| T05 / AR02 | A summary of attendance, scores and observations. An unresolved "Confirm identity" item **blocks** Confirm. Confirm carries an Idempotency-Key (approval 1). |
| T06 / AR03 | "Confirmed by <teacher>", what was saved, a receipt with the time, and how to correct it. |
| T07 | Show the candidates and "Nothing has been saved". The teacher must pick one; there is no default and no guess. |
| T08 | The draft stays on screen and in the offline store. Show "The record is not confirmed. No rules or parent updates have been triggered." A retry reuses the same key. |
| T10 / AR04 | Search; filters (All, Needs attention, Has notes); last 4 sessions per student; latest score; note count; flags. |
| T11 / AR05 | Topics: Understanding, Needs revisit, Behaviour, Positive, Absence context. Up to 500 characters, or hold to speak. Visibility "Teachers & centre admin". "Suggest for a parent update" sends the note to staff, not to the parent. |
| T12 | Trends use **the same assessment series only**. The notes list shows topic, date, author and visibility. |
| T13, A14 | A correction shows field, old value, new value, reason and who made it. The original is kept, and the history is visible. A flag that no longer applies shows "resolved by correction". |
| V01 | Hold to record, release to finish, slide toward the start edge to cancel, with a timer. "Nothing is saved until you review what the AI understood". An offline queue that survives a restart. A "Type the note instead" fallback. |
| V02 | The transcript is a **receipt** ("Kept so you can check and undo. Parents never see it"), and the recording can be replayed. Items are grouped, each with the words it came from, and each accepted or edited one by one. Low-confidence fields are **blank**; medium ones are highlighted "check" (OD-36). Unmentioned students: "Mark N present" or "Leave not recorded", with **no default**. No topic tags (Phase 3, CF-07). |
| A01 / A12, V07 | Cards: follow-ups due and overdue, overdue actions with their owner, missing records ("2 of 8 eligible sessions"), records complete. Lists: "Follow up today" and "Keep the record complete". Show "Missing data is not absence". V07 is the A01 page with the assistant panel open. |
| A02 | Student, reason with dates and rule name, owner and next step, due status. Show "A flag starts a review. It does not predict that a student will leave." |
| A03 | "Why this appeared" (rule, dates, who confirmed), "Rule used", context, timeline. The default assignee and the same-day due date come from the rule. Dismissing needs a reason; the flag stays in history and can be reopened (Foundations states). |
| A04 | Open follow-ups, recent sessions ("Not recorded" shown as such), learning record, internal observation. "More comparable results are needed…" when there's too little data. |
| A05 | Group, teacher, attendance summary, record status (Confirmed, Draft, Not started). "Only confirmed records trigger rules". |
| A06, V03, V04 | The draft uses **confirmed facts only**. "Grounded in records" lists each fact with its source. Tone: Warm, Neutral, Formal. The text is freely editable. The phone is masked. Approval needs the "I checked the student, guardian and dates" tick and the `messages.approve` permission (OD-34). An approved message is locked; editing it creates a new draft. |
| A07 | The four rules, with the parameters, defaults and default on/off from 03 §3 (`score_decline` is the simple comparable rule, not the class-adjusted one, CF-07). Show the plain-words example explanation. Scope per group or all groups. "Rule v1". A staff change is a **proposal** until the owner approves it. |
| A08, A10 | Contact method, result, what you learned, next action, follow-up date. "Keep open until confirmed" is on by default. Show "A contact attempt is not a resolution". After saving: "Contact recorded. Next step set." Status "Awaiting confirmation". |
| A09, A11 | Delivery status comes **only** from the provider event. A guardian who is not opted in, or who has stopped, shows why it can't be sent. The SMS fallback is offered only with SMS consent. Sending logs an attempt, and the case stays open ("Sending is not solving"). |
| A13 | Search by student or guardian. Filters: group, Needs attention, Has notes, No guardian. The latest teacher note is marked internal. Guardian status: Verified / Missing phone. |
| A17 | Filters: All, Records, Messages, Corrections, Access. Grouped by day. "This log can't be edited". Weekly counts. |
| V03, V07 | Text or voice input. The answer streams. The assistant acts as the signed-in user, with tool tiers Read, Draft and Act; Act always needs approval. "Link only drafts. Every message to a parent needs your approval." |
| V05 | **Not an app screen**: it's the parent's own WhatsApp. Build a Storybook-only "WhatsApp preview" of an approved template, for demos. |
| V06 | The reply, a summary and its intent, plus suggested next steps. "Suggestions never close a case on their own." Every suggestion needs a staff action. |
| P09 feed, P05 badge | The feed shows approved messages and updates only. Confirmed attendance in the feed is a per-centre setting, off by default (OD-41). |

### Phase 3 (behind the analytics flag; read `docs/04` first)
| Screen | Build this |
|---|---|
| All | **Mastery band** (`85:618`): Strong, Developing, Needs work, Not enough data. Never red for a student's band. Parents see **only the band**. Heatmap cells show numbers to teachers and owners only. Charts follow the `dataviz` rules: labels and legends on the start side, and each chart has a text summary for screen readers. |
| AN01, AN02 | **Stop and ask before building them.** Whether the time axis runs right to left in Arabic is an open design question (RTL-10). AN01 is the Phase 3 class-adjusted alert (CF-07). |
| AN04 | Marks by voice use the same review pattern as V02: receipt, per-item accept, blanks for low confidence. |
| AN05, AN06 | The teacher approves the focus plan before any parent sees it. The parent view (AN06, in the parent PWA) shows the band and the focus only. |
| AN07 | Owner class analytics on the owner web. Heatmap with numbers (owner view). |

---

## 5. Batches

Default order: Batches 1 → 7. **If I write "Demo Day order", do Batch 5 and Batch 6 right after Batch 1,** then return to 2–4.

### Batch 1: parent PWA (Phase 1, `(parent)` and `(public)`)
Before you start:
- export the logo SVG (`65:385`) into `packages/ui` and replace the text wordmark everywhere;
- confirm Node 24 is the active runtime.

Build order: P01–P05, then P06–P08 (the money flow), then P09–P10.

| ID | Screen | Node | Route |
|---|---|---|---|
| P01 | Welcome & sign up | `39:260` | `/{lang}/welcome` |
| P02 | Search home | `39:334` | `/{lang}/search` |
| P03 | Map & results | `40:261` | `/{lang}/search/results` |
| P04 | Centre profile | `40:374` | `/{lang}/centres/[slug]` |
| P05 | Teacher profile | `42:262` | `/{lang}/teachers/[slug]` |
| P06 | Choose a group & start date | `42:357` | `/{lang}/teachers/[slug]/reserve` |
| P07 | Reserve & pay | `43:264` | `/{lang}/reserve/[enrolmentId]` |
| P08 | Place reserved | `43:372` | `/{lang}/reserve/[enrolmentId]/done` |
| P09 | My children | `44:268` | `/{lang}/children` |
| P10 | Leave feedback | `44:362` | `/{lang}/enrolments/[id]/feedback` |

### Batch 2: centre web (Phase 1, `(centre)`; C01 in `(public)`)
| ID | Screen | Node | Route |
|---|---|---|---|
| A18 | Owner sign-in (OTP) | `31:233` | `/{lang}/centre/sign-in` |
| C01 | Add my centre | `45:273` | `/{lang}/add-your-centre` |
| C02 | Public profile editor | `46:274` | `/{lang}/centre/[centreId]/profile` |
| C03 | Room schedule | `56:375` | `…/schedule` |
| C04 | Reviews & private feedback | `48:295` | `…/reviews` |
| C05 | Rooms & rent | `57:364` | `…/rooms` |
| C06 | Room requests | `49:307` | `…/requests` |
| C07 | Rent income | `58:358` | `…/rent-income` |
| A16 | Staff & access (Phase 1 part) | `29:215` | `…/staff` |

### Batch 3: teacher app (Phase 1, Expo)
Start with the Android check that was left over from Batch 0:
- the app runs on an emulator or Expo Go;
- the Arabic → RTL switch takes effect after a reload;
- Hermes formats `ar-EG` digits and plurals (add the FormatJS polyfills if it doesn't);
- the native mocks work on a real runtime.

| ID | Screen | Node | Tab / route |
|---|---|---|---|
| T14 | Sign in | `23:237` | `/sign-in` |
| J01 | Find a room | `59:358` | Rooms |
| J02 | Request a room slot | `59:462` | Rooms → request |
| J03 | My room requests | `51:341` | Rooms → requests |
| J04 | My teacher profile | `51:447` | Account |
| J05 | My groups & fees | `60:358` | My groups |
| J06 | New enrolments | `60:452` | My groups → enrolments |
| J07 | Earnings | `61:373` | Earnings |

### Batch 4: ops console (Phase 1)
| ID | Screen | Node | Route |
|---|---|---|---|
| L01 | Centre join requests & verification | `52:344` | `/centres` |
| L02 | Review moderation queue | `53:355` | `/reviews` |
| L03 | Refunds & disputes | `53:445` | `/refunds` |

### Batch 5: teacher follow-up and voice (Phase 2, teacher app)
Use the Arabic frames as the reference for each screen's Arabic version: AR01 for T01, AR02 for T05, AR03 for T06, AR04 for T10 and AR05 for T11.

The record flow is a 4-step stepper (T02 → T05), with voice entering at T04 through V01 → V02.

| ID | Screen | Node |
|---|---|---|
| T01 | Today | `7:183` (AR `8:71`) |
| T02 | Confirm attendance | `7:209` |
| T03 | Scores | `7:242` |
| T04 | Observation | `7:272` |
| V01 | Voice note — recording | `34:237` |
| V02 | What the AI understood | `34:327` |
| T05 | Review before saving | `7:294` (AR `8:93`) |
| T06 | Record saved | `7:317` (AR `8:115`) |
| T07 | Clarify student identity | `8:130` |
| T08 | Save failed | `8:152` |
| T09 | My groups (merged with J05) | `18:146` |
| T10 | Group roster | `19:152` (AR `24:166`) |
| T11 | Note sheet | `21:152` (AR `24:309`) |
| T12 | Student detail | `22:154` |
| T13 | Records history | `23:156` |

**Extra report item:** a screen recording (or a numbered screenshot sequence) of the whole flow in Arabic:

1. The teacher records a voice note.
2. They review what the AI understood and resolve one ambiguous name.
3. They confirm the record.
4. They go offline, record again, restart the app, and the queued note uploads.

### Batch 6: owner follow-up, messages and assistant (Phase 2, owner web)
Use A12 (`16:90`) as the reference for A01's Arabic version.

| ID | Screen | Node | Route |
|---|---|---|---|
| A01 | Today | `5:2` (AR `16:90`) | `…/today` |
| V07 | Today with assistant open | `38:250` | panel on `…/today` |
| A02 | Follow-ups list | `5:83` | `…/follow-ups` |
| A03 | Follow-up case | `5:153` | `…/follow-ups/[caseId]` |
| A08 | Record outcome | `7:47` | case → outcome |
| A10 | Outcome recorded | `7:143` | case → outcome done |
| A06 | Review parent message | `5:367` | case → message |
| V03 | Ask Link by voice: draft a message | `35:243` | assistant |
| V04 | Review & approve the message | `35:335` | assistant → approve |
| A09 | Approved message preview | `7:103` | message → sent |
| V06 | Parent replied: next step | `36:284` | case → reply |
| A11 | Parent communication | `15:79` | `…/communication` |
| A04 | Student profile | `5:229` | `…/students/[id]` |
| A13 | Students | `25:168` | `…/students` |
| A05 | Sessions | `5:302` | `…/sessions` |
| A14 | Session record detail | `26:178` | `…/sessions/[id]` |
| A07 | Rules & settings | `5:423` | `…/rules` |
| A16 | Staff & access (Phase 2 role matrix) | `29:215` | `…/staff` |
| A17 | Activity history | `30:230` | `…/activity` |
| P09 feed, P05 badge | Parent-side Phase 2 items | `44:268`, `42:262` | existing routes |
| V05 | WhatsApp preview (Storybook only) | `36:248` | — |

**Extra report item:** the whole follow-up story in Arabic, end to end:

1. A confirmed record with two absences.
2. The flag appears on Today.
3. The case is assigned.
4. The assistant drafts a message.
5. Staff approve it.
6. The mock status reaches Delivered.
7. The parent replies.
8. An outcome is recorded.
9. The case stays open until it is confirmed.

### Batch 7: analytics (Phase 3)
Build the Mastery band component (`85:618`) first.

| ID | Screen | Node | App |
|---|---|---|---|
| AN03 | Topic map | `88:627` | teacher app |
| AN04 | Tag a quiz + marks by voice | `88:764` | teacher app |
| AN05 | Approve weekly focus plan | `89:636` | teacher app |
| AN06 | Parent focus view | `89:724` | parent PWA |
| AN07 | Class analytics | `90:661` | owner web |
| AN01 | Decline alert | `86:605` | teacher app (**ask about RTL-10 first**) |
| AN02 | Student subject report | `86:726` | teacher app (**ask about RTL-10 first**) |

### Batch 8: landing page (only when I say so)
- Figma `68:605`, frame `68:616`. Use the `Link/Web/*` styles and the `Link Web / Button` and `FAQ item` components.
- Apply the Phase 1 copy flags (OD-48, CF-19: "weekly hall slots"). Phase 2–3 sections are hidden by flag.
- The "Get started" form goes to `POST /v1/leads` (mock).

### Not in this task (no design yet)
List these in every report and leave them alone:
- **Teacher:** the rent-shortfall payment, the payout-account form and the eKYC flow screens.
- **Ops:** the verification queue detail, reconciliation, commission rules, reference data, data requests, adjustments and payouts.
- **Parents:** the waitlist offer and accept, the refund-status flow, and guardian WhatsApp opt-in and STOP management.
- **Sessions:** the "Did not take place" action.
- **Blocked by OD-21:** A15 and A19.

---

## 6. Components you will need (add them as their first screen needs them)

### Web (`packages/ui`)
- **Inputs and controls:** select, checkbox, radio, switch, tabs, chip and filter chip, stepper.
- **Overlays:** dialog, toast.
- **Layout and data display:**
  - KPI card;
  - list row with initials avatar;
  - week grid (Taken / Free / Booked);
  - kanban column;
  - timeline (append-only);
  - evidence list ("every claim lists its source");
  - data table with filters;
  - money display;
  - page header.
- **Follow-up and analytics:**
  - assistant side panel with streaming text;
  - message composer with "Grounded in records";
  - Mastery band;
  - chart wrappers (bars against the class average, trend lines, heatmap).

### Native (`packages/ui-native`)
- **Basics:** stepper header, bottom sheet, segmented attendance control (Present, Absent, Late, with no default), score input with max validation, list row, Mastery band.
- **Voice:** record button (hold, release, slide to cancel, timer, level meter); audio player for replay.
- **Review:** review item card (accept / edit / "check" highlight / blank).

Every component gets a Storybook story in Arabic and English (web), or a screenshot test (native).

---

## 7. Report after each batch

1. Screenshots of every screen and state in Arabic and English, plus the `docs/frontend/compare/` side-by-sides.
2. The axe results (web) and the list of rule tests added.
3. The `screen-log.md` rows for the batch.
4. New CF items (from CF-21), placeholders and open questions, each with its doc reference.
5. The endpoints the batch needs, marked live, or mock only (to be built).
6. Which stories in `docs/02`, `docs/03` and `docs/04` (and backlog items in `docs/12`) are covered, fully or as the UI part only.
7. New Arabic strings added to `proposed.ar.json`, with a count.

Then stop and wait.
