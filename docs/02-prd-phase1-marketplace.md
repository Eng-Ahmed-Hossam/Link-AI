# 02 · PRD — Phase 1: Marketplace and payments

**Goal:** parents find, reserve and pay for a teacher's group. Teachers rent halls and get paid. Centres fill halls and get rent. Every payment goes through Link, and Link takes its fees from that money.

**Out of scope for Phase 1:** session records, voice notes, rules, cases, parent WhatsApp messages and analytics (Phases 2–3). Paid-extras billing (OD-05). Importing offline students (OD-21). Free trials (OD-22).

Screen IDs refer to the Figma file (see the inventory in [11-design-system.md](11-design-system.md)). Business rules (`BR-…`) are in [01-business-rules.md](01-business-rules.md).

**Story format:** ID · title · screens · rules → user story → acceptance criteria (AC).

### Stories by actor

| Actor | Stories |
|---|---|
| **Parent** | MKT-ACC-01…05 · MKT-DSC-01…05 · MKT-ENR-01…09 · MKT-REV-01 · MKT-NTF-02 · MKT-WEB-02/03 (as visitor) |
| **Teacher** | MKT-ACC-01…04 · MKT-TCH-01…03 · MKT-HAL-01…03, MKT-HAL-06 · MKT-GRP-01…04 · MKT-ENR-10 · MKT-LED-04, MKT-LED-07 · MKT-REV-03 · MKT-NTF-02 |
| **Centre** (owner + staff) | MKT-ACC-01…04, MKT-ACC-06 · MKT-CEN-01…05 · MKT-HAL-04…06 · MKT-GRP-03 (mark not held) · MKT-LED-08 · MKT-REV-03 |
| **Link ops** | MKT-OPS-01…11 |
| **System** (jobs, webhooks) | MKT-ENR-11, MKT-ENR-12 · MKT-LED-01…03, MKT-LED-05, MKT-LED-06 · MKT-REV-02 · MKT-NTF-01 · MKT-WEB-01, MKT-WEB-04 |

---

## 1. Accounts — `MKT-ACC`

### MKT-ACC-01 · Sign in with phone OTP · P01, T14, A18
As any user, I want to sign in with my mobile number and a code, so that I don't need a password.
- AC1: The user enters an Egyptian mobile number (+20). Link sends a **6-digit** code by SMS.
- AC2: A code is valid for 5 minutes and allows at most 5 tries. A new code can be requested after 60 s ("Resend in 0:42", T14).
- AC3: Requests are rate-limited per phone and per IP. Too many requests return a clear wait message.
- AC4: A correct code returns an access token and a refresh token. A wrong code shows a message and how many tries are left.
- AC5: Owners use the same OTP flow. A18's email + password form is **not** built (CF-02).
- AC6: The code is never logged or stored in plain text.

### MKT-ACC-02 · Choose my role · P01
As a new user, I want to say whether I am a parent, a teacher or a centre owner, so that Link shows the right app.
- AC1: P01 offers "A parent", "A teacher" and "A centre owner".
- AC2: One user can hold several roles (e.g. a teacher who is also a parent). The app lets them switch.
- AC3: "Centre owner" leads to the join request (MKT-CEN-01). The centre is not live until ops verify it.
- AC4: "Teacher" leads to the teacher profile (MKT-TCH-01). Teachers join free and do not need a centre invite (CF-03).

### MKT-ACC-03 · Arabic or English · all screens
As a user, I want Link in Arabic or English, so that I can read it comfortably.
- AC1: Arabic is the default, shown right-to-left. English is complete, shown left-to-right.
- AC2: A language switch is visible on every screen ("العربية / EN"). The choice is saved to `users.language`.
- AC3: Numbers and dates follow the language. Arabic uses Arabic-Indic digits, as in the AR screens.

### MKT-ACC-04 · Sessions and sign-out
- AC1: Access tokens last 15 minutes. Refresh tokens last 30 days and rotate on each use. A reused refresh token signs out that device.
- AC2: "Sign out" revokes the refresh token at once.

### MKT-ACC-05 · Add my children · P02, P06
As a parent, I want to add each child with their curriculum and school year, so that search shows the right groups.
- AC1: A child needs a name, curriculum and school year (reference data, OD-07). Nothing else is required.
- AC2: A parent can add, edit and remove children. Removing a child with a live enrolment is blocked.
- AC3: Search defaults to the selected child ("For Mariam • National • Secondary 2", P02).

