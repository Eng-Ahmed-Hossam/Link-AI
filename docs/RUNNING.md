# Running Link on this machine

Two ways to run Link locally. Both use **sample data only**: no real people, money, SMS or WhatsApp.

| | `pnpm dev` — live | `pnpm demo` — mock |
|---|---|---|
| Backend | core-api (NestJS) on :4000, Postgres, Redis, aws-local | The mock server on :4010 (in-memory) |
| Sign-in | Phone code by SMS → read it in **sms-sink** at http://localhost:8093 | Code `123456` for every number |
| Data | Saved in Postgres; survives restarts | Lost when the mock server stops |
| Demo controls | Local only: the story (Reset story, Follow-up extra) and the stand-in for Link ops (Verify centre) | Yes (the banner's "Demo tools") |

Status: **R2b** (platform, accounts, halls, room requests, groups, search, seats, payments on fake-pay, the ledger, earnings, rent income, reviews) of [docs/plan/real-backend.md](plan/real-backend.md). The full `pnpm setup` from a clean clone arrives in R4.

## First run

Needs Docker Desktop (WSL2 on Windows), Node 24+, pnpm 12.

```bash
pnpm install
node scripts/env-local.mjs    # once: writes .env.local with local ports and fresh secrets
pnpm dev                      # services, migrations, demo data, core-api, web, teacher app
```

`pnpm dev` seeds the demo world only when the database is empty, so your changes survive a restart. `pnpm dev --reset` (or `pnpm seed:demo --reset`) wipes and re-seeds it.

> **Keys in `.env.local`.** Phones are encrypted with `FIELD_KEY_LOCAL` and looked up with `HMAC_KEY_LOOKUP`. `node scripts/env-local.mjs --force` keeps those keys. **If you change either key by hand, the data in Postgres can no longer be read** (core-api says so at start-up): run `pnpm seed:demo --reset` to start again with sample data.

## Sign in

| Who | Where | Number |
|---|---|---|
| Parent (Hassan; Mariam and Youssef) | http://localhost:3000/ar/welcome | +20 10 0000 0001 |
| Teacher (Ms Salma) | http://localhost:8081 | +20 10 0000 0002 |
| Owner (Tamer, Al Nour) | http://localhost:3000/ar/centre | +20 10 0000 0003 |
| Reception (Dina, Al Nour) | http://localhost:3000/ar/centre | +20 10 0000 0004 |
| Owner B (Nile Academy, for the cross-tenant tests) | http://localhost:3000/ar/centre | +20 10 0000 0007 |

Ask for a code, open http://localhost:8093 (it refreshes every 5 s), type the 6 digits. A new number signs up: as a parent on P01, as a teacher in the teacher app. A centre owner joins through "Add my centre" (C01); the centre is created, pending verification, the first time that number signs in.

## What is real in live mode (R1, R2a, R2b, R3)

| Area | Live |
|---|---|
| Phone sign-in (P01, A18, T14) | Real: codes by SMS to sms-sink, 5 minutes, 5 tries, 60 s before resend, rate limits |
| Sessions | Real: 15-minute access token, 30-day refresh token rotated on use; httpOnly cookies on the web, secure storage in the teacher app (browser storage in its web build) |
| Sign-up | Parent, teacher; owner through C01 (pending centre) |
| Children and consents | Real (`/v1/me/children`, `/v1/me/consents`) |
| Staff list and invites (A16) | Real; owner only; the invite SMS goes out through the outbox and the worker |
| Feature flags, Follow-up extra per centre | Real (`platform.feature_flags`) |
| Centre isolation | Real: RLS on every centre table; another centre's ID answers 404 |
| Halls, open slots, schedule (C02, C03, C05) | Real: add a hall, close slots, rent rules, moved pin "under review" (CF-44) |
| Room requests (J01–J03, C06) | Real: search halls (PostGIS distances), estimate (rate from `commission_rules`), request, the C06 columns, approval books the slot (CF-46), double booking refused by the database, auto-approve |
| Groups (J05) | Real: fees, seats never above the hall, sessions generated from the slot |
| Search and profiles (P02–P05) | Real: verified centres and active teachers only; a pending centre or an invited teacher stays hidden |
| Local ops stand-in | `pnpm ops:verify-centre <centreId|phone>` or Demo controls → "Verify centre" (audited) |
| Reserve and pay (P06–P08) | Real (R2b): a hold on one seat in every covered session (10 minutes; Fawry 24 hours), checkout on fake-pay's hosted page (no card field in Link), Fawry references, signed webhooks deduplicated on the event ID, the 8 enrolment states, the waitlist |
| Money | Real (R2b): every payment, release, refund, rent deduction and settlement is one balanced ledger transaction; J07 earnings and C07 rent income are read from it; "Next payout" is computed (Thursday), no payout is sent |
| Reviews (P10, C04) | Real (R2b): verified parents after the first session, once per target and term; the centre replies or reports, nobody deletes |
| Seats taken | Real: sample families hold the seats the mock shows (`pnpm seed:demo`) |
| Session records (T01–T06, A13) | Real (R3): attendance, scores (never above the maximum — blocked), observations; confirm is the teacher's; a confirmed record changes only by a correction with a reason; the owner can ask for one |
| Voice notes (T03, T04) | Real (R3) when ai-service is installed (`pnpm ai:models`): signed upload to aws-local S3 (encrypted), local Whisper, a draft the teacher checks; names matched to the roster only. Without it: "Type the note instead". Audio deleted after 30 days, transcripts after 90 (worker job) |
| Rules, flags, follow-ups (A01–A08, A14) | Real (R3): the 4 rules with versions; staff propose, the owner approves; flags only from confirmed records, with the rule, numbers and source records; cases with attempts, dismiss and reopen |
| Parent messages (A09, P09) | Real (R3): drafted from confirmed facts only; approved with the tick by someone with `messages.approve`; locked after; sent to whatsapp-fake (http://localhost:8094); "Delivered" only when the provider says so (Demo tools ask it); STOP stops at once; "I sent it" for the manual path |
| Activity log (A17) | Real (R3): from the append-only audit table, owner only |
| Follow-up extra off | Real (R3): every follow-up endpoint refuses (403 `extra_not_enabled`), no voice upload, no rule runs; the marketplace keeps working |
| Ask Link (V07) | Off unless `OLLAMA_URL` points at a local Ollama; then read-only answers, names hidden from the model. The scripted assistant is mock-only |

Jobs run in the worker (hold expiry, offers, 48-hour auto-confirm, sessions held, plans ended, funds release every 15 minutes, refunds, renewals 08:00, settlement 06:00, seat rebuild 03:00, rent invoices on the 1st at 02:00). To run one now: `POST http://localhost:4000/__demo/jobs/run {"name": "funds-release"}` (local only).

## Still not real in live mode

The ops console (verification, refunds and moderation go through `pnpm ops:*` locally), payouts (the Thursday amount is computed, nothing is sent), real SMS, WhatsApp and payment providers (local fakes only), analytics (Phase 3), `/__demo/story/jump`.

## Click it yourself (R2a)

1. **Teacher** (http://localhost:8081, 0100 000 0002): Rooms → «قاعة ١» at مركز النور → for a new group: Maths, Secondary 2, 20 students, EGP 550 → Saturday 4 PM → Send. J03 shows "waiting for مركز النور".
2. **Owner** (http://localhost:3000/ar/centre, 0100 000 0003): Room requests → move the card to Phone call, Meeting, then Approve. Room schedule → Saturday: Room 1 shows «سلمى», Booked.
3. **Teacher**: My groups → the new booking → fees 550 / 150, seats 30 → refused (Room 1 has 24) → 24 → the group opens.
4. **Parent** (http://localhost:3000/ar/welcome, 0100 000 0001): search finds مركز النور; its page shows the new group with 24 seats.
5. **Pending centre**: "Add my centre" with a new number, sign in with it at /ar/centre (pending, not in search), then Demo controls → Verify centre (or `pnpm ops:verify-centre 01…`): it appears in the teachers' Rooms.
6. **Invited teacher**: as the owner, Staff → invite a new number as Teacher; sign in with it in the teacher app → accept → add a name and a subject on My profile → now on the public teacher page.

## Click it yourself (R2b, after the six steps above)

7. **Book**: as the parent, مركز النور → the new group → «احجز مكان» for Mariam → "Pay for one month only" → Card. Link has no card field: you land on fake-pay's page (http://localhost:8091) → "Simulate success" → back on Link: "Place reserved" (the webhook confirmed it; the redirect alone changes nothing). The group now has 23 seats.
8. **Pay by card, and a failure**: book Youssef in another group, Card → "Simulate failure": the reservation stays held and offers "Try again" until the 10-minute hold runs out.
9. **Pay by Fawry**: book Youssef in the new group → "Pay for one month only" → Fawry: a reference number and "your place is held for 24 hours". The grey button "Simulate payment at a Fawry outlet" pays it (fake-pay sends the webhook).
10. **Earnings**: teacher app → Earnings (J07): what parents paid this month, **Link commission** on its own line (5%, rounded down), rent per hall, "Next payout" Thursday. Teacher app → My groups → New enrolments (J06): Mariam.
11. **Rent income**: owner → Rent income (C07): Room 1 with Ms Salma, rent, **Link fee** on its own line, net.
12. **Review**: Demo controls → "Simulate first session done", then as the parent: My children → Mariam → "Rate" → 5 stars and a sentence → Send. As the owner: Reviews (C04) → the review → Reply. There is no delete.

## Click it yourself (R3, after step 12)

13. **Held for rent**: teacher app → Earnings: "Held for rent (not paid out on Thursday)" on its own line, under "Next payout".
14. **Refund by hand**: as the parent, My children → Mariam's place → "Ask Link to review a refund" → a reason → Send to Link. Then in a terminal: `pnpm ops:refunds list` → `pnpm ops:refunds approve <id>` (or `pnpm ops:refunds deny <id> "reason"`). The booking page (P08) shows "Refund sent" or "Refund not approved".
15. **Record a session**: teacher app → Follow-up (المتابعة) → the record due → mark Mariam absent → scores (try 25 of 20: refused) → observation → Review → Confirm. The record cannot be edited now; "Correct" asks for a reason and keeps the original.
16. **A flag**: Demo controls → "Simulate first session done" again, then record the next session with Mariam absent. Owner → Today: Mariam, "2 absences in a row", assigned to Reception, with the two source records.
17. **Message the parent**: sign in as Reception (0100 000 0004) → the follow-up → Draft message (only confirmed facts, each with its source) → tick "I checked the facts" → Approve. The text is locked. Open http://localhost:8094: the message is there. Demo controls → "Advance: Sent → Delivered" twice → the status moves to Sent, then Delivered (only the provider's webhook moves it).
18. **The parent sees it**: as the parent, My children → Updates: the approved message, nothing else.
19. **Log the outcome**: Reception → the follow-up → Log outcome → Phone, Reached → it waits for confirmation; or Dismiss with a reason (it can be reopened).
20. **STOP**: Demo controls → "Parent sends STOP". Draft and approve another message for Mariam's parent: it is not sent ("not sendable — stopped"), at once. ("I sent it" is the manual path, used when `WHATSAPP_PROVIDER=manual`.)
21. **Rules**: owner → Rules → change "2 absences" to 3 → a new version; as Reception the same change is a proposal the owner approves or rejects. Activity log shows each step.
22. **A voice note** (needs `pnpm ai:models`): teacher app → the record → hold the mic, say "مريم غابت، ويوسف جاب ١٥ من ٢٠" → the draft shows Mariam absent and Youssef 15/20 for you to check; a name not on the roster stays unmatched. To time one from the terminal: `pnpm voice:try` (signs in as Ms Salma, uploads a synthetic bench clip, prints upload → draft time and the models ai-service ran).
23. **Extra off**: Demo controls → Follow-up extra off for مركز النور: the owner's Follow-ups, the teacher's Follow-up tab and the parent's Updates disappear; the API answers 403; booking a seat still works.

Codes: http://localhost:8093. Payments and webhooks: http://localhost:8091/api/webhooks. WhatsApp: http://localhost:8094. Reset everything: Demo controls → Reset story.

## Troubleshooting

- **A web page never finishes compiling** ("Compiling /[lang]/… " for minutes, no CPU): the Next.js dev cache is broken. Stop `pnpm dev`, delete `apps/web/.next/dev`, start again.
- **core-api logs "written with other keys"**: see the key note above.

## Tests

```bash
pnpm test:api          # core-api integration + events + RLS, on its own database (link_test)
pnpm test:rls          # the cross-tenant suite alone
pnpm test:money        # golden examples A–I, ledger property tests, seat and concurrency tests
pnpm test:e2e:live     # sign-in as each role, invites, C01 and the story (all 9 steps), clicked in the browser
pnpm test:e2e:mock     # the same specs against pnpm demo
pnpm openapi:check     # contract, OpenAPI document and client types in sync
```

## Ports

| Port | What |
|---|---|
| 3000 | Web (parent PWA, owner and staff web) |
| 8081 | Teacher app (Expo web) |
| 4000 | core-api (`/health`, `/ready`, `/v1/*`) |
| 4002 | messaging-gateway (health only until R3) |
| 5433 or 5432 | Postgres (`POSTGRES_HOST_PORT`) |
| 6379 / 6380 | Redis cache / Redis state |
| 4566 | aws-local (S3, SNS, SQS) |
| 8093 | sms-sink |
| 8091 | fake-pay: hosted checkout, Fawry, refunds, webhooks (`/api/webhooks` lists what it sent) |
| 8025 | mail-sink |
