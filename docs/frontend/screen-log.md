# Screen log

One row per screen. Status is `built` or `needs design review`. Screenshots live in `docs/frontend/screenshots/<batch>/` (Arabic and English, every state), and the Figma side-by-sides in `docs/frontend/compare/<ID>.png` (Figma · build EN · build AR).

All Batch 1 screens run on mock data (`packages/mocks`); none calls core-api yet. Phase: all Phase 1. Flags: none, except the items noted.

## Batch 1 · Parent PWA

| Screen | Route | Status | Stories covered | Differs from Figma (CF) | Placeholders | Screenshots |
|---|---|---|---|---|---|---|
| P01 Welcome & sign up | `/{lang}/welcome` (`?mode=sign-in`, `?next=`) | built | MKT-ACC-01 (UI + mock), MKT-ACC-02 | CF-02 (OTP only); CF-21 (parent role copy has no "follow progress"); tile titles white, not blue (11 §1: blue is never text); halo orb drawn on the dark card | Teacher path → "continue in the app" page (Batch 3); owner path → C01 placeholder (Batch 2); language not yet saved to `users.language` (needs `PATCH /v1/me`) | `P01-welcome`, `P01-code`, `P01-code-wrong` |
| P02 Search home | `/{lang}/search` | built | MKT-DSC-01, MKT-ACC-05 | "Sample data" label dropped (the Mock badge does that job); signed-out visitors pick curriculum + year without a child | Area "Maadi, Cairo" is fixed (location picker not designed); covers are token gradients (no photos yet) | `P02-search`, `P02-state-empty/error/offline/slow` |
| P03 Map & results | `/{lang}/search/results` | built | MKT-DSC-02, MKT-DSC-03 | CF-28 ("No seats" vs "Waitlist only"); only distance is on by default (Figma also shows 4★+ on) | `MapView` dev implementation (OD-46): no panning, so MKT-DSC-03 AC2 "move the map to re-search" is not testable yet; sort "best match" = seats open, then distance (OD-29 open) | `P03-results-map`, `P03-results-list`, `P03-state-empty` |
| P04 Centre profile | `/{lang}/centres/[slug]` | built | MKT-DSC-04 (MKT-WEB-02 UI only) | CF-05 ("set by each teacher"); CF-21 (only "Verified by Link" badge); "Illustrative figures" removed; seats shown per session | Not server-rendered for SEO yet (MKT-WEB-02/04 need the real API); cover art | `P04-centre` |
| P05 Teacher profile | `/{lang}/teachers/[slug]` | built | MKT-DSC-05 (MKT-WEB-03 UI only) | CF-22 (fees per group); "% recorded" hidden behind `teacher.recorded_badge` (Phase 2) | As P04 for SEO | `P05-teacher` |
| P06 Choose a group & start date | `/{lang}/teachers/[slug]/reserve` | built | MKT-ENR-01, MKT-ENR-09 (join only) | Seats per session ("2 left" on each date, tightest session named on the group); CF-23 (tip); full group → waitlist, not payment; BR-ENR-09 warning | Waitlist position is mock (3 families ahead); waitlist offer/accept not designed | `P06-choose`, `P06-full-waitlist`, `P06-year-mismatch` |
| P07 Reserve & pay | `/{lang}/reserve/[id]` (draft id before Pay, enrolment id after) | built | MKT-ENR-02, -03 (UI), -04 (UI), -05 (UI), -12 AC3 | CF-06 ("Monthly plan"); three plans (Figma has two); CF-24 (one card method); CF-25 (refund line); consent split: name/year statement + optional phone box, unticked (AC4); AC7 full session named + waitlist; "Prototype — no real charge" removed | Hosted checkout is a local mock page (fake-pay plays this role against core-api); consent version is not stored (needs `consent_events`) | `P07-pay-monthly`, `P07-pay-single-month`, `P07-session-full`, `P07-hold-expired`, `P07-payment-failed` |
| P08 Place reserved | `/{lang}/reserve/[id]/done` | built | MKT-ENR-06, MKT-ENR-04 | "Confirming…" until the mock webhook (BR-MNY-12); Fawry variant with code + 24 h; teacher step only when `reviewEachEnrolment` (OD-08); "Subscription" → "Monthly plan"; Figma's "If you choose Fawry instead" box replaced by the real Fawry state | "Directions" shows the address only (maps provider OD-46); receipt by push/SMS/email is backend (AC3) | `P08-mock-provider`, `P08-confirming`, `P08-reserved`, `P08-awaiting-teacher`, `P08-fawry` |
| P09 My children | `/{lang}/children` | built | MKT-ENR-07, MKT-ENR-08 | Enrolment status and refund status are separate badges; CF-26 ("Message teacher" hidden); "Updates from the centre" feed behind `parent.updates_feed` (Phase 2, built in Batch 6) | Refund-status flow beyond the badge is not designed | `P09-children`, `P09-child-not-enrolled`, `P09-cancelled-refund` |
| P10 Leave feedback | `/{lang}/enrolments/[id]/feedback` | built | MKT-REV-01 | Verified parent after the first session only; CF-27 (one text box for two reviews) | Shared text sent with each review (CF-27) | `P10-feedback`, `P10-thanks`, `P10-not-yet` |
| Mock provider page | `/{lang}/mock-checkout/[paymentId]` | built (dev only) | BR-MNY-06, BR-MNY-12 | Not a Figma screen: stands in for the provider's hosted page; no card fields | Replaced by the provider (or fake-pay) when live | `P08-mock-provider` |
| Account tab | `/{lang}/account` | needs design review | MKT-ACC-03, MKT-ACC-04 (UI) | No Figma frame: language switch + sign out | Profile, children management, consents | — |

