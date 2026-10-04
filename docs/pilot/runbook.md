# Pilot runbook — one laptop at the centre

For us (the operators). The pilot runs the follow-up loop for one centre on one Windows laptop: the owner web for Reception and the owner, and the teacher app on 1–2 teacher phones over the centre Wi-Fi. No cloud, no paid service. Decisions: OD-50 to OD-57 ([docs/13](../13-open-decisions.md)); design: [ADR-0008](../adr/ADR-0008-pilot-server-and-durable-store.md).

> Draft — review before use. The pilot keeps **no guardian phone numbers and no national IDs**; students are first names or nicknames; messages go out from the centre's own WhatsApp, by hand.

## 0. What you need

- A Windows 10/11 laptop that stays at the centre for the pilot, with **BitLocker** (Pro/Enterprise) or **Device encryption** (Home) on, and a screen lock.
- The centre Wi-Fi, with the laptop and the teacher phones on it.
- Git, Node.js 24 or newer, pnpm 12.8.1 (`npm install -g pnpm@12.8.1`).
- The signed centre agreement and teacher consents (OD-52) before any real student is imported.

## 1. Install (clean laptop)

```powershell
git clone <repo> C:\LinkPilot\app
cd C:\LinkPilot\app
pnpm install
pnpm pilot:build          # owner web + teacher app, pilot builds; ends with the bundle check
```

Measured 2026-10-04 on the build laptop (Windows 11), fresh `git clone` with pnpm's package cache already warm: clone 6 s · `pnpm install` 2 min 42 s · `pnpm pilot:build` 46 s (84 s with a cold build cache) · `pilot:init` + `pilot:cert` + `pilot:import` + `pilot:check` about 5 s · server up in a few seconds — **about 4 minutes**. Not measured: a truly clean laptop, which also installs Git, Node.js and pnpm and downloads the packages (allow 20–40 minutes on the centre Wi-Fi; do it before the visit).

## 2. Check the encryption

```powershell
manage-bde -status C:      # "Protection Status: Protection On" (run as administrator)
```
On Windows Home: Settings → Privacy & security → Device encryption → On. If neither is on, **stop**: the pilot data must live on an encrypted drive.

## 3. Configure

1. `ipconfig` → note the laptop's **IPv4 Address** on the Wi-Fi (e.g. `192.168.1.15`).
2. Settings → Network & internet → Wi-Fi → the centre network → **Private network**.
3. Copy `apps\pilot\.env.pilot.example` to `apps\pilot\.env.pilot` and set:
   - `PILOT_DATA_DIR` — a folder on the encrypted drive, e.g. `C:\LinkPilot\data`;
   - `PILOT_BIND` — the IPv4 address from step 1.
4. The first time the server starts, Windows Firewall asks about Node.js: allow **Private networks only**.

If the laptop's address changes (router restart), update `PILOT_BIND` and run `pnpm pilot:cert` again (the phones keep working: the CA stays the same).

## 4. Create the pilot

```powershell
pnpm pilot:init --centre "<centre name>" --start 2026-10-10 --end 2026-10-17 --owner "<owner first name>"
pnpm pilot:cert
```
`pilot:init` prints the **owner's PIN once**: write it on paper and hand it to the owner. `pilot:cert` creates the local certificate and prints where the CA file is (`<data>\tls\link-pilot-ca.crt`).

## 5. Import the roster (pseudonymised)

The centre fills two CSV files (templates in [sample/](sample/)):
- `roster.csv`: `group_code, group_name, teacher_first_name, student_code, student_display_name, guardian_label` — first names or nicknames only (add an initial when two share a name: "أحمد س."), guardian labels like "ولي أمر ١", **no phone numbers, no IDs**.
- `schedule.csv`: `group_code, weekday, start_time, end_time` — one row per weekday the group meets (`sat`… or `السبت`…, 24-hour times).

```powershell
pnpm pilot:import roster.csv --schedule schedule.csv            # dry run: summary, warnings, errors
pnpm pilot:import roster.csv --schedule schedule.csv --apply    # only when there are no errors
```
The import refuses duplicate codes, empty fields, unknown groups, groups without a schedule, the same display name twice in one group, and anything with 8+ digits (a phone number or an ID). A backup is taken before it applies.

## 6. Start and stop

