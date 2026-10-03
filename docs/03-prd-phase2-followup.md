# 03 · PRD — Phase 2: Paid extras — follow-up

**Goal:** keep students enrolled. Teachers record each session in about a minute (by tap or Egyptian Arabic voice). Readable rules raise flags. Each flag becomes a case with an owner and a due date. Staff-approved WhatsApp messages reach parents.

**Gating:** every Phase 2 feature sits behind a paid-extras feature flag per centre and per teacher (OD-05). Billing is out of scope until OD-05 is decided.

**Trust rules that shape every story** (from [01-business-rules.md](01-business-rules.md) §11):
BR-APR-01 teacher confirms records · BR-APR-02 staff approve messages · BR-APR-04 readable flags · BR-APR-05 transcript is a receipt · BR-APR-07 missing data ≠ absence · BR-APR-08 only confirmed records trigger rules · BR-APR-09 block, never cap · BR-APR-10 an attempt is not a resolution · BR-APR-11 honest delivery status · BR-APR-13 notes are internal.

**Open decisions that block parts of Phase 2:** OD-05 (who pays), OD-21 (offline import), OD-26 (AI vendors and data residency), OD-34 (approver for teacher-only subscribers), OD-36 (confidence thresholds), OD-41 (parent feed).

---

## 1. Session records — `FUP-REC`

### FUP-REC-01 · Teacher Today · T01, AR01
As a teacher, I want to see my next session and what needs me, so that I start prepared.
- AC1: "Before your next session" shows reminders taken **only** from confirmed observations, with the source ("Source: last session's record").
- AC2: Shows the next session's group, time and student count.
- AC3: "Needs you" lists draft records that are not confirmed yet ("Yesterday's record is still a draft").

### FUP-REC-02 · Confirm attendance · T02 (step 1 of 4)
- AC1: Each student must be marked **Present, Absent or Late** explicitly. Nothing is pre-selected.
- AC2: Unmarked students stay "Not recorded" (BR-APR-07). "Save draft" is allowed with gaps.
- AC3: Tapping ✎ next to a student opens the note sheet (FUP-REC-10).

### FUP-REC-03 · Scores (optional) · T03 (step 2 of 4)
- AC1: The teacher names the assessment (e.g. "Sign rules • Practice quiz") and its maximum score.
- AC2: A blank score stays blank. Absence is recorded separately and never turns into a zero.
- AC3: A score above the maximum is blocked with a message (BR-APR-09).
- AC4: The teacher can pick an assessment series so that later results are comparable (used by the score-decline rule).

### FUP-REC-04 · Observation by voice or text · T04 (step 3 of 4)
- AC1: "Record voice note" (FUP-VOI-01) or type a note.
- AC2: Tips: say the student, what happened, and what to revisit next time.
- AC3: Says "Internal teaching notes are not automatically shared with parents" (BR-APR-13).

### FUP-REC-05 · Review before saving · T05, AR02 (step 4 of 4)
- AC1: Summary: attendance counts and exceptions, scores, observations per student.
- AC2: Any item whose student was not clearly matched shows "Confirm identity" and must be resolved first (FUP-VOI-04).
- AC3: "Confirm" sends `POST /v1/session-records/{id}/confirm` with an Idempotency-Key. This is approval 1.

### FUP-REC-06 · Record saved · T06, AR03
- AC1: Shows "Confirmed by <teacher>", what was saved, and a receipt with the time.
- AC2: Says how to correct: "Open the record and add a correction. The original remains in the history."

### FUP-REC-07 · Save failed · T08
- AC1: The draft stays on the screen and in the offline store.
- AC2: Says "The record is not confirmed. No rules or parent updates have been triggered."
- AC3: Retry uses the same Idempotency-Key, so a retry never creates a second record.