## Batch 5 · Teacher app, Phase 2 (follow-up and voice)

Expo (React Native) app, tested on Expo web against the shared mock server (`pnpm demo`). Phase 2: every screen below renders only with the Phase 2 flag (`followup.records`, `followup.voice_notes`; Demo controls switch them together). Data: scenario `demo-followup` (docs/14 §5.1). Screens tested with Playwright on Expo web (`apps/teacher-app/e2e`), pure logic with Vitest; **not yet run on Android** (no SDK on the build machine).

| Screen | Route | Status | Stories covered | Differs from Figma (CF) | Placeholders | Screenshots |
|---|---|---|---|---|---|---|
| T01 / AR01 Today | `/today` (tab) | built | FUP-REC-01 | "Record due" card is the latest session that has taken place; drafts on the device are listed under "Needs you"; storage note "not encrypted — placeholder" | Next-session reminders only from `needs_revisit` observations of the last 2 confirmed records (no rule in docs for which observations) | `T01`, `T01-state-offline` |
| T02 Confirm attendance | `/record/[id]/attendance` | built | FUP-REC-02 | Per-student segmented control (Present · Absent · Late) under the status chip; "Mark remaining present" is an explicit action, never a default | Late minutes optional | `T02` |
| T03 Scores | `/record/[id]/scores` | built | FUP-REC-03 | Series picker added (FUP-REC-03 AC4; not in Figma); every non-absent student gets a field; absent students show "Absent — no score" | "New series" creates a code from the date | `T03`, `T03-over-max.ar` |
| T04 Observation | `/record/[id]/observation` | built | FUP-REC-04, FUP-VOI-01 | Typed note = the group's "next time" note; queued voice notes listed with their status | Per-student typed notes go through ✎ (T11) | `T04` |
| V01 Voice note — recording | `/record/[id]/voice` | built | FUP-VOI-01, FUP-VOI-06 | CF-31 (slide toward the start edge); CF-32 (no live transcript); halo orb at hero size | Microphone permission denied → Settings + "Type the note instead" | `V01`, `V01-recording.ar`, `V01-stt-down.ar` |
| V02 What the AI understood | `/record/[id]/understood` | built | FUP-VOI-03 | Topic tags and "feeds topic scores" removed (CF-07, Phase 3); "Keep — choose the student before confirming" lets an unclear item reach T05 | Audio replay plays the device copy (the mock server keeps no audio) | `V02` |
| T07 Check the student | `/record/[id]/identity` | built | FUP-VOI-04 | Candidates as radio cards, none pre-selected; "Skip this item" discards it | — | `T07` |
| T05 / AR02 Review before saving | `/record/[id]/review` | built | FUP-REC-05 | Shows "not recorded" count and "Missing data is not absence"; open identity items listed with a link to T07 | — | `T05`, `T05-identity-open.ar` |
| T06 / AR03 Record saved | `/record/[id]/saved` | built | FUP-REC-06 | Lists any follow-up the record raised (rule explanation), with "A flag starts a review…" | — | `T06` |
| T08 Save failed | `/record/[id]/failed` | built | FUP-REC-07 | Draft summary on screen; survives a restart | — | `T08` |
| T09 My groups (merged with J05) | `/groups` (tab) | built | FUP-REC-09 AC1 (+ J05 read-only parts) | CF-30 | J05 fee/seat editing is Batch 3 | `T09`, `T09-phase2-off.ar` |
| T10 / AR04 Group roster | `/group/[id]` | built | FUP-REC-09 AC2 | Last 4 sessions as letters + colour (ح/م/غ/–), never colour alone | — | `T10`, `T10-state-empty` |
| T11 / AR05 Note sheet | `/student/[id]/note` (modal) | built | FUP-REC-10 | Topic must be picked (no default); visibility as two radio cards | "Hold to speak" for notes not built (one voice fixture in the mock) | `T11` |
| T12 Student detail | `/student/[id]` | built | FUP-REC-11 | One card per assessment series, text summary before the bars | — | `T12` |
| T13 Records history | `/group/[id]/history` | built | FUP-REC-08 | Per group (reached from My groups), not a tab (CF-29); "Add a correction" sheet | Corrections for attendance and score only | `T13` |

