# Demo script — the follow-up loop in 3 minutes

The Demo Day path on the shared mock server: A01 → A02 → A03 → V07/V03 → A06/V04 → A09 → V06 → A08/A10, starting with the teacher's voice note. Sample data only (scenario `demo-followup`, docs/14 §5.1). The presenter says the **Say** lines; Arabic first, English when the audience needs it.

## Before you start (2 minutes, off stage)

1. `pnpm demo` → wait for "web 3000 · teacher 8081 · mock 4010".
2. Two windows side by side: the teacher app at `http://localhost:8081` (phone size) and the owner web at `http://localhost:3000/ar/centre` (sign in as **Reception**, code `123456`).
3. Demo controls (amber button on http://localhost:3000/ar/dev, kept open in a second tab) → **Reset scenario**. Check: Phase 2 on, marketplace off. A01 shows Nour as overdue and no case for Mariam yet.
4. Microphone allowed in both browsers. A third tab with the parent PWA at `http://localhost:3000/ar/children` (parent `…0001`).

## The script

| Time | Screen | Do | Say (العربية) | Say (English) |
|---|---|---|---|---|
| 0:00 | Teacher · Today → T04 | Tap "Complete session record", go to Observation, tap the mic. | «الأستاذة سلمى خلّصت الحصة. بدل ما تكتب، بتسجّل ملاحظة صوتية بالعامية.» | "Ms Salma has just finished class. Instead of typing, she records a voice note in Egyptian Arabic." |
| 0:10 | V01 → V02 | Hold to record ~3 s, release. | «Link بيحوّل الصوت لمسودة: مريم غابت، أحمد جاب ١٤ من ٢٠. ده لسه مسودة — مفيش حاجة اتحفظت.» | "Link turns it into a draft: Mariam absent, Ahmed 14 out of 20. It's a draft — nothing is saved yet." |
| 0:25 | T07 | Tap the "أحمد" item, pick **Ahmed Samir**. | «في طالبين اسمهم أحمد. Link مبيخمّنش — بيسأل.» | "Two students are called Ahmed. Link never guesses — it asks." |
| 0:35 | T05 → T06 | Accept the items, mark the students not mentioned as present, Apply, then Confirm. | «المدرّسة هي اللي بتأكّد. السجل المؤكَّد بس هو اللي بيشغّل القواعد — ومريم غابت حصتين ورا بعض.» | "The teacher confirms. Only confirmed records trigger rules — and Mariam has now missed two in a row." |
| 0:50 | Owner · A01 Today | Switch window, refresh. | «في المركز: متابعة جديدة لمريم، متسندة للاستقبال، مستحقة النهارده. والبيانات الناقصة مش غياب.» | "At the centre: a new follow-up for Mariam, assigned to Reception, due today. Missing data is not absence." |
| 1:00 | A03 Case | Open Mariam's case. | «ليه ظهرت؟ القاعدة مكتوبة بالعربي، والحصتين بتواريخهم ومين أكّدهم. مفيش صندوق أسود.» | "Why did it appear? The rule in plain words, both sessions with dates and who confirmed them. No black box." |
| 1:15 | V07/V03 Ask Link | "Ask Link" → mic → say «ابعت لولي أمر مريم إنها غابت حصتين، وإننا عايزين نطمن عليها». | «أطلب بصوتي. المساعد بيكتب مسودة من الحقائق المؤكَّدة بس — ومبيبعتش حاجة.» | "I ask by voice. The assistant drafts from confirmed facts only — and sends nothing." |
| 1:35 | A06/V04 Review | "Review draft". Point at the facts list and the masked phone. Tick, Approve. | «كل جملة ليها مصدر. لازم أراجع وأعلّم إني اتأكدت قبل الاعتماد. بعد الاعتماد الرسالة بتتقفل.» | "Every sentence has a source. I must tick that I checked before approving. After approval the message is locked." |
| 1:55 | A09 | Demo controls → "Advance: Sent → Delivered" twice (queued → sent → delivered). | «الحالة بتتغيّر بس لما مزوّد الرسائل يبلّغ: اتبعتت… وصلت. والإرسال مش حلّ — المتابعة لسه مفتوحة.» | "Status only changes when the provider reports it: sent… delivered. And sending is not solving — the case stays open." |
| 2:10 | Parent · P09 | Switch to the parent tab. | «ولي الأمر بيشوف الرسالة المعتمدة بس — عمره ما بيشوف مسودة.» | "The guardian sees approved messages only — never a draft." |
| 2:20 | V06 Reply | Demo controls → "Deliver reply". Open the reply from the case. | «ولي الأمر ردّ: عندها درس تاني يوم الأربع. Link لخّص الرد واقترح خطوات — ومفيش حاجة متعلّمة لوحدها.» | "The guardian replied: a clash on Wednesdays. Link summarises and suggests steps — nothing is pre-ticked." |
| 2:35 | A08 → A10 | Tick "Check a seat" and "Record outcome", Apply. Choose Phone · Reached, Save. | «بسجّل اللي حصل. المتابعة بتفضل مفتوحة لحد ما النقل يتأكّد.» | "I log what happened. The case stays open until the move is confirmed." |
| 2:50 | A10 | Point at "Awaiting confirmation". | «من ملاحظة صوتية لحد خطوة جاية واضحة — وكل خطوة بموافقة إنسان.» | "From a voice note to a clear next step — and a person approves every step." |
| 3:00 | — | — | — | — |

## If something goes wrong

- **Voice note fails** → in the teacher app's Demo controls check "Speech-to-text down: no"; T04 also accepts a typed note. Say: «لو الصوت وقع، المدرّسة تكتب — مفيش حاجة بتضيع.»
- **A case should look overdue** → Demo controls → **Simulate a new day** (CF-36): Mariam's case turns overdue on A01.
- **Start again** → Demo controls → **Reset scenario** (flags are kept).

Proof that the path works end to end: `apps/web/e2e-demo/walkthrough.spec.ts` (screenshots in `docs/frontend/walkthroughs/batch-6/`).