### FUP-REC-08 · Corrections · T13, A14
- AC1: A correction names the field, old value, new value, reason and who made it. The original is kept (`corrections` table).
- AC2: The record detail shows the correction history (e.g. "Score changed for Omar Ali 21 → 12. Reason: typing error").
- AC3: A correction re-runs the rules for that student. A flag that no longer applies gets a "resolved by correction" note. It is not deleted.

### FUP-REC-09 · My groups and roster · T09, T10, AR04
- AC1: My groups: per group, the student count, schedule, next session, records complete (e.g. "6 / 7") and open follow-ups.
- AC2: Roster: search; filters (All, Needs attention, Has notes); per student, the last 4 sessions (present / late / absent / none), latest score, note count and flags (e.g. "2 absences in a row").

### FUP-REC-10 · Notes about a student · T11, AR05
- AC1: Topic: Understanding, Needs revisit, Behaviour, Positive, Absence context. Text up to 500 characters, or hold to speak Arabic (reviewed before saving).
- AC2: Visibility: "Teachers & centre admin". Internal. Never sent to parents automatically.
- AC3: "Suggest for a parent update" sends the note to staff, who review and rewrite it before any message (FUP-MSG-01).

### FUP-REC-11 · Student detail for the teacher · T12
- AC1: Attended count, latest score, notes this month, attendance strip.
- AC2: Trends use **only results from the same assessment series** ("Sign rules practice series 10/20, 11/20").
- AC3: The notes list shows topic, date, author and visibility.

### FUP-REC-12 · Sessions and record detail for owners · A05, A14
- AC1: Sessions list: group, teacher, attendance summary, record status (Confirmed, Draft, Not started).
- AC2: Record detail: attendance, scores, observations ("From a voice note • Confirmed by …"), record status timeline (draft created, confirmed), rules triggered by this record, correction history.
- AC3: Says "Only confirmed records trigger rules" (BR-APR-08).

---

## 2. Voice notes — `FUP-VOI`

Pipeline details are in [09-ai-voice-pipeline.md](09-ai-voice-pipeline.md).

### FUP-VOI-01 · Record a voice note · V01
- AC1: Hold to record, release to finish, slide left to cancel. A timer is shown.
- AC2: Tips: who (say the name), what happened (absent, late, score, behaviour), next time.
- AC3: Says "Nothing is saved until you review what the AI understood".
- AC4: **Offline:** recordings go into an encrypted on-device queue and upload when there is a connection. The queue survives an app restart.

### FUP-VOI-02 · Process the note (system)
- AC1: Upload through a signed URL to encrypted storage. Then speech-to-text with roster names as hints, clean-up, roster name match and extraction (strict JSON schema plus confidence).
- AC2: The result is a **draft** only. Nothing becomes a record without FUP-VOI-03.

### FUP-VOI-03 · What the AI understood · V02
- AC1: The transcript is shown to the teacher **as a receipt only**: "Kept so you can check and undo. Parents never see it" (BR-APR-05). The recording can be replayed.
- AC2: Extracted items are grouped (attendance, scores, observation), each with the words it came from (e.g. "مريم غابت النهارده"). Each is accepted or edited one by one.
- AC3: Low-confidence fields are blank; medium-confidence fields are highlighted "check" (OD-36).
- AC4: Students not mentioned: "17 students weren't mentioned." Options: "Mark 17 present" or "Leave not recorded". There is **no** default choice.
- AC5: Observation topic and participation are shown. Topic tags are stored only from Phase 3 (CF-07).

### FUP-VOI-04 · Check the student · T07
- AC1: When a name matches two or more roster students too closely, show the candidates. "Nothing has been saved."
- AC2: The teacher must pick one. Link never guesses.

### FUP-VOI-05 · Retention
- AC1: Audio is deleted 30 days after upload (BR-DAT-04). Transcripts are deleted after the period in OD-28.
- AC2: Deleting audio does not change the confirmed record.

### FUP-VOI-06 · Fallback
- AC1: If speech-to-text is down or too slow, the app offers "Type the note instead". The voice note stays queued.