Full-length screenshots leave out the bottom tab bar (react-native-web cannot keep it at the bottom of a grown page); it is there in the app and in the walkthrough captures.

## Batch 6 · Owner web, messages and assistant (Phase 2)

Next.js owner workspace under `/{lang}/centre/{centreId}/…`, tested against the shared mock server (`pnpm demo`) with `pnpm --filter @link/web test:e2e:demo` (18 rule tests, axe in AR and EN on every page, and the cross-app Arabic walkthrough). Phase 2: every page below renders only with the Phase 2 flag (owner nav `followup.owner_nav`); with the marketplace off the nav shows the follow-up items plus Staff (CF-29). A01 is the owner landing page (`/{lang}/centre` → Today). Data: scenario `demo-followup` (docs/14 §5.1). Figma side-by-sides: `docs/frontend/compare/<ID>.png`.

| Screen | Route | Status | Stories covered | Differs from Figma (CF) | Placeholders | Screenshots |
|---|---|---|---|---|---|---|
| A01 / A12 Today | `/centre/[id]/today` | built | FUP-DSH-01, FUP-CAS-05 | CF-38 (only cases from rules that are on); "Missing data is not absence" callout | — | `A01` |
| A02 Follow-ups | `…/follow-ups` | built | FUP-CAS-01 | Filters (Open · Mine · Overdue · Closed); reason with dates and rule version on each row | — | `A02` |
| A03 Follow-up case | `…/follow-ups/[caseId]` | built | FUP-CAS-02, FUP-CAS-04 | CF-37 (status badge, not a stepper); dismiss needs a reason; reopen | Reassigning a case not built | `A03` |
| A06 / V04 Review message | `…/messages/[messageId]` | built | FUP-MSG-01, FUP-MSG-02 | Grounded facts list each source record; tone choice; masked phone; the tick is required; STOP / no opt-in shown before approval | SMS channel shown, not sent (no SMS provider) | `A06` |
| A09 Approved message | `…/messages/[messageId]` (after approval) | built | FUP-MSG-03, BR-APR-11 | Locked; status history only from provider events; "Sending is not solving"; "Change wording (new draft)" | — | `A09` |
| V06 Parent replied | `…/follow-ups/[caseId]/reply` | built | FUP-MSG-05 | CF-33 (nothing pre-ticked) | "Write my own reply" not built (a reply draft comes from confirmed facts, step "Draft a reply") | `V06` |
| A08 Record outcome | `…/follow-ups/[caseId]/outcome` | built | FUP-CAS-03 | "Keep the case open" is the default; "What did you learn?" prefilled from V06 | — | `A08` |
| A10 Outcome saved | `…/follow-ups/[caseId]/outcome/done` | built | FUP-CAS-03 | Confirmation title + Awaiting confirmation status | — | `A10` |
| A11 Parent communication | `…/communication` | built | FUP-MSG-06 | Filters: to review · approved · awaiting a reply · issues (failed, not sendable) | — | `A11` |
| A13 Students | `…/students` | built | FUP-DSH-02 | Search by student or guardian; No guardian filter; attendance as dot + letter | — | `A13` |
| A04 Student | `…/students/[studentId]` | built | FUP-DSH-03 | "Not recorded" shown as such; "More comparable results are needed…" until a series has enough scores | — | `A04` |
| A05 Sessions | `…/sessions` | built | FUP-REC-12 | "Only confirmed records trigger rules" | — | `A05` |
| A14 Session record | `…/sessions/[recordId]` | built | FUP-REC-08, FUP-REC-12 | CF-34 (no "Add a correction" for owners); rules triggered by this record | — | `A14` |
| A07 Rules & settings | `…/rules` | built | FUP-RUL-01, FUP-RUL-02 | Owner saves a new version; Reception proposes and the owner approves or rejects; readable rule text and example | Scope = all groups or one group | `A07` |
| A16 Staff | `…/staff` | built | FUP-STF-01 | Role matrix (incl. "No guardian phone numbers" for teachers); owner-only invite | Invite is recorded, no SMS sent | `A16` |
| A17 Activity history | `…/activity` | built | FUP-DSH-04 | Append-only, "This log can't be edited"; weekly counts; filters by kind | — | `A17` |
| V07 / V03 Ask Link | side panel on every owner page | built | FUP-DSH-05 | CF-35 (side panel); voice through the panel mic | Mock transcription returns one fixture request | `V07` |
| V05 Parent's phone | Storybook only (`Followup/WhatsAppPreview`) | built (illustrative) | — | Illustrative, as in Figma | — | — |
| P09 Updates feed | `/{lang}/children` | built | FUP-MSG-08 | Approved messages only, never drafts; behind `parent.updates_feed`; CF-39 | — | `P09-feed` |

