# تدريب اليوم الأول (٢٥ دقيقة) · Day-one training (25 minutes)

For Ahmed, to run with the owner, Reception and the 1–2 teachers on the first morning. Everything happens in the **practice centre** («مركز تدريب»), with the synthetic sample roster, never in the real data. Speak Arabic; the quotes are the screens' own words.

## Before the session (10 minutes, alone)

1. Stop the real server if it runs (Ctrl+C in its window).
2. Run `pnpm pilot:practice`. The first time, it creates the practice centre next to the real data and prints the **owner PIN**: write it down. Then it starts on the usual addresses, so the phones work as they are, and voice is always off.
3. Print the three quick guides (`pnpm pilot:guides` → `docs/pilot/guides/*.pdf`): one per person.
4. Have one teacher phone ready, already set up ([phone-setup.md](phone-setup.md)).

## The session

| Min | Who | What (in the practice centre) | Point to make |
|---|---|---|---|
| 0–3 | All | Why we are here: the follow-up loop on one page. A teacher confirms a session → a rule raises a follow-up → Reception contacts the guardian from the centre's WhatsApp → the outcome is logged. | Nothing reaches a parent without staff approval. No phone numbers live in Link. |
| 3–7 | Owner | «الموظفون والصلاحيات»: add Reception and a teacher → «أضف واعرض الرمز» → hand each PIN over in person. | The PIN is shown **once**. |
| 7–13 | Teacher (on the phone) | Sign in → «أكمل سجل الحصة» → mark attendance with **one student «غائب»** and leave one unmarked → a score for one student → a short note → «مراجعة قبل الحفظ» → «تأكيد وحفظ السجل». Then do the same for the **previous** session with the same student absent. | «غير مسجَّل» is not «غائب». Only confirmed records count. |
| 13–20 | Reception (laptop) | «اليوم» → the new follow-up → «لماذا ظهرت هذه المتابعة» → «صِغ رسالة لوليّ الأمر» → tick → «اعتمد (ثم ترسلها أنت)» → «انسخ الرسالة» → (pretend to send it from WhatsApp) → «أرسلتها من واتساب المركز» → «سجّل ردّ وليّ الأمر» with a made-up reply → «احفظ النتيجة والخطوة التالية». | The follow-up stays open after sending: «محاولة التواصل ليست حلًا». |
| 20–22 | Reception | Open a second follow-up and «أغلق مع ذكر السبب». | A reason is required, with no phone numbers or private details in it. |
| 22–24 | Owner | «القواعد والإعدادات» (show «مفعّلة/متوقفة»). «سجل النشاط»: everything they just did is there. The voice card: voice is off by default and switched on per teacher, after the signed consent (it stays off in the practice centre). | Nobody can edit the activity history. |
| 24–25 | All | Questions. Who to call. The daily check-in at the end of each day. | |

## After the session

1. Ctrl+C to stop the practice server.
2. `pnpm pilot:practice-wipe`: deletes the practice centre. It refuses any folder that is not marked as practice, so the real data cannot be deleted by mistake.
3. `pnpm pilot:preflight` → all ✅, then `pnpm pilot:start` for the real pilot.

Practice data never mixes with the real data:
- separate folder;
- `pilot:metrics` refuses the practice folder;
- voice is off there;
- tested in `apps/pilot/test/practice.test.ts`.

The staff will see the practice centre's name («مركز تدريب») in the header, not the real centre's.