---

## 3. Rules — `FUP-RUL`

### FUP-RUL-01 · Rules and settings · A07
As a centre owner, I want transparent rules for my centre, so that flags are fair and explainable.

| Rule (`rules.code`) | Parameters (default) | Fires when | Default status |
|---|---|---|---|
| Consecutive absences (`consecutive_absences`) | `n = 2`, groups | The last *n* scheduled sessions, each with a confirmed record, show the student **absent**. A "not recorded" session breaks the streak. | On |
| Comparable score decline (`score_decline`) | `k = 2` scores, `drop = 10` points, `min_scores = 3`, same assessment series | The last *k* comparable scores are each ≥ `drop` points (in %) below the student's own average of earlier scores in the series | Off — "criteria require centre agreement" |
| Low participation (`low_participation`) | `k = 2` of the last `m = 3` sessions | Participation was `low` in *k* of the last *m* confirmed sessions | Off |
| Same concern 3 times (`repeated_concern`) | `count = 3`, note topics `needs_revisit`, `behaviour`, `understanding`; window 30 days | The same note topic was recorded `count` times in the window | Off |

`score_decline` is the simple Phase 2 rule. The class-adjusted rule for AN01 is a different rule, `score_decline_class_adjusted`, and comes in Phase 3 ([04](04-prd-phase3-analytics.md) §4).

- AC1: Each rule shows an example explanation in plain words ("Absent from two consecutive scheduled sessions: 24 and 28 September").
- AC2: Rules apply per group or to all groups.
- AC3: All defaults above are configurable. The rule set is versioned ("Rule v1").

### FUP-RUL-02 · Rule changes need approval
- AC1: Staff can propose a change. It takes effect only after the owner approves it (BR-APR-12).
- AC2: Each version is stored. Each flag records the rule version that raised it.

### FUP-RUL-03 · Evaluate rules (system)
- AC1: The **followup module** evaluates all four rules above. They run on `record.confirmed` and `record.corrected`, plus `quiz.scored` for `score_decline` (the Phase 2 rule) and `note.saved` for `repeated_concern` (a saved teacher note is confirmed input, never an AI draft — BR-APR-08). Drafts never trigger rules. No other component evaluates these rules ([05](05-architecture.md) §4).
- AC2: If the same rule already has an open flag for the same **student, group and topic**, no new flag is raised; new evidence is added to the open one. A flag for the same student in another group (maths and physics), or on another topic, is a separate flag (dedupe key in [06](06-data-model.md) `followup.signals`, INV-08).
- AC3: Each flag stores the readable explanation, the numbers and links to the records (BR-APR-04).

---

## 4. Flags and cases — `FUP-CAS`

### FUP-CAS-01 · Follow-ups list · A02
- AC1: Each item shows student, reason with dates and rule name, owner and next step, and due status.
- AC2: Says "A flag starts a review. It does not predict that a student will leave."

### FUP-CAS-02 · Case detail · A03
- AC1: Shows "Why this appeared" (rule, dates, who confirmed the records), "Rule used" (readable text), context ("No reason for absence has been recorded…") and the activity timeline.
- AC2: Next action: assignee and due date. By default the case goes to the centre's default assignee (e.g. Reception) and is due the same day. Both are configurable per rule.

### FUP-CAS-03 · Record an outcome · A08, A10
- AC1: Fields: contact method (phone call, WhatsApp, meeting), result (guardian reached, no answer, …), what you learned, next action, follow-up date.
- AC2: "Keep open until confirmed" is the default. Says "A contact attempt is not a resolution" (BR-APR-10).
- AC3: After saving: "Contact recorded. Next step set." Status "Awaiting confirmation". The outcome history is shown.

### FUP-CAS-04 · Dismiss and reopen · Foundations "States"
- AC1: Dismissing needs a reason ("Guardian confirmed a planned family trip…"). The flag stays in history and can be reopened (BR-APR-14).
- AC2: Dismissal reasons are counted per rule, to help tune thresholds.