## Concierge pilot mode (OD-50 to OD-57, 2026-10-04)

Pilot builds (`pnpm pilot:build`: `NEXT_PUBLIC_LINK_MODE` / `EXPO_PUBLIC_LINK_MODE=pilot`) served by `apps/pilot` (ADR-0008). Same screens as Batch 5–6, with these differences; everything demo-only (`@demo`: Demo controls, dev panel, MSW, sample sign-in) is aliased to a stub, and the start-up check scans the bundles. Tested by `pnpm --filter @link/pilot test:e2e` (6 tests, axe in AR and EN) on the real pilot builds.

| Screen | Pilot difference | Stories / decisions | Screenshots (`docs/pilot/screenshots`) |
|---|---|---|---|
| Centre sign-in | Pick your name + 6-digit PIN; wrong PIN says tries left; lock after 5 (15 min); teachers sent to the teacher app | OD-50, A3 | `P-sign-in.ar` |
| Owner shell | The centre's own name; "Pilot" badge; no Ask Link; no marketplace items | OD-57, CF-29 | — |
| A06 / A09 Message | Phone "kept by the centre"; approve → "Approved — not sent yet"; **Copy message**; **I sent it from the centre's WhatsApp** → "Approved — sent by hand by <name>"; never Delivered/Read; **Log the guardian's reply** → A08 | OD-56, BR-APR-11 | `A06-review.ar`, `A09-sent-by-hand.ar` |
| A03 Case | "Sent by hand" on the message chip; **Log the guardian's reply** | OD-56 | — |
| A08 Outcome | Method "WhatsApp (sent by hand)"; opens prefilled from "Log the guardian's reply" | FUP-CAS-03 | `A10-awaiting.ar` |
| A13 Students | Guardian column: label + "Phone kept by the centre" | OD-50 | — |
| A14 Session record | **Ask the teacher to correct** (owner; both modes) and the requests' status | CF-34 | `A14-ask-teacher.ar` |
| A16 Staff | People with PIN status; owner adds a person (PIN shown once), sets a new PIN, removes access | A3 | `A16-people.ar`, `A16-people.en` |
| Teacher sign-in | Pick your name + PIN | A3 | — |
| T01 Today | The owner's correction requests (open history, "the record is right — mark done") (both modes) | CF-34 | `T01-today.ar` |
| T04 Observation | "Type the note instead" in place of the voice card (until local STT, Part B) | OD-57 | `T04-type-instead.ar` |
| P09 (demo) | With the marketplace off: only the child's groups at the centre + updates feed | CF-39 | — |

