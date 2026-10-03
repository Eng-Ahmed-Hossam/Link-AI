# 01 · Business rules

Every rule has an ID. Code, tests and backlog stories point to these IDs. A rule marked **(default · OD-nn)** is the default we build with while the decision is open. See [13-open-decisions.md](13-open-decisions.md). Every such value is configurable.

Money is in Egyptian pounds (EGP). It is stored as integer **piasters** (`pt`, 1 EGP = 100 pt). Examples show both.

---

## 1. Money basics — `BR-MNY`

| ID | Rule |
|---|---|
| BR-MNY-01 | **All payments go through Link.** Parents pay teachers through Link. Teachers pay hall rent through Link. There is no "paid directly" or "cash at the desk" path. |
| BR-MNY-02 | Amounts are stored as integers in piasters (`bigint`, column suffix `_pt`). Never use floats or decimals for money. |
| BR-MNY-03 | Rates are never hard-coded. They come from `commission_rules` and must be valid on the date of the money event. |
| BR-MNY-04 | Every money event is idempotent. A retried request, webhook or job never moves money twice. |
| BR-MNY-05 | Every money event posts one balanced ledger transaction (total debits = total credits). See [08-payments-ledger.md](08-payments-ledger.md). |
| BR-MNY-06 | Card data never touches Link. We use the provider's hosted checkout and saved-card tokens only. |
| BR-MNY-07 | Parents pay the teacher's fee only. There is no booking fee for parents (P07 shows "Booking fee EGP 0"). |
| BR-MNY-08 | Centres never pay Link upfront. Link's fees are taken from money already moving through Link. |
| BR-MNY-09 | Percentage fees are computed exactly, then Link's fee is rounded **down** to a whole piaster. The payee keeps the fraction. (default · OD-16) |
| BR-MNY-10 | Ledger balances, payment status and consent are never read from a cache. |
| BR-MNY-11 | The rate used is copied onto the payment or rent invoice (a snapshot). Later rule changes never change past money. |
| BR-MNY-12 | Payment status changes only on a verified provider webhook or a provider status query. A browser redirect never changes it. |
| BR-MNY-13 | Payment-provider processing fees are a Link cost. Parents and teachers never see them. (default · OD-15) |

## 2. Link's fees — `BR-FEE`

| ID | Rule |
|---|---|
| BR-FEE-01 | **Hall-rent marketing fee:** a % of each rent amount, taken from the **centre's** share. Default 5%, set per centre, allowed range 5–10%. (default · OD-01) |
| BR-FEE-02 | **Booking commission:** a % of each student payment, taken from the **teacher's** fee. Default 5%, set per teacher. (default · OD-02) |
| BR-FEE-03 | Rule lookup: a rule for the specific centre or teacher beats the global default rule of the same kind. A rule applies when `valid_from ≤ event date < valid_to` (`valid_to` empty = no end). Two rules of the same kind and scope may not overlap in time. |
| BR-FEE-04 | `fee = floor(gross × rate_pct / 100)`. If `min_amount_pt` is set, `fee = max(fee, min_amount_pt)`, but never more than the gross amount. |
| BR-FEE-05 | Refunds reverse commission. After a refund, the commission kept = the fee recomputed on the amount **not** refunded, at the snapshot rate. The rest is reversed. |
| BR-FEE-06 | Paid-extras subscriptions charge nothing until OD-05 is decided. Access is controlled by feature flags. |
| BR-FEE-07 | Every statement (teacher earnings, centre rent income) shows Link's fee as its own line. |

## 3. Payment methods and plans — `BR-PMT`