### FUP-CAS-05 · Overdue
- AC1: A case past its due date with no outcome shows as overdue on Today (A01) and in the list.

---

## 5. Parent messages — `FUP-MSG`

### FUP-MSG-01 · Draft a parent message · A06, V03, V04
- AC1: Link drafts in Egyptian Arabic from **confirmed facts only**. Internal notes are left out unless a note was explicitly suggested for sharing and staff reviewed it (BR-APR-13).
- AC2: "Grounded in records" lists every fact used, with its source (e.g. "Attendance • 24 September • Absent • Teacher confirmed").
- AC3: Tone choice: Warm, Neutral, Formal. Staff can edit the text freely.
- AC4: The recipient is the verified guardian contact on file, with the phone masked.

### FUP-MSG-02 · Approve · V04 (approval 2)
- AC1: The approver must tick "I checked the student, guardian and dates".
- AC2: Only users with `messages.approve` can approve (OD-34).
- AC3: An approved message is locked. Changing it needs a new draft and a new approval.

### FUP-MSG-03 · Send on WhatsApp · A09
- AC1: Sent with an approved WhatsApp **utility template** through the messaging gateway.
- AC2: Sent only if the guardian opted in and has not stopped (FUP-MSG-04). Otherwise the approver sees why it cannot be sent.
- AC3: Status shows Queued, Sent, Delivered or Failed **only when the provider reports it** (BR-APR-11).
- AC4: Sending logs a contact attempt on the case. The case stays open (A11: "Sending is not solving").

### FUP-MSG-04 · Opt in and stop
- AC1: The guardian opts in with a recorded consent version and time.
- AC2: Replying "STOP" (or "إيقاف"), or using the in-app switch, stops messages at once (BR-DAT-02).

### FUP-MSG-05 · Replies and triage · V05, V06
- AC1: An inbound reply arrives through a signed webhook and is linked to the case.
- AC2: Link shows the reply, a short summary and its intent (e.g. "Timetable clash on Wednesdays"). It also suggests next steps (record outcome, check a seat, draft a reply).
- AC3: Says "Suggestions never close a case on their own". Every suggestion needs a staff action.

### FUP-MSG-06 · Parent communication log · A11
- AC1: Lists reviewed messages linked to follow-ups: student, purpose, status, owner and next step.

### FUP-MSG-07 · Fallback
- AC1: If WhatsApp is down, an approved message can go by SMS — but only if the guardian agreed to SMS. Otherwise it waits and the approver is told.

### FUP-MSG-08 · Parent app updates · P09
- AC1: Shows approved messages and approved updates only. Showing confirmed attendance in the parent feed is a per-centre setting, off by default. (default · OD-41)

---

## 6. Owner dashboard and Ask Link — `FUP-DSH`

### FUP-DSH-01 · Today · A01, A12 (Arabic)
- AC1: Cards: follow-ups due (and overdue), overdue actions with their owner, missing session records ("2 of 8 eligible sessions"), records complete ("6 / 8, confirmed by teachers").
- AC2: "Follow up today" list, and "Keep the record complete" list.
- AC3: Says "Missing data is not absence" (BR-APR-07).

### FUP-DSH-02 · Students · A13
- AC1: Search by student or guardian. Filters: group, Needs attention, Has notes, No guardian.
- AC2: Columns: student and ID, group, last 4 sessions, latest score, follow-up, latest teacher note (marked internal), guardian status (Verified / Missing phone).

### FUP-DSH-03 · Student profile · A04
- AC1: Open follow-ups, recent sessions ("Not recorded" shown as such), learning record, internal observation.
- AC2: Says "More comparable results are needed before showing a decline" when there are not enough results.

### FUP-DSH-04 · Activity history · A17
- AC1: Filters: All, Records, Messages, Corrections, Access. Grouped by day, with actor and detail.
- AC2: Says "This log can't be edited". Entries are append-only (BR-APR-06).
- AC3: Weekly counts: records confirmed, follow-ups opened, outcomes recorded, corrections.