```powershell
pnpm pilot:start      # leave this window open; Ctrl+C stops (state saved, backup taken)
pnpm pilot:check      # any time: proves no demo route, demo data or demo code
```
- Owner web on the laptop: **http://127.0.0.1:8443** (or `https://<PILOT_BIND>:8443` from another device).
- Teacher app on phones: **https://<PILOT_BIND>:8444** (after [phone-setup.md](phone-setup.md)).

The server refuses to start if the start-up check finds anything from the demo; read the message, fix, start again.

## 7. First sign-in

1. On the laptop, open the owner web, pick the owner's name, type the PIN.
2. **Staff & access** → add Reception (first name, role) → the PIN appears **once**: hand it over in person.
3. For each teacher (created by the import), press **Set PIN** and hand it over.
4. On each teacher phone: [phone-setup.md](phone-setup.md), then sign in with the name and PIN.

Forgotten PIN: the owner presses **Set a new PIN** in Staff & access. The owner forgot theirs: stop the server, `pnpm pilot:reset-pin "<owner name>"`, start again.

## 8. The daily routine

| When | What |
|---|---|
| Before the first session | Laptop on, `pnpm pilot:start`; open Today on the laptop. |
| After each session | The teacher confirms the record on the phone (attendance by tap; the note typed). |
| During the day | Reception opens **Today**, works each follow-up: draft → tick → approve → **Copy message** → send from the centre's WhatsApp → **I sent it** → later **Log the guardian's reply**. |
| End of day | [daily-check-in.md](daily-check-in.md); `pnpm pilot:metrics` (safe while running). Leave the laptop on or Ctrl+C. |

Backups happen every hour and on every stop (48 kept, in `<data>\backups`). `pnpm pilot:backup` takes one now.

## 9. Backup and restore

```powershell
pnpm pilot:backup                 # now
pnpm pilot:restore                # list backups
pnpm pilot:restore <name>         # server stopped; asks you to type RESTORE; current data is kept aside
```

## 10. If something goes wrong

| Problem | Do |
|---|---|
| "port is in use" | A stuck process from before: PowerShell `Get-NetTCPConnection -LocalPort 8443 -State Listen \| Select OwningProcess`, then `Stop-Process -Id <pid> -Force` (also 8444, 3100). |
| "A pilot server is already running" | Another window runs it. A crashed server's lock clears itself after 90 seconds. |
| A phone cannot open the app | Same Wi-Fi? `PILOT_BIND` still the laptop's address? CA installed and trusted ([phone-setup.md](phone-setup.md))? Fallback: the teacher records on the laptop at http://127.0.0.1:8444 right after the session. |
| "Too many wrong PINs" | Wait 15 minutes, or the owner sets a new PIN. |
| The laptop lost power | Start again: nothing acknowledged is lost (tested by killing the server mid-write). |
| A wrong import | Stop, `pnpm pilot:restore <the before-import backup>`, fix the CSV, import again. |

## 11. End of the pilot

1. `pnpm pilot:metrics` → `docs/pilot/metrics-<date>.md` and `.csv`. Read the dismiss reasons for names before sharing.
2. The end-of-pilot interview ([end-of-pilot-interview.md](end-of-pilot-interview.md)).
3. Stop the server. `pnpm pilot:wipe` → type `DELETE PILOT DATA` → keep the **deletion receipt** (counts only) and give the centre a copy.
4. On each teacher phone: remove the home-screen app, clear the site data for the pilot address, remove the "Link Pilot CA" certificate.

## What is stored where

| Where | What |
|---|---|
| `<data>\state.json` | The pilot state: groups, schedule, pseudonymised students, guardian labels, staff first names, records, follow-ups, messages, notes, PIN hashes, sessions. |
| `<data>\activity.jsonl` | Append-only activity log: ids, dates and actions, plus a readable line that names the pseudonymised student (e.g. "Note saved for مريم") and any dismiss reason staff typed. No message bodies. |
| `<data>\backups\` | 48 copies of both files. |
| `<data>\tls\` | The pilot CA and server certificate and keys. |
| Teacher phones | Drafts and unsent records in browser storage ("not encrypted — placeholder" label) until confirmed. |
| Nowhere | Phone numbers, national IDs, audio (no recording in Part A). |