### Part B: real speech-to-text (2026-10-05, ADR-0007)

| Screen | Difference | Stories / decisions | Screenshots |
|---|---|---|---|
| T04 Observation | Pilot: the voice card is back for a teacher whose voice consent is recorded and with `PILOT_VOICE=1`; others keep "Type the note instead" | OD-57, OD-52 | — |
| V01 Processing | "Processing your note on the centre laptop… about N seconds left." (estimate from ai-service, ICU plural) | FUP-VOI-06 | — |
| V01 Failed | After a failure or 3 minutes: "We couldn't process this note" + **Try again** (the kept audio is sent again) + **Type the note instead** | FUP-VOI-06 | — |
| V02 What the AI understood | Real transcript and proposal from local Whisper + rules + LLM (pilot: `consented_real`; demo with "Speech-to-text: local Whisper (real)": `synthetic`) | FUP-VOI-03 | `docs/pilot/screenshots/V02-real-stt.ar` (from the opt-in voice e2e) |
| A16 Staff (pilot) | "Voice consent" column: "Signed" / "Not signed"; the owner presses "Consent signed" or "Withdraw (deletes recordings)" | E15-01, OD-52 | — |
| V07 Ask Link (demo) | With real STT on, the question is transcribed for real; answers stay scripted with a "Demo answer (scripted)" badge. Still hidden in the pilot | OD-57 | — |
| Demo controls (web + teacher dev panel) | Toggle "Speech-to-text: local Whisper (real) \| fixture" | §5.2 docs/14 | — |

### Part C: pilot readiness (2026-10-06)

| Screen | Difference | Stories / decisions | Screenshots |
|---|---|---|---|
| V02 / T07 Who is this? | An unknown (misheard) name blocks like an ambiguous one, with a «مَن هذا الطالب؟» badge. T07 shows its suggestions first («اسم قريب في النطق — تأكّد قبل الاختيار»), then every other student of the group. Nothing is pre-selected or attached | AI-02, FUP-VOI-04 | `batch-5/T07-who-is-this.ar` |
| A16 People (pilot) | **Voice notes** card: whether the laptop has voice, the active profile and its estimate («حوالي … ثانية لملاحظة مدتها دقيقة»), voice off by default, scores always «راجِع», and the owner's **kill switch** («إيقاف الصوت للجميع», with a confirmation). Per teacher: «موقّعة بتاريخ …», then «تشغيل الصوت / إيقاف الصوت», which is disabled until consent | 4.2, OD-52 | `pilot/A16-voice-per-teacher.ar` (from the voice e2e) |
| A06 Parent message (pilot) | The approve button reads «اعتمد (ثم ترسلها أنت)»: the pilot sends nothing itself | OD-56 | — |
| T04 «اكتب الملاحظة بدلًا من ذلك» (pilot) | Body says the owner switches voice on after consent | 4.2 | — |

