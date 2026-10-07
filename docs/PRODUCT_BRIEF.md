# Link: product brief (the single source of truth)

> If any doc, prompt, Figma frame or older decision disagrees with this page, **this page wins**. Change it only when Ahmed says so.
> Owner: Ahmed Hossam · Version 1 · 7 Oct 2026

## 1. What Link is

Link is a **marketplace for tutoring in Egypt**:

- **parents** find the right teacher and group near them, and reserve a seat;
- **teachers** rent hall slots in tutoring centres and run their groups;
- **centres** fill their empty halls and earn rent.

On top of the marketplace, centres and teachers can switch on a **paid extra: Link Follow-up**. After class the teacher speaks a short voice note in Egyptian Arabic. Link turns it into a record, raises a readable flag when a student starts slipping, and drafts a parent update that staff approve.

**Tagline (from Figma):** "Speak after class. Link does the follow-up."
**Positioning (from Figma):** "Free to join. We earn when you do."

## 2. Who uses it, and the 3 things each does most

| Role                 | Where                   | Top 3 tasks                                                                                                                                 |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent               | Parent app (mobile web) | Find a teacher or group · Reserve and pay · See their child's enrolments (and approved updates, if the centre uses Follow-up)               |
| Teacher              | Teacher app             | Rent a hall slot · Run groups and confirm new students · See earnings (+ Follow-up: confirm the session record by voice)                    |
| Centre owner / staff | Centre web              | List halls and approve room requests · See rent income · Reviews (+ Follow-up: Today's flags → follow up → log the outcome)                 |
| Link ops             | Ops console             | Verify centres and teachers · Moderate reviews · Handle refunds                                                                             |

## 3. How Link makes money

- **Free to join** for centres, teachers and parents.
- **From centres:** a small % of hall rent (5–10%).
- **From teachers:** a booking commission (5%) on their fee. Parents pay no extra fee.
- **Paid extras** (Follow-up) are a subscription. The **only** subscription in Link is for paid extras.
- **All payments go through Link:** card, Fawry, wallet. Recurring payments are card only. Parents pay the teacher; the teacher pays rent through Link.
- **Curricula:** National, IGCSE, American, Nile.

## 4. What we're building now (the trial version)

1. **The landing page:** an **exact copy of the Figma landing page** (frame `68:616`), in Arabic and English.
2. **A clickable trial of the whole product on sample data:** parent app, teacher app and centre web, with the marketplace **and** Follow-up switched on, so a visitor sees the full story.
3. **One simple way in:** Landing → "Try Link" → pick your role (Parent · Teacher · Centre) → that role's app, nothing else.
4. **Sign-up / request:** the landing form sends the request to Ahmed by email. Real accounts come later.

## 5. Not now

- real payments (only mock checkout and Fawry screens);
- the real WhatsApp API;
- app stores;
- hosting real centre data;
- the ops console beyond its 3 screens;
- analytics (Phase 3);
- marketplace extras without a Figma design.

The Follow-up **pilot** at a centre (laptop) stays ready, but is not the main product.

## 6. Rules that never change

- **Arabic first.** Arabic is the default, and every screen also works in English.
- **Sample data only** in demos. Real data only in a pilot, and only with signed consent.
- **The teacher confirms every record; staff approve every parent message;** nothing is sent automatically.
- **Figma is the design.** The docs only correct facts (money, rules), never the look.

## 7. One map of the system

| Thing           | What it is                                  | Where it runs now |
| --------------- | ------------------------------------------- | ----------------- |
| Landing page    | Shows Link and collects requests            | Local; Vercel later |
| Parent app      | Find, reserve, pay, follow the child        | Local demo        |
| Teacher app     | Rooms, groups, earnings, Follow-up          | Local demo        |
| Centre web      | Halls, requests, income, reviews, Follow-up | Local demo        |
| Ops console     | Verification, reviews, refunds              | Later             |
| Follow-up pilot | Real follow-up at one centre, on a laptop   | Ready, on hold    |
