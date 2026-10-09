# Running Link on this machine

One page, from a clean clone to every role signed in. **Sample data only**: no real people, money, SMS or WhatsApp; every provider is a local fake.

Windows: follow [setup-windows.md](setup-windows.md) first (Docker Desktop with WSL2, Node, pnpm, uv). What to switch to make Link real later: [go-live-switches.md](go-live-switches.md). Both arrive with the setup branch (`codex/setup-golive`); until it is merged these two links are empty.

## 1. Start

```bash
git clone https://github.com/Eng-Ahmed-Hossam/Link-AI.git && cd Link-AI
pnpm install                  # workspace packages
node scripts/env-local.mjs    # once: writes .env.local with local ports and fresh secrets
pnpm dev                      # local services, migrations, sample data, core-api, web, teacher app
```

> When the setup branch (`codex/setup-golive`) is merged, `pnpm setup` does the first two lines and checks your machine, and `pnpm doctor` checks it at any time. Until then they do not exist.

`pnpm dev` starts Docker services (Postgres, Redis ×2, aws-local, sms-sink, mail-sink, fake-pay, whatsapp-fake), runs migrations, seeds the sample world if the database is empty, then core-api (:4000, worker, messaging-gateway :4002), the web (:3000) and the teacher app (:8081). If ai-service is installed (`pnpm ai:models`) it starts it too, for voice notes. The first run builds images and takes a few minutes.

`pnpm demo` is the other way: the same apps on the in-memory mock server (code `123456` for every number, nothing saved). The public demo is built from it.

## 2. Sign in

Ask for a code, then read it in **sms-sink at http://localhost:8093** (refreshes every 5 s).

| Who | Where | Number |
|---|---|---|
| Parent (Hassan; Mariam and Youssef) | http://localhost:3000/ar/welcome | 0100 000 0001 |
| Teacher (Ms Salma) | http://localhost:8081 | 0100 000 0002 |
| Owner (Tamer, Al Nour) | http://localhost:3000/ar/centre | 0100 000 0003 |
| Reception (Dina, Al Nour) | http://localhost:3000/ar/centre | 0100 000 0004 |
| Owner B (Nile Academy) | http://localhost:3000/ar/centre | 0100 000 0007 |

A new number signs up: as a parent on P01, as a teacher in the teacher app; a centre owner through "Add my centre" (C01, pending until verified). **Demo controls** (the amber button, local only) stand in for the outside world: Reset story, Simulate first session done, Follow-up extra on/off, Verify centre, and the WhatsApp provider (advance, fail, parent reply, STOP, new day).

## 3. Click it yourself (steps 1–23)

Each step starts from the one before. Screens by ID: [app map](product/app-map.md).

1. **Teacher**: Rooms → «قاعة ١» at مركز النور → new group: Maths, Secondary 2, 20 students, EGP 550 → Saturday 4 PM → Send. J03 shows "waiting for مركز النور".
2. **Owner**: Room requests → move the card to Phone call, Meeting, then Approve. Room schedule → Saturday: Room 1 shows «سلمى», Booked.
3. **Teacher**: My groups → the new booking → fees 550 / 150, seats 30 → refused (Room 1 has 24) → 24 → the group opens.
4. **Parent**: search finds مركز النور; its page shows the new group with 24 seats.
5. **Pending centre**: "Add my centre" with a new number, sign in with it at /ar/centre (pending, not in search) → Demo controls → Verify centre (or `pnpm ops:verify-centre 01…`): it appears in the teachers' Rooms.
6. **Invited teacher**: owner → Staff → invite a new number as Teacher; sign in with it in the teacher app → accept → add a name and a subject on My profile → now on the public teacher page.
7. **Book**: parent → مركز النور → the new group → «احجز مكان» for Mariam → "Pay for one month only" → Card → fake-pay's page (:8091; Link has no card field) → "Simulate success" → "Place reserved" (the webhook confirmed it, not the redirect). 23 seats left.
8. **A failed card**: book Youssef in another group → Card → "Simulate failure": the seat stays held with "Try again" until the 10-minute hold ends.
9. **Fawry**: book Youssef in the new group → Fawry: a reference, "held for 24 hours" → "Simulate payment at a Fawry outlet".
10. **Earnings**: teacher → Earnings (J07): parents paid, **Link commission** (5%, rounded down) on its own line, rent per hall, "Next payout" Thursday. My groups → New enrolments (J06): Mariam.
11. **Rent income**: owner → Rent income (C07): Room 1 with Ms Salma, rent, **Link fee**, net.
12. **Review**: Demo controls → "Simulate first session done"; parent → My children → Mariam → Rate → 5 stars and a sentence. Owner → Reviews (C04) → Reply. There is no delete.
13. **Held for rent**: teacher → Earnings: "Held for rent (not paid out on Thursday)" under "Next payout".
14. **Refund by hand**: parent → My children → Mariam's place → "Ask Link to review a refund" → reason → Send. Terminal: `pnpm ops:refunds list` → `pnpm ops:refunds approve <id>` (or `deny <id> "reason"`). The booking page (P08) shows "Refund sent" or "Refund not approved".
15. **Record a session**: teacher → Follow-up (المتابعة) → the record due → Mariam absent → scores (25 of 20 is refused) → observation → Review → Confirm. Now it changes only by "Correct", with a reason; the original is kept.
16. **A flag**: Demo controls → "Simulate first session done" again; record the next session with Mariam absent. Owner → Today: Mariam, "2 absences in a row", assigned to Reception, with the two source records.
17. **Message the parent**: sign in as Reception → the follow-up → Draft message (confirmed facts only, each with its source) → tick "I checked" → Approve; the text locks. It appears at http://localhost:8094. Demo controls → "Advance: Sent → Delivered" twice.
18. **The parent sees it**: parent → My children → Updates: the approved message only.
19. **Log the outcome**: Reception → Log outcome → Phone, Reached; or Dismiss with a reason (it can be reopened).
20. **STOP**: Demo controls → "Parent sends STOP"; the next approved message for that parent is "not sendable — stopped", at once.
21. **Rules**: owner → Rules → 2 absences → 3: a new version. As Reception the same change is a proposal the owner approves or rejects. Activity log shows each step.
22. **A voice note** (needs `pnpm ai:models`): teacher → the record → hold the mic → "مريم غابت، ويوسف جاب ١٥ من ٢٠" → the draft shows Mariam absent and Youssef 15/20 for you to check; a name not on the roster stays unmatched.
23. **Extra off**: Demo controls → Follow-up extra off: the owner's Follow-ups, the teacher's Follow-up tab and the parent's Updates disappear; the API answers 403; booking still works.