### Routes, not-found pages and the dev index (2026-10-07)

| Screen | Difference | Stories / decisions | Screenshots |
|---|---|---|---|
| Links without a centre id | `/{lang}/centre/today` (or any centre page without its id) → the centre entry with `?next=` → after sign-in, that page of the person's own centre. `/{lang}/centre/{id}` alone → Today (Staff with Phase 2 off). `/{lang}` → the landing page since 2026-10-07 (pilot: the centre). | Fixes the 404 from the demo's printed link | — |
| Not found (web) | Any unknown path, and an unknown section, shows the app's own page («لم نجد هذه الصفحة» / "We couldn't find this page", "Go to the start") in the URL's language, HTTP 404; no Figma frame, follows the system (card + error state) | 11 §4 | — |
| Unknown centre | An unknown centre id shows «لم نجد هذا المركز» with "Go to my centre", never an empty workspace; no Figma frame | 10 §2 | — |
| Not found (teacher app) | Unknown paths show «لم نجد هذه الصفحة» with a way back to the start; V02 and T07 opened without their voice note go to T04 / T05 instead of waiting forever | — | — |
| C02–C07 (pilot) | The marketplace placeholders are "not found" in the pilot (marketplace off, CF-29) | CF-29 | — |
| Dev index `/{lang}/dev` (demo only) | Every screen of both apps from the route manifest (`apps/web/src/screens.ts`): ID, name, link, modes, status, Figma node; one-click sign-in as the sample owner, Reception, parent and teacher; opens the Demo controls. English only, like the Demo controls. Not built into the pilot (stub + start-up check) | Developer tool | — |

## Launch Stage 1 · The website (2026-10-07)

Next.js pages in `app/[lang]/(site)`, with no app providers (ADR-0009). Built from the Figma landing frame `68:616` (read through the Figma MCP) and the `Link Web / Button` (`69:629`) and `Link Web / FAQ item` (`76:657`) components (`packages/ui/src/components/Web.tsx`). Tests: `apps/web/e2e/landing.spec.ts` (axe AR/EN, desktop and mobile; SEO; path A with no network; the pilot card; path B), and the route crawlers.

| Screen | Route | Status | Differs from Figma | Screenshots |
|---|---|---|---|---|
| W00 Landing page | `/{lang}` | built | **Rebuilt 2026-10-08 as a copy of Figma 68:616** (PRODUCT_BRIEF, OD-48 reversed): the 13 Figma frames in order, every English word from Figma, the UI pictures are Figma's own renders, the icons Figma's SVGs. See "Landing page rebuilt from Figma" below for what differs | `docs/frontend/screenshots/landing/W00-landing.{ar,en}.{desktop,mobile}`, comparisons in `docs/frontend/compare/landing/` |
| Try Link with your centre | `/{lang}/try` | built | No Figma frame; follows the website system (card on the soft background, RadioCards) | `W-TRY.ar.mobile`, `W-TRY-demo.ar.mobile`, `W-TRY-card.ar.mobile` |
| Request a free pilot | `/{lang}/pilot` | built | The Figma "Get started" card, with the fields asked for (centre, name, phone/WhatsApp, area, teachers, consent) | `W-PILOT.ar.mobile`, `W-PILOT-done.ar.mobile` |
| Sign in (pilot centres) | `/{lang}/sign-in` | built | No Figma frame; points to the pilot request until the hosted pilot (Stage 5) | `W-SIGNIN.en.mobile` |
| Demo banner and pilot card | every app page during path A | built | No Figma frame: "Demo — sample data · <centre> · Reset demo"; after two minutes, on Today or Follow-ups only, "Want this for your real centre?" | `W-TRY-card.ar.mobile` |
| Teacher app `/try` | `/try?centre=…&lang=…` | built | Opens Today as the sample teacher under the visitor's centre name, with the same banner | — |