| ID | Rule |
|---|---|
| BR-PMT-01 | Methods: debit/credit card, Fawry (reference code paid at an outlet) and mobile wallets. |
| BR-PMT-02 | Recurring monthly payments are **card-only**, using a provider-saved card token. Any card the provider can save may be used. (default · OD-10) |
| BR-PMT-03 | Reservation plans (default · OD-03): **monthly recurring** (card), **single month** (any method), **per session** (any method; buys one named session). |
| BR-PMT-04 | A monthly period runs from the start date to the same day next month. The monthly fee is a flat amount; the session count is shown for information only. (default · OD-32) |
| BR-PMT-05 | A recurring plan renews on the same day each month. The parent can cancel at any time. Cancelling stops the next renewal and keeps the current paid month. |
| BR-PMT-06 | A failed renewal is retried after 1 day and after 3 days, and the parent is notified each time. If it is still unpaid when the new period's first session starts, the enrolment becomes `past_due`. The seat is kept for 7 days, then released. (default · OD-17) |
| BR-PMT-07 | Fawry: the parent gets a reference code that is valid for the hold time (default 24 h · OD-09). A payment that arrives after the code expires is handled by BR-ENR-06. |

## 4. Reservation and enrolment — `BR-ENR`

| ID | Rule |
|---|---|
| BR-ENR-01 | Starting a reservation creates a **hold** on one seat in every session the enrolment would cover (BR-ENR-13). The hold lasts **10 minutes** for card and wallet and **24 hours** for Fawry. (Fawry default · OD-09) |
| BR-ENR-02 | Seats are counted **per session**. For each `group_session` *s*: seats used(*s*) = live enrolments that cover *s* (`confirmed`, `awaiting_teacher`, `past_due`) + live holds that cover *s* + `offered` waitlist entries that cover *s*. A hold is created only if seats used(*s*) < `seat_cap` for **every** session it covers. Creating a hold is atomic. Link never oversells a session. (default · OD-03, OD-23) |
| BR-ENR-03 | A group's `seat_cap` may not be more than its hall's capacity (J05: "Seats are capped by the room"). |
| BR-ENR-04 | If payment succeeds while the hold is live, the enrolment is **confirmed** and the seat is the student's. If the teacher has turned on `review_each_enrolment`, it waits for the teacher instead (BR-ENR-11). |
| BR-ENR-05 | A failed payment attempt does **not** end the reservation: hosted checkout lets the parent retry, so the enrolment stays `pending_payment`, the hold keeps running and the parent is notified. Only the hold running out unpaid makes it `expired` (seat released). `cancelled` means the parent cancelled — nothing else. (default · OD-09) |
| BR-ENR-06 | If money arrives for an `expired` enrolment: when a seat is still free in every session it covers and the student has no other live enrolment in the group, it goes `expired → confirmed`. Otherwise Link refunds in full automatically (P10), the enrolment stays `expired`, and the parent is offered the waitlist. (default · OD-09) |
| BR-ENR-07 | When the enrolment is confirmed, the student's name and school year — and the guardian's phone, if the guardian agreed at checkout — go to the teacher's group and the centre's front desk. (default · OD-25) |
| BR-ENR-08 | A student may have only one live enrolment per group. |
| BR-ENR-09 | If the student's curriculum or school year does not match the group's, show a warning. Do not block the reservation. |
| BR-ENR-10 | Waitlist: when a group is full, a parent can join its waitlist for free. When a seat frees up, Link offers it to the next parent in line. The `offered` entry reserves that seat for 24 h and counts as a hold (BR-ENR-02). The parent accepts with `POST /v1/waitlist/{id}/accept`, which turns the offer into a seat hold and opens checkout. If the offer runs out, the next parent is offered the seat. (default · OD-23) |
| BR-ENR-11 | If the teacher's `review_each_enrolment` is on (off by default), a paid enrolment waits up to 48 h for the teacher to accept. A decline gives a full refund. If the teacher does nothing, the enrolment is confirmed. (default · OD-08) |
| BR-ENR-12 | Free trial sessions are not offered. (default · OD-22) |
| BR-ENR-13 | Which sessions an enrolment covers: monthly and single-month plans cover every session of their paid period. A live recurring plan also covers the next period's sessions until its renewal succeeds or fails, so a renewal never finds its own seat taken. A per-session plan covers only its one session and becomes `ended` after it. (default · OD-03) |
| BR-ENR-14 | Enrolment states are `pending_payment`, `awaiting_teacher`, `confirmed`, `past_due`, `cancelled`, `expired`, `declined` and `ended` ([08](08-payments-ledger.md) §4). Refund state lives on the refund (`refunds.status`), never on the enrolment. |

