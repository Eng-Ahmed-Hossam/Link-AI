# Pilot go / no-go checklist

For Ahmed. The pilot starts only when every line is ✅. **Done** means built, tested and documented in this repository. **Waiting on Ahmed** means a decision or a real-world step only Ahmed can do. Updated 2026-10-06.

## The product

| # | Item | Status | Where |
|---|---|---|---|
| 1 | The follow-up loop on one laptop:<br>• record → rule → follow-up → message copied → sent from the centre's WhatsApp by hand → outcome logged;<br>• PIN sign-in, hourly backups, restore, wipe. | ✅ Done | [runbook.md](runbook.md), ADR-0008; pilot e2e (6) |
| 2 | No demo data, routes, users or code in the pilot (start-up check). | ✅ Done | `pnpm pilot:check`, part of the preflight |
| 3 | `pnpm pilot:preflight`: ✅/❌ per item, with fixes in Arabic and English. | ✅ Done, all ✅ on the build laptop | runbook §8 |
| 4 | Practice centre for training, separate from the real data (`pilot:practice` / `pilot:practice-wipe`). | ✅ Done | [day-one-training.md](day-one-training.md) |
| 5 | Staff quick guides (teacher, Reception, owner), Arabic first, printable A4 PDFs. | ✅ Done (drafts) | `docs/pilot/guides/*.pdf` |
| 6 | Voice notes:<br>• on the laptop only;<br>• **off by default**;<br>• the owner switches them on per teacher, after consent;<br>• kill switch;<br>• encrypted audio, deleted after 30 days or at the pilot's end;<br>• scores always "check". | ✅ Done | ADR-0007; pilot voice tests and the voice e2e |
| 7 | Speech pipeline with the NLP core round 3. Text-only gold v1: 0/51 wrong students, 25/25 scores. | ✅ Done (synthetic) | [accuracy.md](accuracy.md), [docs/ai/link-nlp.md](../ai/link-nlp.md) |
| 8 | Tools ready for the team's recordings:<br>• `pnpm ai:ingest-recordings`;<br>• the audio eval;<br>• calibration (report only). | ✅ Done, waiting for recordings | accuracy.md "The gate" |

## Waiting on Ahmed

| # | Item | Status | What to do |
|---|---|---|---|
| 9 | **The centre** chosen; the centre agreement reviewed and signed. | ⏳ Waiting on Ahmed | [centre-agreement.md](centre-agreement.md) (draft, not legal advice) |
| 10 | **Pilot dates** (start, end; 5–7 days). | ⏳ Waiting on Ahmed | `pnpm pilot:init --start … --end …` |
| 11 | **Consent pack approved in writing** (OD-52): teacher consent, guardian notice. Nothing real is recorded before this. | ⏳ Waiting on Ahmed | [teacher-consent.md](teacher-consent.md), [guardian-notice.md](guardian-notice.md) |
| 12 | **Pilot laptop hardware**:<br>• NVIDIA GPU or not;<br>• BitLocker or Device encryption on;<br>• `pnpm pilot:preflight` all ✅ **on that laptop**.<br>Without a GPU, use the rules-only profile (recommended, 37 s per 1-minute note). | ⏳ Waiting on Ahmed | runbook §1b, ADR-0007 "CPU-only profile" |
| 13 | **Roster and schedule CSVs** from the centre: first names or nicknames only, no phones, no IDs. | ⏳ Waiting on Ahmed | runbook §5, `docs/pilot/sample/` |
| 14 | **Phone test** for each teacher phone, on the centre Wi-Fi (not guest Wi-Fi):<br>• the CA certificate installed;<br>• the app on the home screen;<br>• sign-in works;<br>• one practice record confirmed. | ⏳ Waiting on Ahmed | [phone-setup.md](phone-setup.md) |
| 15 | **Arabic review** of the screen strings (most seen first), the three guides and the 35 gold scripts, in one sitting. | ⏳ Waiting on Ahmed | [arabic-review.md](arabic-review.md) → `pnpm i18n:apply-review`, `link_eval apply-review` |
| 16 | **The guides' blank** (the pilot contact's phone number), then `pnpm pilot:guides`. | ⏳ Waiting on Ahmed | quick guides |
| 17 | **Team recordings** of the 35 gold v1 scripts, by consenting team members. Then `pnpm ai:ingest-recordings <folder>` and `pnpm ai:eval --mode audio … --calibrate`. | ⏳ Waiting on Ahmed | evals/gold/RECORDING_GUIDE.md |
| 18 | **Voice per teacher:** switch on only if the recordings show **0 wrong students**. Pre-filled scores also need **≥ 95% score exact match**. Until then, voice stays off, or on only with Ahmed's explicit go-ahead. | ⏳ Waiting on recordings and Ahmed | accuracy.md "The gate" |
| 19 | **Day-one training** booked (25 minutes, the whole staff). | ⏳ Waiting on Ahmed | [day-one-training.md](day-one-training.md) |
| 20 | **Models downloaded before the visit**, if voice is used: about 11 GB with qwen3:8b, or about 2 GB for rules only. | ⏳ Waiting on Ahmed (depends on 12) | runbook §1b |

**Go** when 9–17 and 19 are ✅. Voice (18, 20) can start later, per teacher. The pilot runs without voice: attendance, scores and notes by tap.