### MKT-ACC-06 · Centre staff · A16 (Phase 1 subset)
As a centre owner, I want to invite staff by phone number, so that reception can handle hall requests.
- AC1: The owner invites by phone and picks a role: `centre_staff`, with permissions (`bookings.manage`, `reviews.reply`).
- AC2: An invited user signs in with OTP and sees only that centre.
- AC3: The owner can remove staff. Access ends at once (sessions revoked, permission cache cleared).
- AC4: The owner can change a staff member's permissions (`PATCH /v1/centres/{id}/staff/{userId}`). The change takes effect at once (permission cache cleared) and is audited.

---

## 2. Teachers — `MKT-TCH`

### MKT-TCH-01 · My teacher profile · J04, P05
As a teacher, I want a public profile, so that centres and parents can find and trust me.
- AC1: The profile has name, photo, bio, subjects (curriculum + school year), years of experience and weekly availability.
- AC2: Shows rating and review count from verified parents only (BR-REV-07).
- AC3: An "Open to new teaching slots" switch lets centres see the profile in their hiring view.
- AC4: The profile is public only after eKYC passes (BR-VER-03). Before that, the teacher sees a checklist.

### MKT-TCH-02 · Identity verification (eKYC) · J04, L01
- AC1: The teacher starts eKYC in the app. It uses the eKYC provider through our adapter; manual review by ops is the fallback.
- AC2: Statuses: `not_started → pending → verified | rejected`. A rejection shows the reason and a retry link.
- AC3: Degree and references are optional uploads. Ops verify them, and each shows as a badge (BR-VER-04).
- AC4: ID images go to encrypted storage and are reachable only through signed URLs. Ops can see them only in the ops console.

### MKT-TCH-03 · Payout account · J07
- AC1: The teacher adds a bank account (IBAN) or a mobile wallet number.
- AC2: The account details are encrypted at rest. The UI shows only the last 4 digits.
- AC3: Changing the account re-verifies it and pauses payouts until it passes. The change is written to the audit log.

---

## 3. Centres — `MKT-CEN`

### MKT-CEN-01 · Add my centre to Link · C01
As a centre owner, I want to ask to join, so that parents can find my centre.
- AC1: The form has centre name, governorate, area, address, map pin, subjects taught, hall-count range (1–3, 4–8, 9+), owner name and mobile.
- AC2: Shows the steps: "We call you within 2 working days → We verify (visit or video call) → You go live on the map".
- AC3: The request creates a centre with `verification = pending`. It is not visible publicly.
- AC4: The page says the centre is free to list and that Link keeps a small fee on rent.

### MKT-CEN-02 · Public profile editor · C02
- AC1: The owner edits photos, the "about" text, location pin, hours and closed days. A live preview shows what parents see.
- AC2: Shows profile completeness (e.g. "80% complete").
- AC3: Trust badges are computed by Link, not edited (BR-VER-05).
- AC4: Changes go live at once on verified centres and purge the CDN cache (`profile.updated`).

### MKT-CEN-03 · Halls, rent and open slots · C05
As a centre owner, I want to list my halls with rent and free slots, so that teachers can rent them.
- AC1: Each hall has name, seats, facilities (AC, smart board, projector, sound, whiteboard, wheelchair access, fan) and one rent rule: fixed per session, per student per session, or % of fees (BR-RNT-01).
- AC2: The owner marks open weekly slots on a grid (day × hour). Taken slots show as "Taken". A hall or slot can be hidden.
- AC3: Changing the rent rule never changes live bookings (they keep their snapshot, BR-BKG-05).
- AC4: Shows counts: halls, open requests and teachers renting.