## 5. Refunds and disputes — `BR-REF`

| ID | Rule |
|---|---|
| BR-REF-01 | Link holds the teacher's money until the seat is confirmed **and** the first session of the paid period has started. Only then can it be paid out. (default · OD-11) |
| BR-REF-02 | A parent who cancels **before the first session** gets a **full refund**. The enrolment becomes `cancelled` at once and the seat is released. A refund is created in `refunds` (status `requested`, auto-eligible), and Link ops approve it with one click (L03, diagram 06). The commission is reversed and any recurring plan is cancelled. (default · OD-42) |
| BR-REF-03 | After the first session there is no automatic refund. Ops handles the request as a dispute. (default · OD-03) |
| BR-REF-04 | If a teacher cancels a group or ends a booking before the paid period ends, parents get a refund for sessions not delivered, pro-rata by session. (default · OD-03, OD-33) |
| BR-REF-05 | A refund goes back to the original payment method when the provider supports it. Otherwise it goes to a mobile wallet or bank account the parent gives. (default · OD-20) |
| BR-REF-06 | Every refund posts reversing ledger entries, notifies the parent, the teacher and the centre, and is written to the audit log. |
| BR-REF-07 | Only ops users with the `ops.finance` permission approve refunds and resolve disputes. (default · OD-37) Refunds the system starts as compensation — money that arrives after the seat is gone (BR-ENR-06) and a teacher declining an enrolment (BR-ENR-11) — run automatically, without approval. (default · OD-42) |
| BR-REF-08 | Chargebacks are taken from the teacher's unpaid balance. If that money was already paid out, Link carries the loss and ops recovers it from future balances. (default · OD-18) |

## 6. Halls and booking — `BR-BKG`

| ID | Rule |
|---|---|
| BR-BKG-01 | A centre lists each hall with name, seats (capacity), facilities, rent rule and open weekly slots. Each slot can be listed or hidden (C05). |
| BR-BKG-02 | A teacher requests one or more open weekly slots for a planned group: subject, curriculum, school year, expected students and start date (J02). Expected students may not be more than the hall's capacity. |
| BR-BKG-03 | The centre moves the request through stages: **requested → phone call → meeting → approved \| declined** (C06). The teacher can withdraw before approval. Calls and meetings are optional stages. |
| BR-BKG-04 | Optional auto-approve, per centre: approve at once when the teacher's ID is verified, their rating is ≥ 4.5 and the slot is free and fits the hall. It is off by default. (default · OD-38) |
| BR-BKG-05 | Approval creates a **room booking** and copies the hall's rent rule onto it (snapshot). Two live bookings may never overlap in the same hall. |
| BR-BKG-06 | A booking ends when either side ends it. It ends at the end of the current rent period. (default · OD-33) |
| BR-BKG-07 | A rent estimate is shown before the teacher sends a request (J02): fees × expected students, minus rent, minus Link's commission. It is an estimate, not an invoice. |

## 7. Rent — `BR-RNT`

