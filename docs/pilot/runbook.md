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

## 1b. Voice notes: speech-to-text and the LLM (Part B) — download before you go

Voice notes run **entirely on this laptop** (OD-51): local Whisper (faster-whisper) turns the audio into text and a local LLM (Ollama) helps with observations. Nothing is sent to any online service. About **11 GB of downloads**: do them at home or the office, not on the centre Wi-Fi.

| What | Size | Command |
|---|---|---|
| uv (Python tool) | ~30 MB | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| ai-service Python packages | ~1.5 GB with the GPU libraries, ~0.4 GB without | `uv sync --directory apps/ai-service` (add `--extra gpu` only on a laptop with an NVIDIA card) |
| Whisper models | ~1.6 GB (`large-v3-turbo`, the default) · +1.6 GB (`egy-turbo-ft`) · +3 GB (`large-v3`) | `pnpm ai:models large-v3-turbo` (or no name for all three; resumable) |
| Ollama | ~1 GB | install from ollama.com (Windows installer); it runs in the background |
| The LLM | ~5.2 GB (`qwen3:8b`) | `ollama pull qwen3:8b` |

Check before the visit (no internet needed after this):
```powershell
ollama list                                            # qwen3:8b is listed
uv --directory apps/ai-service run pytest -q           # ai-service tests pass
pnpm ai:bench --models large-v3-turbo --devices cpu     # optional: this laptop's speed (writes apps/ai-service/bench/out)
```

Make voice available on the laptop: add `PILOT_VOICE=1` to `apps\pilot\.env.pilot`. `pnpm pilot:start` then also starts ai-service on 127.0.0.1 (never the LAN) with a fresh shared token.

**Voice stays off for every teacher until the owner switches it on, one teacher at a time.** In Staff & access:
1. «الموافقة موقّعة» ("Consent signed") once the teacher has signed the voice consent. The date is shown (OD-52).
2. «تشغيل الصوت» ("Switch voice on") for that teacher.

Without both, the teacher sees "Type the note instead". Two more controls:
- **Withdrawing consent** deletes that teacher's recordings and their text at once, and switches voice off for them.
- **«إيقاف الصوت للجميع» ("Switch voice off for everyone")** is the kill switch. Teachers type their notes, and notes still waiting are deleted, never processed. «إعادة تشغيل الصوت» ("Switch voice back on") brings it back for new notes only.

Before switching voice on for a teacher, see the gate in [accuracy.md](accuracy.md): 0 wrong students on the team's recordings.

Speed (measured on the build laptop, i7-9750H, 16 GB; a 60-second note): `large-v3-turbo` on the CPU about **43 s**, on an RTX 2070 about **3 s**; the LLM step adds 3–14 s on the GPU. **On a laptop without an NVIDIA GPU** (measured with the GPU switched off, [ADR-0007](../adr/ADR-0007-local-speech-to-text-and-llm.md) "CPU-only laptop profile"), choose one in `apps\pilot\.env.pilot`:
- **Rules only, about 37 s per 60-second note (recommended).** Attendance, late minutes, scores and participation, with the same accuracy as with an LLM (ADR-0007, round 3); no observations. Set `MODEL_ROUTING_CONFIG={"llm":{"provider":"none"}}`.
- **`qwen3:4b`, 60–100 s per note,** adding observations only. Run `ollama pull qwen3:4b` (2.5 GB) and set `MODEL_ROUTING_CONFIG={"llm":{"model":"qwen3:4b"}}`.

`qwen3:8b` on the CPU runs out of time on a 60-second note. Voice scores are always shown as "check" in the pilot (never pre-filled). A note waits at most 3 minutes; after that the teacher sees "Type the note instead" and can try again (the audio is kept). Recordings are encrypted on the laptop and deleted 30 days after upload or at the end of the pilot, whichever is first.

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
| Before the first session | Laptop on. **`pnpm pilot:preflight`**: every line must be ✅ (each ❌ prints its fix in Arabic and English; `--quick` skips the voice trial). Then `pnpm pilot:start`, and open Today on the laptop. |
| After each session | The teacher confirms the record on the phone (attendance by tap; the note typed). |
| During the day | Reception opens **Today**, works each follow-up: draft → tick → approve → **Copy message** → send from the centre's WhatsApp → **I sent it** → later **Log the guardian's reply**. |
| End of day | [daily-check-in.md](daily-check-in.md); `pnpm pilot:metrics` (safe while running). Leave the laptop on or Ctrl+C. |

Backups happen every hour and on every stop (48 kept, in `<data>\backups`). `pnpm pilot:backup` takes one now.

## 8b. Day one: training on the practice centre

Run [day-one-training.md](day-one-training.md) (25 minutes) **before** the real start. Commands:
- `pnpm pilot:practice` creates a practice centre («مركز تدريب») next to the real data, with the synthetic sample roster, and starts it on the usual addresses (voice always off).
- Ctrl+C when done, then `pnpm pilot:practice-wipe`, which deletes only a folder marked as practice.

The practice data never mixes with the real data, and `pilot:metrics` refuses it. Print the guides with `pnpm pilot:guides` (`docs/pilot/guides/*.pdf`):
- [quick-guide-teacher.md](quick-guide-teacher.md);
- [quick-guide-reception.md](quick-guide-reception.md);
- [quick-guide-owner.md](quick-guide-owner.md).

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
| `<data>\audio\` | Voice recordings (Part B), **encrypted** (AES-256-GCM) with the key in `<data>\keys\`; deleted 30 days after upload or at the pilot's end. |
| `<data>\ai-usage.jsonl` | One line per speech-to-text / LLM call: task, model, data class, seconds. No text, no names. |
| Teacher phones | Drafts and unsent records in browser storage ("not encrypted — placeholder" label) until confirmed. |
| Nowhere else | Phone numbers, national IDs. Audio and transcripts never leave the laptop (ai-service runs here). |