## 4. Reset the data

| To | Run |
|---|---|
| Start the story again (keeps the services up) | Demo controls → **Reset story** |
| Re-seed the sample world | `pnpm dev --reset` (or `pnpm seed:demo --reset`) |
| Delete every local volume and start clean | `pnpm dev:reset` (asks you to type `reset`) |

## 5. What is real and what is fake

**Real** (core-api, Postgres, the real rules): sign-in and sessions, accounts, children and consents, staff and invites, centre isolation, halls, room requests, groups, search, seats and holds, payments and the double-entry ledger, earnings and rent income, refunds, reviews, session records and corrections, voice notes (with ai-service), the 4 follow-up rules, flags and cases, parent messages and approval, the activity log, the Follow-up extra per centre.

**Fake** (local stand-ins): SMS → sms-sink (:8093); payments → fake-pay (:8091, moves no money); WhatsApp → whatsapp-fake (:8094); Link ops → `pnpm ops:verify-centre`, `pnpm ops:refunds` and Demo controls; payouts are computed, never sent; Ask Link is off unless a local Ollama runs (`OLLAMA_URL`). The full list and what each needs: [sample-only](product/sample-only.md); the plan: [before real users](plan/before-real-users.md).

## 6. Time a voice note

```bash
pnpm ai:models      # once: local Whisper (and the extraction model) for ai-service
pnpm dev            # starts ai-service when the models are there
pnpm voice:try      # signs in as Ms Salma, uploads a sample clip, waits for the draft
```

It prints the upload time, the time from upload to draft, and the speech-to-text and language models ai-service ran. Sample audio only (`apps/ai-service/bench/audio`); never a real recording.

## 7. Common fixes

| Symptom | Fix |
|---|---|
| "already in use: …" when starting | Another `pnpm dev` or `pnpm demo` is running: stop it (they share ports). |
| A web page "Compiling…" for minutes, no CPU | The Next.js cache broke: stop, delete `apps/web/.next/dev`, start again. |
| core-api says the data was "written with other keys" | `.env.local`'s keys changed: `pnpm dev --reset`. |
| No code in sms-sink | Wait 60 s between codes for one number; check http://localhost:8093 refreshes. |
| Voice note says "Type the note instead" | ai-service is not running: `pnpm ai:models`, then restart `pnpm dev`. |
| A message stays "Queued" | Demo controls → "Advance"; whatsapp-fake must reach core-api (`WHATSAPP_FAKE_WEBHOOK_URL`). |
| Docker errors | Docker Desktop must be running (WSL2 on Windows); `pnpm doctor` names what is missing. |

## Tests and ports

```bash
pnpm test:api && pnpm test:rls && pnpm test:money   # core-api (own database link_test)
pnpm test:e2e:live                                   # the browser specs on pnpm dev (story: all 9 steps)
pnpm test:e2e:mock                                   # the same specs on pnpm demo
```

Ports: 3000 web · 8081 teacher app · 4000 core-api · 4002 messaging-gateway · 5432 Postgres (`POSTGRES_HOST_PORT`) · 6379/6380 Redis · 4566 aws-local · 8090 ai-service · 8091 fake-pay · 8093 sms-sink · 8094 whatsapp-fake · 8025 mail-sink.