| ID | Rule |
|---|---|
| BR-RNT-01 | The centre sets one rent rule per hall: **fixed per session**, **per student per session**, or **% of the teacher's fees**. |
| BR-RNT-02 | Each booking gets one rent invoice per period. Default: calendar month, billed in arrears, issued on the 1st of the next month. (default · OD-12) |
| BR-RNT-03 | Fixed: `amount × sessions held`. Per student: `amount × Σ counted students per session held` — counted = confirmed enrolments in Phase 1 (default · OD-13). % of fees: `floor(pct × gross fees attributed to the rent month)` for the booking's groups, before commission (default · OD-14); attribution is BR-RNT-09. |
| BR-RNT-04 | Only sessions that took place (`held`, BR-RNT-10) are charged. (default · OD-12) |
| BR-RNT-05 | Rent is **deducted from the teacher's available Link balance** when the invoice is issued. If the balance does not cover it, the teacher pays the difference through Link (card, Fawry or wallet). The shortfall is due within 5 days. (default · OD-12) |
| BR-RNT-06 | Link's rent fee = `floor(gross rent × rate)`. Centre net = gross − fee. If an invoice is paid in parts, each part carries a proportional share of the fee and the last part takes the remainder, so the parts add up exactly. |
| BR-RNT-07 | The centre gets a rent statement for each period showing gross rent, Link's fee and net (C07). |
| BR-RNT-08 | An unpaid shortfall triggers reminders to the teacher (C07 "Send reminder"), then an ops case. Bookings are not suspended automatically. (default · OD-12) |
| BR-RNT-09 | Fee attribution for "% of fees" rent: each payment's gross fee is spread evenly over the sessions of its paid period, in whole piasters, with any remainder piasters going to the earliest sessions. A rent month counts the shares of sessions **held** in that month. A per-session payment counts in its session's month. A refund after an invoice was issued never changes that invoice; the refunded share that was already invoiced is subtracted from the next invoice's fee base. If that subtraction is larger than the month's fee base, the month's rent is floored at 0 and the rest carries to the following invoice. If the booking has ended, so no further invoice will come, the rent share on the refunded fees still not absorbed is reversed as a new balanced posting (P12): Dr `centre_available` + Dr `link_revenue:rent_fee` / Cr `teacher_available`, computed like an invoice (rent = `floor(pct × amount)`, Link fee = `floor(rent × rate)`, centre share = the rest). See examples H and I. (default · OD-43) |
| BR-RNT-10 | A session is `held` automatically at its end time unless it was cancelled. Until that month's rent invoice is issued, the teacher or the centre can mark it "did not take place" (`not_held`) with a reason; the change is audited. `cancelled` and `not_held` sessions are never charged. (default · OD-44) |

## 8. Payouts — `BR-OUT`

| ID | Rule |
|---|---|
| BR-OUT-01 | Link pays each teacher and centre their **available** balance **weekly** (default Thursday) to their bank account or mobile wallet. (default · OD-04, OD-30) |
| BR-OUT-02 | Only money the provider has settled to Link (reconciled) can be paid out. |
| BR-OUT-03 | The payee must have a verified payout account. Teachers must also have passed eKYC, and centres must be verified. |
| BR-OUT-04 | A teacher's payout holds back the rent built up so far in the current period (rent reserve). (default · OD-12) |
| BR-OUT-05 | One payout per payee per period. Running the payout job twice never pays twice. |
| BR-OUT-06 | If a payout fails, the money goes back to the available balance and the payee is asked to fix their account. |
| BR-OUT-07 | The teacher earnings statement shows: parents paid, Link commission, rent per centre, and payout (J07). |
| BR-OUT-08 | There is no minimum payout amount. (default · OD-30) |

## 9. Verification — `BR-VER`

| ID | Rule |
|---|---|
| BR-VER-01 | A centre appears on the map only after ops verify it: phone call with the owner, address and map pin match, site visit or video call, owner ID, and the owner approves the profile (L01). The "approve" button unlocks only when every check is done. |
| BR-VER-02 | Service target: ops call a new centre within 2 working days of its join request (C01). |
| BR-VER-03 | A teacher must pass eKYC (national ID) before their profile is public, before they can accept enrolments, and before any payout. (default · OD-19) |
| BR-VER-04 | A degree and teaching references are optional badges, verified by ops (J04). |
| BR-VER-05 | Trust badges (e.g. "Sends progress updates", "Replies within a day") come from Link's own data. Owners cannot set them (C02). |
| BR-VER-06 | Any verification can be revoked by ops, with a reason. This hides the profile and pauses payouts. |

## 10. Reviews — `BR-REV`