### MKT-CEN-04 · Hall schedule · C03
- AC1: A week grid (Sat–Thu by default, from the centre's hours) shows per hall: teaching (with teacher, subject, seats filled e.g. "38 / 40" and rent rule), booked-not-started, and free to rent.
- AC2: Shows: halls used this week (%), free slots to rent, average seats filled (%), teachers renting.
- AC3: A free slot links to "List for rent".

### MKT-CEN-05 · Centre payout account
- AC1: Same as MKT-TCH-03, for the centre. Only the owner of that centre can change it.
- AC2: Each centre has its own payout account (`GET`/`PUT /v1/centres/{id}/payout-account`). An owner of several centres sets one per centre; `/v1/me/payout-account` is for teachers only.

---

## 4. Hall booking — `MKT-HAL`

### MKT-HAL-01 · Find a hall · J01
As a teacher, I want to find free halls near me that fit my group, so that I can start teaching there.
- AC1: Filters: expected students, days/time, distance (e.g. ≤ 8 km), rent and facilities.
- AC2: Map with centre pins ("Al Nour • 3 free rooms") and a list. Each result shows hall, seats, facilities, centre, distance, the free slot, the rent rule and a monthly rent estimate for the expected students.
- AC3: Only verified centres and listed slots appear.

### MKT-HAL-02 · Request a slot, with rent estimate · J02
- AC1: The teacher picks a planned group (subject + curriculum + year, expected students, fee) and one or more free slots, plus a start date.
- AC2: The rent estimate shows: fees × students, minus rent, minus Link commission, = "You keep ≈". The commission is labelled illustrative until OD-02 is decided.
- AC3: If the centre's auto-approve rules are on, the screen says whether the teacher meets them (ID verified, rating, fit).
- AC4: Sending creates a request with status `requested` (BR-BKG-02). The request is idempotent, so a double tap never makes two requests.

### MKT-HAL-03 · My hall requests · J03
- AC1: Lists requests with stage: requested → phone call → meeting → decision, plus any scheduled call time ("Al Nour will call you Thu 2:00 PM").
- AC2: Shows outcomes: approved, waiting, or "slot taken by another teacher".
- AC3: The teacher can withdraw before approval.

### MKT-HAL-04 · Request pipeline for centres · C06
As a centre owner or staff with `bookings.manage`, I want to see hall requests as a pipeline, so that I can review, call, meet and approve.
- AC1: Columns: Requested, Phone call, Meeting at centre, Approved. Each card shows teacher, rating, verification, subject/year, hall, slot and expected students.
- AC2: Actions: call, message, move to the next stage, approve, decline (with a reason).
- AC3: Approving creates a room booking with the rent rule snapshot. It fails with a clear error if the slot was taken in the meantime (BR-BKG-05).
- AC4: Every stage change notifies the teacher and is audited.

### MKT-HAL-05 · Auto-approve hall requests · C05, C06
- AC1: Off by default. When on, a request that meets every rule is approved at once (BR-BKG-04, OD-38).
- AC2: "Approve instantly" shows only when every rule is met (C06).

### MKT-HAL-06 · End a booking
- AC1: Either side can end a booking. It ends at the end of the current rent period (BR-BKG-06).
- AC2: Groups on that booking are closed at the end date. Affected parents are told, and refunds for undelivered sessions follow BR-REF-04.

---

## 5. Groups — `MKT-GRP`

### MKT-GRP-01 · Create a group · J05
As a teacher, I want to create a group in my booked slot with fees and seats, so that parents can reserve.
- AC1: Fields: subject (curriculum + school year), room booking (hall + weekly slot), seat cap, monthly fee, per-session fee, and whether the monthly recurring plan is offered.
- AC2: Seat cap ≤ hall capacity (BR-ENR-03). Fees > 0.
- AC3: The group is visible in search only when the teacher is verified, the booking is live and the start date is set.
- AC4: The screen shows seats filled ("22 / 30") and fees as parents see them.

### MKT-GRP-02 · Edit a group
- AC1: Fee changes apply to new reservations only. Existing plans keep their price. (default · OD-39)
- AC2: The seat cap cannot go below the **most seats used in any future session** (committed enrolments, live holds and waitlist offers, counted per session — BR-ENR-02). The error names that session.

### MKT-GRP-03 · Session calendar
- AC1: Sessions are generated from the booking's weekly slot, from the start date to the booking end.
- AC2: The teacher can cancel a single session in advance, with a reason. Enrolled parents are notified. A cancelled session is not charged as rent (BR-RNT-04).
- AC3: A session that was not cancelled becomes `held` automatically at its end time. Until that month's rent invoice is issued, the teacher or the centre (`bookings.manage`) can mark it "did not take place" with a reason (`POST /v1/sessions/{id}/not-held`). The change is audited, both sides are notified, and the session is not charged (BR-RNT-10, OD-44).
- AC4: Seats are shown per session ("2 seats left on Sat 3 Oct"), because seat use is counted per session (BR-ENR-02).

### MKT-GRP-04 · Close a group
- AC1: Closing stops new reservations. Live plans are cancelled at the end of their paid period. Refunds follow BR-REF-04.

---

## 6. Discovery — `MKT-DSC`

### MKT-DSC-01 · Search home · P02
As a parent, I want to say what my child needs help with, so that I see suitable teachers and centres nearby.
- AC1: Shows the child selector (curriculum + year), a search box (subject, centre or teacher), subject chips, "centres near you" and "top-rated teachers".
- AC2: Each centre card shows rating, review count, area, distance, teacher count for the subject and the lowest fee ("from EGP 150/session").
- AC3: Says "Ratings come only from parents whose children are enrolled".

### MKT-DSC-02 · Filter results · P03
- AC1: Filters: curriculum, school year, subject, distance (default ≤ 5 km), rating (4★+), fee range, seats open, verified.
- AC2: Sort by best match (OD-29), distance, rating or fee.
- AC3: Shows the total ("12 centres • 31 Maths teachers within 5 km").

### MKT-DSC-03 · Map and list · P03
- AC1: Toggle between map and list. Pins show the teacher count, or "Waitlist only" when every matching group is full (BR-ENR-10: a full group always accepts a waitlist). There is no "No seats" state; a centre with no matching group does not appear in the results (CF-28).
- AC2: Moving the map re-runs the search for the new area.

### MKT-DSC-04 · Centre page · P04
- AC1: Shows the "Verified by Link" badge, name, area, distance, hours, rating, trust badges, and tabs: Overview, Teachers, Timetable, Reviews.
- AC2: Lists subjects with curricula and years ("Maths • National Sec 1–3", "Physics • IGCSE Y10–11").
- AC3: Lists the groups for the parent's child with teacher, time, hall, seats left and fee.
- AC4: Fees show as "set by each teacher" (CF-05).

### MKT-DSC-05 · Teacher page · P05
- AC1: Shows name, subjects and curricula, years teaching, rating, centre count, "% recorded" (Phase 2 badge; hidden until then), and "What parents mention most" tag counts.
- AC2: Shows fees per group (per session and per month) and where the teacher teaches, with seats left.
- AC3: Shows reviews with the teacher's public replies.

---

## 7. Reservation and payment — `MKT-ENR`

### MKT-ENR-01 · Choose a group and first session · P06
- AC1: Lists the teacher's groups for the child's subject and year, with time, hall, seats left and monthly fee. A full group shows "Full — join waitlist".
- AC2: The parent picks the first session date from the next sessions.
- AC3: A mismatch between the child's year and the group's shows a warning (BR-ENR-09).

### MKT-ENR-02 · Hold the seat and check out · P07
As a parent, I want to reserve and pay securely, so that my child's place is guaranteed.
- AC1: Plans offered: monthly plan, renewing (card), "Pay for <month> only" (card, Fawry or wallet), per session (any method) (BR-PMT-03).
- AC2: Choosing a plan shows only the methods allowed for it. Parent copy: "Monthly plans can only be paid by card" (OD-10). The word "subscription" is reserved for paid extras (glossary); P07's "Monthly subscription" label becomes "Monthly plan" (CF-06).
- AC3: A summary shows the teacher's fee, booking fee EGP 0 and the total. It says "No extra fees for parents".
- AC4: The screen explains that the child's name and school year go to the teacher and the centre's front desk, because the service needs them. A separate checkbox, **unticked by default**, asks to share the parent's phone too (BR-ENR-07, OD-25). The consent version is stored (BR-DAT-03). P07 shows this box ticked; a pre-ticked box is not valid consent.
- AC5: It shows the refund rule: "Full refund if you cancel before the first session".
- AC6: Pressing Pay calls `POST /v1/enrolments` with an Idempotency-Key. That holds a seat in **every session the plan covers** (10 min for card and wallet; BR-ENR-01, BR-ENR-13), then redirects to hosted checkout.
- AC7: If any covered session is full, say which one and show the waitlist offer instead (BR-ENR-02, BR-ENR-10).

### MKT-ENR-03 · Pay by card, including the monthly plan
- AC1: The card is entered only on the provider's hosted page (BR-MNY-06).
- AC2: For the monthly plan, the provider saves a card token. Link stores only the token reference (`payment_mandates`).
- AC3: The browser redirect after paying shows "Confirming…". The status changes only when the signed webhook arrives (BR-MNY-12).

### MKT-ENR-04 · Pay with Fawry · P08
- AC1: The parent gets a Fawry reference code and an expiry time (24 h, OD-09). They can copy and share it.
- AC2: The seat stays held until the code expires. Then the enrolment becomes `expired` and the parent is notified.
- AC3: A payment that arrives after expiry follows BR-ENR-06. If it cannot be matched, it goes to ops (MKT-OPS-05).

### MKT-ENR-05 · Pay with a mobile wallet
- AC1: Same as card, through the provider's wallet flow. Single month and per session only.

### MKT-ENR-06 · Confirmation and receipt · P08
- AC1: "Place reserved!" shows the reference (e.g. `LNK-20931`), amount, payee teacher, method (last 4 digits), and renewal date with a cancel option.
- AC2: "What happens next" shows: payment received, details shared with the teacher (if consent was given), the teacher's confirmation if OD-08 applies, and the first session date and address.
- AC3: A receipt is sent by push, SMS or email.

### MKT-ENR-07 · My children: enrolments and plans · P09
- AC1: Per child: teacher, subject, centre, hall, schedule, next session, plan status and renewal date.
- AC2: "Manage" lets the parent cancel the recurring plan (BR-PMT-05) or the enrolment (MKT-ENR-08).
- AC3: A child without a teacher shows "Find a teacher".
- AC4: The "Updates from the centre" feed is Phase 2. Hide it in Phase 1.

### MKT-ENR-08 · Cancel and get a refund
- AC1: Before the first session: one tap moves the enrolment to `cancelled` at once and releases its seats. A full refund is created in `refunds` (status `requested`, auto-eligible). Ops approve it with one click; then the money returns to the original method, the commission is reversed and the plan is cancelled (BR-REF-02, OD-42). The enrolment stays `cancelled`; the parent follows the refund's own status ("Refund requested" → "approved" → "sent").
- AC2: After the first session: the parent can send a refund request with a reason. It goes to ops as a dispute (BR-REF-03).
- AC3: The parent, the teacher and the centre are notified.

### MKT-ENR-09 · Waitlist · P06
- AC1: Joining is free and takes no payment. The parent sees their position.
- AC2: When a seat frees up, the next parent gets an **offer** that reserves the seat for 24 h; it counts as a hold, so nobody else can take it (BR-ENR-10, OD-23).
- AC3: "Accept" calls `POST /v1/waitlist/{id}/accept` with the plan and method. It turns the offer into a normal seat hold and returns the checkout, then continues as MKT-ENR-02 to MKT-ENR-06.
- AC4: If the offer runs out, it is offered to the next parent, and this parent is told.

### MKT-ENR-10 · New enrolments for the teacher · J06
As a teacher, I want to see who joined my groups, so that I know my roster.
- AC1: Lists new enrolments with student, parent, group, centre and hall, plan and method.
- AC2: The student's details appear only as allowed by consent (BR-ENR-07).
- AC3: If `review_each_enrolment` is on (OD-08), the teacher can accept or decline within 48 h. A decline asks for a reason and triggers a full refund.

### MKT-ENR-11 · Monthly renewal (system)
- AC1: On the renewal day, charge the saved token once (idempotent per enrolment and period).
- AC2: Failures follow BR-PMT-06.

### MKT-ENR-12 · Failed, late or orphan payments (system)
- AC1: A payment for an `expired` enrolment moves it to `confirmed` if a seat is still free in every session it covers and the student has no other live enrolment in the group. Otherwise it is refunded automatically and stays `expired` (BR-ENR-06, OD-09).
- AC2: A provider payment that matches no enrolment, invoice or subscription becomes an ops item (MKT-OPS-05).
- AC3: A **failed payment attempt** does not cancel the enrolment. It stays `pending_payment`, the hold keeps running, and the parent is told "Payment didn't go through — try again" with a link back to checkout. Only the hold running out makes it `expired`; `cancelled` is used only when the parent cancels (BR-ENR-05, OD-09).

---

## 8. Ledger, rent and payouts — `MKT-LED`

### MKT-LED-01 · Ledger postings (system)
- AC1: Every money event posts a balanced transaction, following [08-payments-ledger.md](08-payments-ledger.md).
- AC2: Balances are derived from the ledger, never stored by hand.

### MKT-LED-02 · Commission rules (system + ops)
- AC1: Fees come from `commission_rules` with validity dates (BR-FEE-03). A rule change never changes past money (BR-MNY-11).

### MKT-LED-03 · Rent invoices (system)
- AC1: On the 1st of each month, create one rent invoice per live booking for the previous month, from the sessions marked `held` (BR-RNT-02, BR-RNT-03, BR-RNT-10). For "% of fees", fees are attributed to the month per BR-RNT-09 (OD-43, example H).
- AC2: Deduct from the teacher's available balance. Create a shortfall if needed (BR-RNT-05).
- AC3: Send the rent statement to the centre (BR-RNT-07).

### MKT-LED-04 · Pay a rent shortfall · teacher app
- AC1: The teacher sees "Rent due — pay the difference through Link" with the amount and due date.
- AC2: They pay by card, Fawry or wallet through hosted checkout. The invoice is settled when the webhook arrives.

### MKT-LED-05 · Weekly payouts (system)
- AC1: Every Thursday, pay each payee's available, reconciled balance minus any rent reserve (BR-OUT-01…04).
- AC2: Running the job twice never pays twice (BR-OUT-05). A failed payout goes back to the balance (BR-OUT-06).

### MKT-LED-06 · Reconciliation (system)
- AC1: Every day, pull each provider's settlement report and match every line to a payment, refund or payout by provider reference.
- AC2: Flag missing, extra and amount-mismatch lines as ops items. A payout is blocked for any payee with unresolved items on their money.

### MKT-LED-07 · Teacher earnings · J07
- AC1: Per month: parents paid, Link commission (as its own line), rent per centre, payout, next payout date and account (last digits).
- AC2: Shows a breakdown by group and by payment method.
- AC3: CSV export.

### MKT-LED-08 · Centre rent income · C07
- AC1: Per month: rent due, collected (%), outstanding (teachers), hall use (%).
- AC2: A per-teacher table shows hall, use (sessions, average students), rent rule, amount and status ("Auto from Link", "Due 5 Oct").
- AC3: "How rent reaches you" explains the deduction and the Link fee. The next transfer shows the net after the fee.
- AC4: Outstanding list with a "Send reminder" action. CSV export.
- AC5: Everything is **per centre**. An owner with several centres switches centre; each centre has its own balance, payouts and statements (`/v1/centres/{id}/balance`, `/payouts`, `/statements.csv`).

---

## 9. Reviews — `MKT-REV`

### MKT-REV-01 · Leave a review or private feedback · P10
- AC1: Only for a verified parent after the first session (BR-REV-01). The screen shows "Verified: <child> studies here".
- AC2: Rate the centre and the teacher separately (stars + tags: communication, organised, location, good value / explains clearly, patient, homework feedback, exam prep) and write text (≤ 600 characters).
- AC3: Choose: "Post publicly" (shown as "Verified parent • <year>") or "Send privately" (only the target sees it).
- AC4: Says that reviews are checked for personal attacks and contact details.

### MKT-REV-02 · Automatic checks (system)
- AC1: Run the checks in BR-REV-04. A review that passes is published. One that fails is held for ops with the failed checks listed.
- AC2: In Phase 1 the checks are rule-based (contact-detail patterns, word list). An AI classifier for Arabic and Franco-Arabic can be switched on later by feature flag.

### MKT-REV-03 · Reviews for owners and teachers · C04
- AC1: Tabs: Public reviews, Private feedback, Reported. Shows the rating per teacher.
- AC2: Actions: reply publicly, report. No delete or hide (BR-REV-06).
- AC3: Shows "How reviews work" and "What parents mention" tag counts.

---

## 10. Ops console — `MKT-OPS`

### MKT-OPS-01 · Centre join requests and verification · L01
- AC1: Pipeline: New, Call scheduled, Visit booked, Live, Rejected.
- AC2: The verification checklist from BR-VER-01, with who did each step and when. "Approve" unlocks only when every check is done.
- AC3: Internal notes on the request.

### MKT-OPS-02 · Teacher verification queue
- AC1: Lists eKYC results needing review, plus degree and reference uploads. Actions: verify, reject (with a reason).

### MKT-OPS-03 · Review moderation · L02
- AC1: Queue of reported or auto-flagged reviews, with flags (personal attack, phone number, possible fake) and their checks.
- AC2: Decisions: ask the parent to edit and resubmit, hide, publish as is (BR-REV-05). Shows the time left against the 48 h target.

### MKT-OPS-04 · Refunds and disputes · L03
- AC1: Lists refund requests, disputes and unmatched payments with amount and status (auto-eligible, waiting for centre, needs decision).
- AC2: Details show the timeline (booked and paid, cancelled), the policy check, refund amount, commission reversed and the monthly plan's status.
- AC3: Actions: approve refund (`ops.finance`, BR-REF-07), contact the centre, contact the parent. Everyone involved is notified and every step is logged.

### MKT-OPS-05 · Unmatched payments and reconciliation issues
- AC1: Lists reconciliation mismatches and orphan payments. Actions: match to an enrolment or invoice, refund, or mark resolved with a note.

### MKT-OPS-06 · Commission rules
- AC1: View and add rules per kind and scope with validity dates. Overlapping rules are rejected.
- AC2: Only ops users with the `ops.finance` permission may edit. Every change is audited.

### MKT-OPS-07 · Reference data
- AC1: Edit curricula, school years, subjects and academic terms (OD-07), in Arabic and English.

### MKT-OPS-08 · Ops access
- AC1: The ops console uses SSO with an IP allow-list. No phone OTP.
- AC2: Every view of personal data and every action is written to the audit log.
- AC3: Ops users have role `link_ops`; what they can do comes from the permissions `ops.verify`, `ops.moderate` and `ops.finance`, granted as the bundles in OD-37.

### MKT-OPS-09 · Data-subject requests (PDPL)
- AC1: Lists requests from `POST /v1/me/data-requests` (access, correction, deletion) with their age against the legal time limit.
- AC2: "Complete" records what was exported, corrected or anonymised. Financial and audit records that the law requires are kept, with personal fields anonymised (10 §3).
- AC3: Permission: `ops.verify`. Every step is audited.

### MKT-OPS-10 · Manual ledger adjustments
- AC1: An `ops.finance` user posts a balanced adjustment (P11) with `POST /v1/ops/ledger/adjustments`. A reason is required.
- AC2: The form shows each account's owner (teacher, centre or Link) and refuses an adjustment that does not balance.
- AC3: Used for recoveries and corrections only. Existing entries are never edited.

### MKT-OPS-11 · Payout monitoring and retry
- AC1: Lists payout runs and failed payouts by payee (teacher or centre) with the failure reason.
- AC2: "Retry" (`POST /v1/ops/payouts/{id}/retry`, `ops.finance`) retries the same payout with the same idempotency key once the payee has fixed their account. It never creates a second payout for the period (BR-OUT-05).

---

## 11. Public website — `MKT-WEB`

### MKT-WEB-01 · Landing page · Figma `68:605`
- AC1: A server-rendered landing page with sections for parents, teachers and centres, and links to the PWA and to "Add my centre".
- AC2: Build it from the Figma page **"Landing page · Website"** (`68:605`, desktop frame `68:616`, 1440 px), its `Link Web / Button` and `Link Web / FAQ item` components, and the `Link/Web/*` text styles (inventory in [11](11-design-system.md) §7). Sections, in order: navigation, hero, trust strip, the problem, how it works (4 steps), the product (tabbed), features, marketplace, trust & control, pricing, FAQ, join Link (form), footer.
- AC3: Phase 1 copy (OD-48): sections that describe follow-up, voice or analytics are hidden or labelled "coming soon" behind a feature flag until those phases ship. Teachers are described as renting weekly hall slots (CF-19). The "Content to confirm" note (`80:691`) must be cleared before go-live: fee rates (OD-01, OD-02), paid extras (OD-05), trust claims, form promises, contact details, legal pages, sample data, real photos, motion.
- AC4: The "Get started" form (name, centre name, area, teachers, WhatsApp number) sends `POST /v1/leads` and creates an ops lead (`org.leads`). It does not create an account; ops follow up and the person signs up with phone OTP.
- AC5: The hero's 8-second motion loop (voice note → record → flag → WhatsApp) respects `prefers-reduced-motion`. Arabic and English versions, RTL in Arabic.

### MKT-WEB-02 · Centre pages for SEO
- AC1: `/{lang}/centres/{slug}`, server-rendered and cached at the CDN. Content as in P04, without the parent's private data.
- AC2: Only verified centres are indexable.

### MKT-WEB-03 · Teacher pages for SEO
- AC1: `/{lang}/teachers/{slug}`, the same as MKT-WEB-02, with P05's content.

### MKT-WEB-04 · SEO plumbing
- AC1: `hreflang` for AR and EN, canonical URLs, `sitemap.xml`, `robots.txt`, and JSON-LD (`EducationalOrganization`, `Person`, `AggregateRating`).
- AC2: A `profile.updated` event purges the CDN cache.

---

## 12. Notifications — `MKT-NTF`

### MKT-NTF-01 · Transactional notifications
- AC1: Phase 1 channels: SMS (OTP and fallback), push (PWA and app) and email when known. Parent WhatsApp messages start in Phase 2. (default · OD-40)
- AC2: Events: OTP, seat held/expired, payment received, enrolment confirmed/declined, waitlist seat available, renewal ok/failed, refund issued, hall request stage changed, rent invoice/shortfall, payout sent/failed, review published/needs edit, verification result.
- AC3: All templates exist in Arabic and English. Each user gets messages in their saved language.

### MKT-NTF-02 · Push devices
- AC1: The teacher app and the PWA register a push token after sign-in (`POST /v1/me/devices`, with platform and app) and remove it on sign-out (`DELETE /v1/me/devices/{id}`).
- AC2: Tokens that the push provider reports as invalid are revoked automatically. One person can have several devices.

---

## 13. Non-functional requirements (Phase 1) — `NFR`

These are starting targets. Tune them after launch.

| ID | Requirement |
|---|---|
| NFR-01 | Arabic-first RTL plus full English on every surface. |
| NFR-02 | Parent PWA and teacher app are mobile-first and work on low-end Android over 3G. The owner web is desktop-first. |
| NFR-03 | Search API p95 < 500 ms. Public pages LCP < 2.5 s on 4G. Hold + checkout creation p95 < 1 s, not counting the provider. |
| NFR-04 | core-api availability ≥ 99.5% a month. |
| NFR-05 | WCAG 2.1 AA on parent and public surfaces. |
| NFR-06 | Security and privacy as in [10-security-privacy.md](10-security-privacy.md). |
| NFR-07 | Every request and event carries a trace ID (OpenTelemetry). |
| NFR-08 | No personal data in product analytics (PostHog) or logs. |

---

## 14. Screen → story map

| Screen | Stories |
|---|---|
| P01 Welcome & sign up | MKT-ACC-01, MKT-ACC-02 |
| P02 Search home | MKT-DSC-01, MKT-ACC-05 |
| P03 Map & results | MKT-DSC-02, MKT-DSC-03 |
| P04 Centre profile | MKT-DSC-04, MKT-WEB-02 |
| P05 Teacher profile | MKT-DSC-05, MKT-WEB-03 |
| P06 Choose a group | MKT-ENR-01, MKT-ENR-09 |
| P07 Reserve & pay | MKT-ENR-02…05 |
| P08 Place reserved | MKT-ENR-06, MKT-ENR-04 |
| P09 My children | MKT-ENR-07, MKT-ENR-08 |
| P10 Leave feedback | MKT-REV-01 |
| C01 Add my centre | MKT-CEN-01 |
| C02 Profile editor | MKT-CEN-02 |
| C03 Room schedule | MKT-CEN-04 |
| C04 Reviews | MKT-REV-03 |
| C05 Rooms & rent | MKT-CEN-03, MKT-HAL-05 |
| C06 Room requests | MKT-HAL-04, MKT-HAL-05 |
| C07 Rent income | MKT-LED-08 |
| J01 Find a room | MKT-HAL-01 |
| J02 Request a slot | MKT-HAL-02 |
| J03 My requests | MKT-HAL-03 |
| J04 My profile | MKT-TCH-01, MKT-TCH-02 |
| J05 Groups & fees | MKT-GRP-01, MKT-GRP-02 |
| J06 Enrolments | MKT-ENR-10 |
| J07 Earnings | MKT-LED-07, MKT-TCH-03, MKT-LED-04 |
| L01 Centre requests | MKT-OPS-01 |
| L02 Review moderation | MKT-OPS-03 |
| L03 Refunds & disputes | MKT-OPS-04, MKT-OPS-05 |
| A16 Staff & access (subset) | MKT-ACC-06 |
| A18 Owner sign-in (OTP version) | MKT-ACC-01 |
| T14 Sign in | MKT-ACC-01 |
| Landing page `68:605` (frame `68:616`) | MKT-WEB-01 |