### FUP-DSH-05 · Ask Link assistant · V03, V07
- AC1: Text or Arabic voice. Answers stream over SSE.
- AC2: The assistant acts **as the signed-in user**, with that user's permissions only. Tool tiers: Read, Draft, Act — and Act always needs approval.
- AC3: Example tasks: "Who hasn't been contacted this week?", "Summarise Secondary 2 · Maths", "Which records are missing?", "Send Mariam's guardian a note that she missed two sessions" (this produces a draft for FUP-MSG-02).
- AC4: Says "Link only drafts. Every message to a parent needs your approval."

---

## 7. Staff and access — `FUP-STF`

### FUP-STF-01 · Staff and access · A16
- AC1: Roles and permissions follow the matrix in [10-security-privacy.md](10-security-privacy.md) §1: owner (full access, rules, staff), admin/reception (follow-ups, messages, all students read), teacher (own groups only).
- AC2: Lists staff with role, scope and last active time. Inviting by phone sends an SMS invite.

---

## 8. Onboarding offline students — `FUP-ONB` (blocked by OD-21)

### FUP-ONB-01 · Centre setup: groups and teachers · A19
### FUP-ONB-02 · Import students and guardians · A15
- Blocked by OD-21. These screens come from the older centre-subscription model. If the decision is to build them: validate every row (duplicate names, missing guardian phone, unknown group), import only the fields Link needs, and record guardian consent.

---

## 9. Screen → story map

| Screen | Stories |
|---|---|
| T01 Today, AR01 | FUP-REC-01 |
| T02 Confirm attendance | FUP-REC-02 |
| T03 Scores | FUP-REC-03 |
| T04 Observation | FUP-REC-04, FUP-VOI-01 |
| T05 Review, AR02 | FUP-REC-05 |
| T06 Saved, AR03 | FUP-REC-06 |
| T07 Clarify identity | FUP-VOI-04 |
| T08 Save failed | FUP-REC-07 |
| T09 My groups | FUP-REC-09 |
| T10 Roster, AR04 | FUP-REC-09 |
| T11 Note sheet, AR05 | FUP-REC-10 |
| T12 Student detail | FUP-REC-11 |
| T13 Records history | FUP-REC-08 |
| V01 Recording | FUP-VOI-01 |
| V02 What the AI understood | FUP-VOI-03 |
| V03 Ask Link by voice | FUP-DSH-05, FUP-MSG-01 |
| V04 Review & approve | FUP-MSG-01, FUP-MSG-02 |
| V05 Parent's phone | FUP-MSG-03 (illustrative) |
| V06 Parent replied | FUP-MSG-05 |
| V07 Assistant panel | FUP-DSH-05 |
| A01 Today, A12 (AR) | FUP-DSH-01 |
| A02 Follow-ups list | FUP-CAS-01 |
| A03 Follow-up case | FUP-CAS-02 |
| A04 Student profile | FUP-DSH-03 |
| A05 Sessions | FUP-REC-12 |
| A06 Review parent message | FUP-MSG-01 |
| A07 Rules & settings | FUP-RUL-01, FUP-RUL-02 |
| A08 Record outcome | FUP-CAS-03 |
| A09 Approved message preview | FUP-MSG-03 |
| A10 Outcome recorded | FUP-CAS-03 |
| A11 Parent communication | FUP-MSG-06 |
| A13 Students | FUP-DSH-02 |
| A14 Session record detail | FUP-REC-08, FUP-REC-12 |
| A15 Import students | FUP-ONB-02 (blocked) |
| A16 Staff & access | FUP-STF-01 |
| A17 Activity history | FUP-DSH-04 |
| A19 Centre setup | FUP-ONB-01 (blocked) |
| P09 Updates feed | FUP-MSG-08 |