| ID | Rule |
|---|---|
| BR-REV-01 | Only a verified parent — the guardian of a student with a confirmed enrolment — can review, and only after the first session. (default · OD-24) |
| BR-REV-02 | One review per enrolment, per target (centre or teacher), per term. |
| BR-REV-03 | Two kinds: a **public review** (stars, tags, text; shown as "Verified parent • <school year>") and **private feedback** (only the target sees it, e.g. the centre owner). |
| BR-REV-04 | Automatic checks: verified parent, one per enrolment, no personal attacks, no private contact details. A review that passes publishes at once. A review that fails a check, or is reported, goes to the ops queue. Ops decide within 48 h (L02). |
| BR-REV-05 | Ops decisions: **publish as is**, **hide**, or **ask the parent to edit and resubmit**. Criticism of teaching is allowed. Insults and phone numbers are not. |
| BR-REV-06 | The target (centre or teacher) can **reply publicly** or **report**. They can never delete, edit or pay to hide a review. |
| BR-REV-07 | The rating shown is the average of published public reviews, with the count next to it. |
| BR-REV-08 | Every moderation action is written to the audit log, and the parent is told the outcome. |

## 11. Approvals and trust — `BR-APR`

| ID | Rule |
|---|---|
| BR-APR-01 | The teacher confirms every record before it is saved. Nothing is written as a record without confirmation. |
| BR-APR-02 | Staff approve every message before it reaches a parent. |
| BR-APR-03 | The teacher approves the weekly parent focus plan. |
| BR-APR-04 | Every flag shows the readable rule that raised it, with the numbers and links to the records. No black-box scores. |
| BR-APR-05 | A transcript is a receipt for checking and undo. It is never shown to parents and never used directly in analytics. |
| BR-APR-06 | Every change is written to an append-only audit log. Undo creates a new change; it never deletes history. |
| BR-APR-07 | **Missing data is not absence.** A student with no record for a session is "Not recorded", never "Absent" (A01). |
| BR-APR-08 | Only confirmed records trigger rules. Drafts and missing records never raise flags (A05). A note the teacher **saves** (T11) counts as confirmed input — it is never an AI draft, because a voice-dictated note is reviewed before saving — so a saved note can trigger the "same concern 3 times" rule (`repeated_concern`). |
| BR-APR-09 | Out-of-range values are blocked, never capped silently (e.g. 21 out of 20). |
| BR-APR-10 | A contact attempt is not a resolution. Sending a message logs an attempt; the case stays open until someone records an outcome (A08, A11). AI suggestions never close a case (V06). |
| BR-APR-11 | Message delivery status is shown only as the provider reports it: Queued, Sent, Delivered or Failed (A09). |
| BR-APR-12 | Changes to a centre's rules take effect only after the owner approves them (A07). |
| BR-APR-13 | Teacher notes are internal by default. They reach a parent only after staff review and rewrite (T11). |
| BR-APR-14 | A dismissed flag keeps its reason in history and can be reopened. |

## 12. Data and consent — `BR-DAT`

| ID | Rule |
|---|---|
| BR-DAT-01 | Each centre's data is isolated by row-level security and tenant-scoped cache keys. |
| BR-DAT-02 | Parents opt in to WhatsApp and can stop at any time. A stop request takes effect at once. |
| BR-DAT-03 | Guardian consent is recorded per student, with its version and time. That includes sharing details with the teacher and centre at checkout (P07). |
| BR-DAT-04 | Voice audio is encrypted and deleted after 30 days. |
| BR-DAT-05 | We comply with Law 151/2020 on consent, retention and breach notice. See [10-security-privacy.md](10-security-privacy.md). |
| BR-DAT-06 | Parents see a topic band only, never the number (Phase 3). |

---

## 13. Worked examples

All rates below are illustrative defaults.

### Example A — Hall-rent marketing fee (prompt example)

Monthly rent EGP 2,000 for a hall booking.

| Step | 5% fee | 10% fee |
|---|---|---|
| Gross rent | EGP 2,000.00 (200,000 pt) | EGP 2,000.00 (200,000 pt) |
| Link marketing fee | EGP 100.00 (10,000 pt) | EGP 200.00 (20,000 pt) |
| Net to centre | **EGP 1,900.00** (190,000 pt) | **EGP 1,800.00** (180,000 pt) |