## Landing page rebuilt from Figma (2026-10-08)

The landing page (`/{lang}`) is a copy of Figma frame 68:616, section by section (`docs/frontend/compare/landing/`: Figma | build EN | build AR at 1440, made by `node scripts/landing-compare.mjs`). Desktop 1440 follows Figma; on phones the sections stack in the same order.

**Facts changed for PRODUCT_BRIEF §3 (money, payments, curricula):** none. Every money, payment and curriculum statement in the frame agrees with the brief (free to join; 5–10% of hall rent from centres; a commission on paid bookings from the teacher's fee; parents pay no fee; card, Fawry, mobile wallet; paid extras as a monthly subscription; National, IGCSE, American, Nile).

**Changed after review (Ahmed, 2026-10-08):** "rent rooms by the session" → "rent hall slots" (CF-40); "Create my free account" → "Request free access" (CF-41). The consent tick, the product tabs and the WhatsApp fallback are approved as built.

**Not in the Figma frame, added:**

| What | Why |
|---|---|
| The consent tick in the "Get started" form (section 11) | PDPL: the request is emailed to the Link team (ADR-0009); the server refuses a request without it |
| Arabic version, RTL (layout mirrored; Figma's pictures not mirrored) | Arabic first; Figma has only the English desktop frame |
| Alt text for every Figma picture | Accessibility (axe clean) |
| "Teacher app" and "Parent updates" tab content | Figma draws only "Owner dashboard"; the other tabs show Figma's own phone (V02) and the WhatsApp update card |
| "Message us on WhatsApp" goes to the form until `NEXT_PUBLIC_CONTACT_WHATSAPP` is set; About, Privacy, Terms, Data & consent, LinkedIn and Instagram are text | No number, pages or accounts yet (Figma note 80:691, items 5 and 6) |

**Removed from the old landing:** the follow-up-first copy, the "How a pilot works" section, the separate privacy line under the form (the consent text says what the details are used for) and the empty video slot (not in Figma).

**Performance:** the picture renders are 2x WebP; the icons come from one SVG sprite (`scripts/landing-sprite.mjs`); the hero's pictures appear after load (they fade in on Figma's loop anyway); the product tabs need no JavaScript. Lighthouse mobile on a production build: Arabic 90–91, English 90; accessibility, best practices and SEO 100.


## Step 2A · one connected product (2026-10-08)

Role chooser, centre marketplace screens (Batch 2), teacher marketplace screens (Batch 3) and Follow-up as a paid extra (OD-58). Mock data only: the shared mock server in the demo, MSW on the public site. Screenshots: `docs/frontend/screenshots/batch-2/` (centre, 1440) and `batch-3/` (teacher, 390); Figma side-by-sides in `docs/frontend/compare/<ID>.png` (Figma · EN · AR).

| Screen | Route | Status | Stories covered | Differs from Figma (CF) | Screenshots |
|---|---|---|---|---|---|
| Role chooser | `/{lang}/try` | built | 2A.1 | No Figma frame: three cards (Parent · Teacher · Centre owner); each opens that role's app signed in as a sample user, without resetting the shared story | `W-TRY.ar.mobile` |
| Demo banner | every app page in the demo | built | 2A.6 | "Demo — sample data · Switch role · Reset demo" only; Demo controls only on `/{lang}/dev` | `W-TRY-demo.ar.mobile` |
| A18 Owner sign-in | `/{lang}/centre` | built | MKT-ACC-01 | CF-02 (phone code, no email/password); the left panel says what the marketplace does (Figma's copy was follow-up first); demo shortcuts for the sample owner and Reception under the form | `A18.ar`, `A18.en` |
| C01 Add my centre | `/{lang}/add-your-centre` | built | MKT-CEN-01 | CF-45 | `C01.ar`, `C01.en` |
| C02 Public profile | `/{lang}/centre/{id}/profile` | built | MKT-CEN-02 | CF-44 (no "Edit pin", no "+ Add room"); photos are sample gradients (no uploads in the demo); "Listed" switch per room | `C02.ar`, `C02.en` |
| C03 Room schedule (owner home) | `/{lang}/centre/{id}/schedule` | built | MKT-CEN-04 | The six working days from today, in date order; seats per session ("16 / 20") from the enrolments; Follow-up "Today" card with the extra | `C03.ar`, `C03.en` |
| C04 Reviews | `/{lang}/centre/{id}/reviews` | built | MKT-REV-03 | Reply or report only (BR-REV-06); private feedback takes no public reply; Arabic tab counts in brackets (a middle dot next to «٢» reads as «٠٢») | `C04.ar`, `C04.en` |
| C05 Rooms & rent | `/{lang}/centre/{id}/rooms` | built | MKT-CEN-03, MKT-HAL-05 | CF-43; one rent rule per hall; per-student rule shows the OD-13 note | `C05.ar`, `C05.en` |
| C06 Room requests | `/{lang}/centre/{id}/requests` | built | MKT-HAL-04, MKT-HAL-05 AC2 | "Approve instantly" only when every rule is met (checked from the data); forward only; declining asks for a reason | `C06.ar`, `C06.en` |
| C07 Rent income | `/{lang}/centre/{id}/rent-income` | built | MKT-LED-08 | CF-13 (Link fee and "To you" columns; totals from the rows, not Figma's); next transfer on Thursday (OD-04); side cards under the table below 1536 px | `C07.ar`, `C07.en` |
| A16 Staff (marketplace part) | `/{lang}/centre/{id}/staff` | built | MKT-ACC-06 | Reception invites carry `bookings.manage` / `reviews.reply` (checkboxes, not in Figma); Figma's tabs (Rules · Staff · Guardian contacts · Centre profile) not built | `A16.ar`, `A16.en` |
| What's included (Follow-up) | `/{lang}/centre/{id}/followup-extra` | built | OD-58 | No Figma frame; no prices, "Contact us"; follow-up pages lead here when the centre has no extra | `C-EXTRA.ar`, `C-EXTRA.en` |
| T14 Sign in | `/sign-in` (teacher app) | built | MKT-ACC-01 | CF-50 | `T14.ar`, `T14.en` |
| J01 Rooms near you | `/rooms` | built | MKT-HAL-01 | Filters: group size, distance, days (no "Rent ▾" sort); the map is drawn (no map provider in the demo) | `J01.ar`, `J01.en` |
| J02 Request a slot | `/room/{hallId}` | built | MKT-HAL-02 | Every group listed with where and when it meets, plus "A new group"; the rent estimate's lines come from the server (CF-13) | `J02.ar`, `J02.en` |
| J03 My room requests | `/room-requests` | built | MKT-HAL-03 | CF-46 | `J03.ar`, `J03.en` |
| J04 My profile | `/profile` | built | MKT-TCH-01, MKT-TCH-02 | "Review each enrolment" switch added (OD-08) | `J04.ar`, `J04.en` |
| J05 My groups & fees | `/groups` | built | MKT-GRP-01, MKT-GRP-02 | CF-30 (merged with T09); fees per month and per session (CF-05); seats ≤ the hall; "Open a group" in an approved slot; no "Free trial session" (OD-22, BR-ENR-12) | `J05.ar`, `J05.en` |
| J06 New enrolments | `/enrolments` | built | MKT-ENR-10 | CF-47 | `J06.ar`, `J06.en` |
| J07 Earnings | `/earnings` (tab) | built | MKT-LED-07 | CF-48; one rent line per hall | `J07.ar`, `J07.en` |
| Teacher tabs | — | built | 2A.5, 2A.6 | CF-49 | — |

**Sample data:** Al Nour's Room 1 and Room 3 have 24 and 20 seats (Figma: 20 and 12) so the existing groups' seat caps fit their halls (seats ≤ hall). The demo centre has four halls; the 2B story brief says two (to settle in 2B).

**Strings to review:** the website spells the brand «لينك» and the apps "Link" (the new centre screens follow the apps; C01 is a website page and follows the website).