Rules: BR-FEE-01, BR-RNT-06.

### Example B — One student, EGP 550 monthly fee, 5% commission, rent = 20% of fees

| Step | Amount | Piasters | Rule |
|---|---|---|---|
| Parent pays the monthly fee | EGP 550.00 | 55,000 | BR-MNY-07 |
| Booking commission 5% → Link | EGP 27.50 | 2,750 | BR-FEE-02 |
| Credited to teacher (held until first session) | EGP 522.50 | 52,250 | BR-REF-01 |
| Rent: 20% × 550 (gross fee) | EGP 110.00 | 11,000 | BR-RNT-03 (OD-14) |
| Link rent fee 5% × 110 → Link | EGP 5.50 | 550 | BR-FEE-01 |
| Net to centre | EGP 104.50 | 10,450 | BR-RNT-06 |
| **Net to teacher** (522.50 − 110.00) | **EGP 412.50** | 41,250 | — |
| **Link total** (27.50 + 5.50) | **EGP 33.00** | 3,300 | — |

Check: 412.50 + 104.50 + 33.00 = **550.00** ✓

### Example C — A full group (J02 rent estimate)

25 students × EGP 550 = EGP 13,750.00 a month.

| Line | Amount |
|---|---|
| Fees parents pay | EGP 13,750.00 |
| Link commission 5% | − EGP 687.50 |
| Centre rent 20% of fees | − EGP 2,750.00 |
| **Teacher keeps** | **EGP 10,312.50** (J02 shows "≈ EGP 10,312") |
| Centre receives (2,750 − 5% fee of 137.50) | EGP 2,612.50 |
| Link earns (687.50 + 137.50) | EGP 825.00 |

### Example D — Refund before the first session (L03)

A parent paid EGP 380 for a monthly plan on 22 Sep and cancelled on 24 Sep. The first session is on 26 Sep.

| Line | Amount |
|---|---|
| Refund to the parent's card | EGP 380.00 |
| Commission reversed (5%) | EGP 19.00 |
| Teacher's held money reversed | EGP 361.00 |
| Recurring plan | Cancelled — no further charges |

Rules: BR-REF-02, BR-FEE-05.

### Example E — Rent shortfall paid in two parts

Rent invoice EGP 2,000.00, fee 5% = EGP 100.00, centre net EGP 1,900.00. The teacher's available balance is EGP 1,200.00 when the invoice is issued.

| Part | Paid | Fee share | To centre |
|---|---|---|---|
| 1. Deducted from balance | EGP 1,200.00 | floor(1,200 × 100 / 2,000) = EGP 60.00 | EGP 1,140.00 |
| 2. Teacher pays the shortfall through Link | EGP 800.00 | last part takes the remainder: 100 − 60 = EGP 40.00 | EGP 760.00 |
| **Total** | **EGP 2,000.00** | **EGP 100.00** | **EGP 1,900.00** |

Rules: BR-RNT-05, BR-RNT-06.

### Example F — Per-student rent (C07)

EGP 15 per student per session. 8 sessions with 304 counted student-sessions in total (38 on average).

| Line | Amount |
|---|---|
| Gross rent 15 × 304 | EGP 4,560.00 |
| Link fee 5% | EGP 228.00 |
| Net to centre | EGP 4,332.00 |

### Example G — Rounding

A 5% commission on a per-session fee of EGP 137.45 (13,745 pt) is exactly 687.25 pt. Link's fee is rounded down to **687 pt (EGP 6.87)**, and the teacher is credited 13,058 pt (EGP 130.58). (BR-MNY-09)

### Example H — "% of fees" rent with a 3rd-to-3rd monthly plan (BR-RNT-09, OD-43)

Example C's group: 25 students, each on a monthly plan of EGP 550 (55,000 pt) for the period **3 Nov 2026 → 3 Dec 2026**. The group meets Wednesday and Saturday. Rent rule: 20% of fees; Link rent fee 5%.

**Step 1 — spread one payment over its sessions.** The period has 9 sessions: Wed 4, Sat 7, Wed 11, Sat 14, Wed 18, Sat 21, Wed 25, Sat 28 Nov and Wed 2 Dec. 55,000 ÷ 9 = 6,111 pt each, remainder 1 pt, which goes to the earliest session.

| Session | Share |
|---|---|
| Wed 4 Nov | 6,112 pt |
| The other 8 sessions | 6,111 pt each |
| **Total** | 6,112 + 8 × 6,111 = **55,000 pt** ✓ |

**Step 2 — attribute to rent months** (all sessions held):

| Month | Sessions | Per student | 25 students |
|---|---|---|---|
| November | 8 | 6,112 + 7 × 6,111 = 48,889 pt | 1,222,225 pt (EGP 12,222.25) |
| December | 1 | 6,111 pt | 152,775 pt (EGP 1,527.75) |
| **Total** | 9 | 55,000 pt ✓ | 1,375,000 pt = EGP 13,750 ✓ (as Example C) |

**Step 3 — the two rent invoices:**

| Invoice | Fee base | Rent 20% (rounded down) | Link fee 5% (rounded down) | Net to centre |
|---|---|---|---|---|
| November (issued 1 Dec) | 1,222,225 pt | 244,445 pt | 12,222 pt | 232,223 pt |
| December (issued 1 Jan) | 152,775 pt | 30,555 pt | 1,527 pt | 29,028 pt |
| **Total** | 1,375,000 pt | **275,000 pt = EGP 2,750** ✓ (as Example C) | 13,749 pt | 261,251 pt |

Check: 232,223 + 12,222 = 244,445 ✓ and 29,028 + 1,527 = 30,555 ✓. The rent matches Example C exactly. Link's fee is 1 piaster lower than Example C's EGP 137.50, because each of the two invoices rounds Link's fee down (BR-MNY-09).

**Step 4 — a refund after an invoice is issued.** Suppose one student's EGP 550 is refunded in full on 10 Dec, after the November invoice was issued. The November invoice does not change. December's fee base = 24 × 6,111 (the remaining students' December shares) − 48,889 (the refunded student's November share, already invoiced) = 146,664 − 48,889 = **97,775 pt**. Rent = 19,555 pt; Link fee = floor(977.75) = 977 pt; net to centre = 18,578 pt (18,578 + 977 = 19,555 ✓).

### Example I — Refund adjustment larger than the month's fee base (BR-RNT-09, OD-43)

A booking with rent = 20% of fees and a 5% Link rent fee. A student's refund means **48,889 pt** of fees that an earlier invoice already counted must come off. February's own fee base is only **30,000 pt**.

**February invoice.** Fee base 30,000 + adjustment −48,889 = −18,889 pt. Rent is floored at 0, so the Link fee is 0 and the centre gets 0. The remaining **−18,889 pt** carries to the next invoice (`fees_base_carried_pt`).

**Case 1 — the booking continues.** March's fee base is 100,000 pt.

| Line | Amount |
|---|---|
| Fee base 100,000 + carried −18,889 | 81,111 pt |
| Rent 20%, rounded down | 16,222 pt |
| Link fee 5%, rounded down | 811 pt |
| Net to centre | 15,411 pt (15,411 + 811 = 16,222 ✓) |

**Case 2 — the booking ended with February**, so no March invoice will come. The rent share on the unabsorbed 18,889 pt is reversed at once as posting P12 ([08](08-payments-ledger.md) §2):

| Line | Amount | Posting |
|---|---|---|
| Rent share: floor(20% × 18,889) | 3,777 pt | Cr `teacher_available` 3,777 |
| Link fee share: floor(5% × 3,777) | 188 pt | Dr `link_revenue:rent_fee` 188 |
| Centre share: 3,777 − 188 | 3,589 pt | Dr `centre_available` 3,589 |

Check: 188 + 3,589 = 3,777 ✓ — the transaction balances.
