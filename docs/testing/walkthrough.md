# Link — hands-on walkthrough · دليل التجربة العملية

For Ahmed: walk through every feature yourself, in Arabic and English. Each step says **what to do → what you should see → what it proves**, with the exact address. Write anything that looks wrong in [findings.md](findings.md).

لأحمد: جرّب كل خاصية بنفسك. كل خطوة فيها **ماذا تفعل ← ماذا سترى ← ماذا تثبت**، مع العنوان بالضبط. اكتب أي شيء غير صحيح في [findings.md](findings.md).

- Every step has an ID (T1.3, O2.5…). Use it in findings.md.
- لكل خطوة رقم (T1.3، O2.5…): استخدمه في findings.md.
- Steps marked **Manual · يدوي** can't be automated (a phone microphone, a 10-minute wait, a terminal command). Every other step is checked by a test that follows this guide click by click: `apps/web/e2e-demo/guide.spec.ts` (tours 1–3) and `apps/pilot/e2e/tour.spec.ts` (tour 4).
- Sample data only. No real names, phones or payments.
- بيانات تجريبية فقط: لا أسماء ولا أرقام ولا مدفوعات حقيقية.

## 0. Before you start · قبل أن تبدأ

| | English | العربية |
|---|---|---|
| Start the demo | In a terminal at `D:\Link_Edu`: `pnpm demo`. Wait until it prints the addresses (about 1 minute). | في الطرفية: `pnpm demo`، وانتظر حتى تظهر العناوين (حوالي دقيقة). |
| Warm it up | In a second terminal: `pnpm demo:warm` (1–2 minutes). Without it, the first owner page and the teacher app each take about a minute to open. | في طرفية ثانية: `pnpm demo:warm` (دقيقة أو دقيقتان)، وإلا تتأخر أول صفحة حوالي دقيقة. |
| Every screen in one page | http://localhost:3000/ar/dev (English: /en/dev). One-click sign-in as each sample user, every screen with its link, status and Figma frame. | صفحة فيها كل الشاشات وزر دخول لكل مستخدم تجريبي. |
| Owner web (centre) | http://localhost:3000/ar/centre | |
| Teacher app (phone size) | http://localhost:8081 (press F12 → phone icon for a phone-sized window) | |
| Parent app | http://localhost:3000/ar/welcome | |
| Demo controls | The amber **Demo controls** button on the dev index, http://localhost:3000/ar/dev (keep it open in a second tab). It plays the outside world: the WhatsApp provider, the parent's phone, the network. Product pages show only the demo banner (Step 2A.6). | زر «Demo controls» الأصفر في صفحة ‎/ar/dev‎ (افتحها في تبويب ثانٍ). |
| Reset | Demo controls → **Reset scenario**. The teacher app keeps its device drafts in the browser: for a clean teacher, use a private window. | للبدء من جديد: Demo controls ← Reset scenario. |
| Speech-to-text | Demo controls → **Speech-to-text: fixture** gives the scripted note below every time. **local Whisper (real)** listens to your own voice. | «fixture» يعطي نفس الملاحظة كل مرة؛ «Whisper» يسمع صوتك الحقيقي. |

**Sample logins · حسابات التجربة (demo):**

| Role · الدور | How · كيف |
|---|---|
| Owner (Tamer Fouad) · المالك | http://localhost:3000/ar/centre → «الدخول كمالك (تامر فؤاد، تجريبي)» |
| Reception (Dina Adel) · الاستقبال | same page → «الدخول كموظفة استقبال (دينا عادل، تجريبي)» |
| Teacher (Ms Salma) · المعلّمة | http://localhost:8081/sign-in → «الدخول باسم أ. سلمى (معلّمة تجريبية)» |
| Parent (Hassan) · وليّ الأمر | http://localhost:3000/ar/welcome → phone `010 0000 0001` → code `123456` |

Phone sign-in for owners and teachers is not built yet (Phase 1, CF-02): the sample buttons stand in for it.

**Pilot practice (tour 4) · تدريب التجربة:** stop nothing else; in a new terminal run `pnpm pilot:practice`. The first time it prints the **owner PIN** (write it down). Owner web: http://127.0.0.1:8443/ar/centre. Teacher app: http://127.0.0.1:8444. When done: Ctrl+C, then `pnpm pilot:practice-wipe`. (This laptop is set up for the laptop only, `PILOT_BIND=127.0.0.1` in `apps/pilot/.env.pilot`. For phones, follow docs/pilot/runbook.md §3.)

## Tour 1 · Teacher · جولة المعلّمة

Demo controls → **Reset scenario** and **Speech-to-text: fixture** first.

**T1.1** · http://localhost:8081/sign-in
- Do: press "Sign in as Ms Salma (sample teacher)".
- افعل: اضغط «الدخول باسم أ. سلمى (معلّمة تجريبية)».
- See: "Your teaching day" with "Record due" for today's session.
- سترى: «يومك التعليمي» وفيه «السجل مطلوب».
- Proves: the teacher starts from the session that needs a record.
- يثبت: المعلّمة تبدأ من الحصة التي تحتاج سجلًا.

**T1.2** · http://localhost:8081/today
- Do: press "Complete session record".
- افعل: اضغط «أكمل سجل الحصة».
- See: "Confirm attendance" with 18 students, **every one "Not recorded"**, nothing selected.
- سترى: «تأكيد الحضور»، و١٨ طالبًا كلهم «غير مسجَّل»، ولا شيء محدّد.
- Rule: nothing is pre-selected; missing data is "Not recorded", never "Absent" (FUP-REC-02).
- القاعدة: لا اختيار مسبق؛ «غير مسجَّل» ليس «غائب».

**T1.3** · same screen · نفس الشاشة
- Do: mark **مريم حسن** "Absent", then press "Save draft".
- افعل: حدّد «مريم حسن» «غائب» ثم «حفظ كمسودة».
- See: "Draft saved. Not confirmed — no rules run on drafts." The other 17 stay "Not recorded".
- سترى: «تم حفظ المسودة. غير مؤكَّدة — القواعد لا تعمل على المسودات.»
- Rule: only confirmed records trigger rules; a draft keeps its gaps (FUP-REC-02 AC2).
- القاعدة: السجلات المؤكَّدة فقط تشغّل القواعد.

**T1.4** · same screen
- Do: press "Mark remaining present", then "Continue to scores".
- افعل: «سجّل الباقين حاضرين» ثم «التالي: الدرجات».
- See: "Any scores to add?" Mariam shows "Absent — no score".
- سترى: «هل توجد درجات لإضافتها؟»، ومريم «غائب — بلا درجة».
- Rule: "mark the rest" is an explicit action, never a default; absence is never a 0 score (FUP-REC-03 AC2).
- القاعدة: الغياب ليس درجة صفر.

**T1.5** · `/record/<id>/scores`
- Do: Assessment "Quiz", maximum `20`, then type `24` for **عمر علي**.
- افعل: التقييم «Quiz»، الدرجة القصوى ٢٠، ثم اكتب ٢٤ لعمر علي.
- See: "24 exceeds the maximum of 20. Correct it — Link never caps a score." The field still says 24, and Continue is disabled.
- سترى: «٢٤ أكبر من الدرجة القصوى ٢٠…»، والحقل ما زال ٢٤، وزر المتابعة معطّل.
- Rule: an out-of-range value is **blocked, never capped** (BR-APR-09).
- القاعدة: القيمة خارج النطاق تُمنع ولا تُعدَّل تلقائيًا.

**T1.6** · same screen
- Do: clear Omar's score (leave it blank), then "Continue to observations".
- افعل: امسح درجة عمر ثم «التالي: الملاحظات».
- See: "Add an observation" with "Record voice note" and a text box.
- سترى: «أضف ملاحظة» وزر «سجّل ملاحظة صوتية».
- Rule: a blank score stays blank (FUP-REC-03 AC2).
- القاعدة: الدرجة الفارغة تبقى فارغة.

**T1.7** · `/record/<id>/observation` → `/record/<id>/voice`
- Do: "Record voice note", then **press and hold** the microphone for 2–3 seconds and release. In Chrome, allow the microphone.
- افعل: «سجّل ملاحظة صوتية» ثم اضغط مطولًا على الميكروفون ثانيتين أو ثلاثًا واتركه.
- See: "Recording" with a timer, then "Listening to your note…", then "Here's what Link understood".
- سترى: «جارٍ التسجيل» ثم «جارٍ الاستماع لملاحظتك…» ثم «هذا ما فهمه Link».
- Rule: nothing is saved until the teacher reviews it (FUP-VOI-01).
- القاعدة: لا يُحفظ شيء قبل المراجعة.
- **Manual · يدوي** on a real phone: the same, with the phone's microphone (the test uses a fake microphone).

**T1.8** · `/record/<id>/understood` (V02)
- Do: read the transcript box, then press "Accept" on **مريم حسن — غائب**.
- افعل: اقرأ النص ثم «قبول» على «مريم حسن — غائب».
- See: the transcript is marked "Receipt only"; the score item says "Check"; the low-confidence item is blank ("Not sure — fill it in").
- سترى: النص «إيصال فقط»، والدرجة «راجِع»، والعنصر غير المؤكد فارغ.
- Rule: AI output is a draft; the transcript is a receipt, never shown to parents (09 §2).
- القاعدة: ناتج الذكاء الاصطناعي مسودة، والنص إيصال فقط.

**T1.9** · `/record/<id>/identity` (T07)
- Do: on the «أحمد» item press "Choose the student".
- افعل: على عنصر «أحمد» اضغط «اختر الطالب».
- See: "Check the student" — "Nothing has been saved", two students (أحمد سمير, أحمد سامي), **none selected**. Pick **أحمد سمير** → "Use أحمد سمير".
- سترى: «تحقّق من الطالب» و«لم يُحفظ شيء» وطالبان بلا اختيار مسبق.
- Rule: Link never guesses a student; ambiguous names are asked (FUP-VOI-04).
- القاعدة: Link لا يخمّن الطالب أبدًا.

**T1.10** · back on V02
- Do: "Accept" the score item; on the blank item type `نراجع قواعد الإشارات الحصة الجاية` and "Use this"; choose "Mark 17 present"; "Add to the record".
- افعل: اقبل الدرجة، واكتب الملاحظة ثم «استخدم هذا»، واختر «سجّل ١٧ حاضرين»، ثم «أضِف إلى السجل».
- See: "Add to the record" stays disabled until every item **and** the unmentioned students are decided; then "Review before saving".
- سترى: الزر معطّل حتى تقرّر كل عنصر.
- Rule: every item is decided on its own; nothing is chosen for the teacher (FUP-VOI-03).
- القاعدة: كل عنصر يُقرَّر وحده.

**T1.11** · `/record/<id>/review` (T05)
- Do: check the counts, then "Confirm & save record".
- افعل: راجع الأعداد ثم «تأكيد وحفظ السجل».
- See: "Session record saved" and "This record raised a follow-up for centre staff" for **مريم** (absent twice in a row).
- سترى: «تم حفظ سجل الحصة» و«هذا السجل أنشأ متابعة لإدارة المركز» لمريم.
- Rule: only a confirmed record triggers rules; a flag starts a review, it predicts nothing (FUP-REC-05/06).
- القاعدة: التنبيه يبدأ مراجعة ولا يتوقّع شيئًا.

**T1.12** · http://localhost:8081/records
- Do: on today's record press "Add a correction" → student **عمر علي** → "Score" → new value `12` → reason `خطأ في الكتابة` → "Save correction".
- افعل: «أضف تصحيحًا» ← عمر علي ← الدرجة ← ١٢ ← السبب ← «حفظ التصحيح».
- See: the record shows "Corrected", the old and new value, the reason, and "Original kept in the history".
- سترى: «مصحَّح» والقيمة القديمة والجديدة والسبب و«الأصل محفوظ في السجل».
- Rule: corrections are new events; the original is never overwritten (FUP-REC-08).
- القاعدة: التصحيح حدث جديد ولا يمحو الأصل.

**T1.13** · http://localhost:8081/today
- Do: Demo controls (on the web page) → **Offline: on**. In the teacher app open a record and record a voice note. Then **Offline: off**.
- افعل: Demo controls ← Offline: on، ثم سجّل ملاحظة صوتية، ثم Offline: off.
- See: "Saved on this device" and "Waiting to upload"; after going back online: "Ready to review".
- سترى: «محفوظة على هذا الجهاز» ثم «جاهزة للمراجعة» بعد عودة الاتصال.
- Rule: a recording survives being offline and uploads by itself (FUP-VOI-01 AC4).
- القاعدة: التسجيل لا يضيع بدون اتصال.

## Tour 2 · Owner and Reception · جولة المالك والاستقبال

Continue after tour 1 (Mariam's follow-up exists). · تابع بعد الجولة الأولى.

**O2.1** · http://localhost:3000/ar/centre
- Do: "Sign in as Reception (Dina Adel, sample)".
- افعل: «الدخول كموظفة استقبال (دينا عادل، تجريبي)».
- See: "Today": Mariam's follow-up due today, Nour's overdue, and "Missing data is not absence".
- سترى: «اليوم» ومتابعة مريم ومتابعة نور المتأخرة.
- Rule: only confirmed records count; missing ≠ absent (FUP-DSH-01).
- القاعدة: «غير مسجَّل» ليس «غائب».

**O2.2** · http://localhost:3000/ar/centre/cen-nour/follow-ups
- Do: open "Follow-ups"; try the "Overdue" filter.
- افعل: افتح «المتابعات» وجرّب «متأخرة».
- See: each row has the reason with dates, the rule and its version, who owns it and when it's due.
- سترى: السبب بالتواريخ والقاعدة وإصدارها والمسؤول.
- Rule: every flag shows its readable rule (FUP-CAS-01).
- القاعدة: كل تنبيه يعرض قاعدته المقروءة.

**O2.3** · `/ar/centre/cen-nour/follow-ups/<Mariam's case>`
- Do: open Mariam's follow-up and read "Why this appeared".
- افعل: افتح متابعة مريم واقرأ «لماذا ظهرت هذه المتابعة».
- See: the reason with both dates, the two absences it comes from ("Attendance • date • Absent"), "Both sessions confirmed by Ms Salma Fathy", "Rule used (v1)" with the rule in words, and "No reason for the absence was recorded".
- سترى: الغيابين بالتواريخ ومن أكّدهما و«القاعدة المستخدمة (الإصدار ١)» بالكلمات.
- Rule: no black box: rule, numbers and sources behind every flag.
- القاعدة: لا صندوق أسود.

**O2.4** · same page → "Ask Link" (demo only · في العرض فقط)
- Do: press "Ask Link", type `اعتمدها وابعتها دلوقتي` and send; then type `ابعت لولي أمر مريم إنها غابت حصتين` and send.
- افعل: اسأل Link أن يرسل فورًا، ثم اطلب منه صياغة رسالة.
- See: the first answer: "Act — needs your approval" and nothing is sent; the second: a **draft** card. Answers are labelled "Demo answer (scripted)".
- سترى: الأولى «إجراء — يحتاج اعتمادك» ولا يُرسل شيء؛ الثانية مسودة.
- Rule: Link only drafts; every message to a parent needs staff approval (FUP-DSH-05).
- القاعدة: Link يصوغ فقط.

**O2.5** · the draft → `/ar/centre/cen-nour/messages/<id>` (A06)
- Do: open the draft. Try "Approve & send" (disabled), then tick "I checked the student, guardian and dates" and approve.
- افعل: افتح المسودة؛ الاعتماد معطّل حتى تضع العلامة.
- See: the facts it's built from, each with its source record; a masked phone; after approval the text is locked ("Locked after approval").
- سترى: الحقائق ومصادرها ورقمًا مخفيًا، والنص مقفل بعد الاعتماد.
- Rule: staff approve every parent message, after checking (FUP-MSG-01/02).
- القاعدة: الموظف يعتمد كل رسالة.

**O2.6** · same page, Demo controls
- Do: Demo controls → "Advance: Sent → Delivered" **twice**.
- افعل: اضغط «Advance: Sent → Delivered» مرتين.
- See: the status history moves to Sent, then Delivered («وصلت»), only after each provider event.
- سترى: الحالة تتغيّر فقط مع كل حدث من المزوّد.
- Rule: never "Delivered" without a provider receipt (BR-APR-11).
- القاعدة: لا «وصلت» بدون إيصال من المزوّد.

**O2.7** · Demo controls → the case
- Do: Demo controls → "Deliver reply …"; open Mariam's follow-up → "Parent replied … — see the next step".
- افعل: «Deliver reply» ثم افتح المتابعة ← «ردّ وليّ الأمر».
- See: a summary of the reply and suggested steps, **none ticked**.
- سترى: ملخص الرد وخطوات مقترحة بلا علامات.
- Rule: a reply never closes a case by itself (FUP-MSG-05, CF-33).
- القاعدة: الرد لا يغلق المتابعة.

**O2.8** · `/ar/centre/cen-nour/follow-ups/<id>/outcome` (A08)
- Do: tick the steps you want and apply; method "Phone", result "Reached"; keep "Keep open until confirmed"; "Save outcome & next step".
- افعل: سجّل النتيجة واترك «أبقِها مفتوحة حتى التأكيد».
- See: "Awaiting confirmation" — the case stays open.
- سترى: «بانتظار التأكيد».
- Rule: sending is not solving; the case stays open until the return is confirmed (FUP-CAS-03).
- القاعدة: الإرسال ليس حلًا.

**O2.9** · Nour's follow-up (Follow-ups → «نور خالد»)
- Do: "Dismiss with a reason" — try without a reason, then write one and confirm; then "Reopen".
- افعل: «أغلق مع ذكر السبب» بدون سبب ثم بسبب، ثم «أعد الفتح».
- See: confirm stays disabled without a reason; "Dismissed with a reason … can be reopened"; reopening brings the actions back.
- سترى: لا إغلاق بدون سبب، ويمكن إعادة الفتح.
- Rule: dismissing needs a reason and stays in the history (FUP-CAS-04).
- القاعدة: الإغلاق يحتاج سببًا.

**O2.10** · http://localhost:3000/ar/centre/cen-nour/rules
- Do: as Reception, change "Consecutive absences" to `3` and save; sign out; sign in as the **owner**, open Rules, "Approve change".
- افعل: الاستقبال يقترح ٣، ثم المالك «وافق على التعديل».
- See: the rule says "Change proposed — waiting for the owner" and stays "Rule v1"; after the owner approves: "Rule v2" with "last 3 scheduled sessions".
- سترى: «تعديل مقترح — بانتظار المالك» ويبقى «القاعدة الإصدار ١» حتى موافقة المالك، ثم «الإصدار ٢».
- Rule: staff propose, only the owner approves; every change is a new version (FUP-RUL-01/02).
- القاعدة: المالك وحده يوافق.

**O2.11** · http://localhost:3000/ar/centre/cen-nour/staff (owner)
- Do: invite a teacher by phone (`010 0000 0077`).
- افعل: «دعوة موظف».
- See: the role matrix (who can see what — "No guardian phone numbers" for teachers) and "Invite pending".
- سترى: جدول الصلاحيات و«الدعوة قيد الانتظار».
- Rule: only the owner invites; roles limit what each person sees (FUP-STF-01).
- القاعدة: المالك وحده يدعو.

**O2.12** · http://localhost:3000/ar/centre/cen-nour/activity
- Do: open "Activity history", filter "Corrections".
- افعل: افتح «سجل النشاط».
- See: "This log can't be edited", weekly counts, the correction of Omar's score.
- سترى: السجل غير قابل للتعديل.
- Rule: every action is an append-only audit event (FUP-DSH-04).
- القاعدة: سجل لا يُمحى.

Voice per teacher and the voice kill switch exist only in the pilot: see L4.6.

## Tour 3 · Parent · جولة وليّ الأمر

Demo controls → **Marketplace flag: on** first (the demo starts with the follow-up pilot only). · شغّل «Marketplace flag» أولًا.

**P3.1** · http://localhost:3000/ar/welcome
- Do: phone `010 0000 0001` → "Send me a code" → try `111111`, then `123456`.
- افعل: الرقم ثم كود خاطئ ثم ١٢٣٤٥٦.
- See: a wrong code says how many tries are left; `123456` signs you in. No password field anywhere.
- سترى: الكود الخاطئ يذكر المحاولات المتبقية.
- Rule: OTP sign-in only, no passwords (MKT-ACC-01, CF-02).
- القاعدة: دخول بالكود فقط.

**P3.2** · http://localhost:3000/ar/search → /ar/search/results
- Do: search Maths near you; open the results; switch map/list.
- افعل: ابحث ثم افتح النتائج.
- See: centres within 5 km by default; a full centre says "Waitlist only".
- سترى: مراكز في نطاق ٥ كم.
- Rule: MKT-DSC-01/02/03.
- القاعدة: البحث يبدأ من الطفل المختار.

**P3.3** · http://localhost:3000/ar/centres/al-nour-maadi
- See: "Each teacher sets their own fee"; only trust badges Link can verify.
- سترى: «كل معلّم يحدد سعره».
- Rule: CF-05, MKT-DSC-04.

**P3.4** · http://localhost:3000/ar/teachers/salma-fathy-maths → "Reserve with …"
- Do: choose the group and the first session, then "Continue to payment".
- افعل: اختر المجموعة والحصة ثم «متابعة للدفع».
- See: seats are shown per session ("2 left").
- سترى: المقاعد لكل حصة.
- Rule: seats are counted per session (MKT-GRP-03).
- القاعدة: المقاعد تُعدّ لكل حصة.

**P3.5** · `/ar/reserve/<id>` (P07) → the mock provider → `/ar/reserve/<id>/done`
- Do: read the plans ("Monthly plan" = card only), the booking fee (EGP 0) and the phone-sharing box (unticked); pay by card → "Simulate a successful payment".
- افعل: ادفع بالبطاقة ← «تجربة دفع ناجح».
- See: no card field inside Link; "Confirming your payment…" first, then "Place reserved!".
- سترى: «جارٍ تأكيد الدفع…» ثم «تم حجز المكان!».
- Rule: no booking fee for parents; card data never touches Link; status changes only when the provider's webhook arrives (CF-06, BR-MNY-06, BR-MNY-12).
- القاعدة: الحالة تتغير فقط عند وصول إشعار المزوّد.

**P3.6** · a second reservation → "Pay for one month only" → "Fawry"
- Do: reserve again (Karim's group: http://localhost:3000/ar/teachers/karim-adel-maths/reserve?group=grp-karim-nour), choose one month and Fawry, pay.
- افعل: احجز مرة ثانية واختر فوري.
- See: a Fawry reference code, "Copy code", and the date it works until (24 hours).
- سترى: كود فوري وصلاحيته ٢٤ ساعة.
- Rule: Fawry for one-off payments; the hold lasts 24 h (BR-PMT-02, OD-09).
- القاعدة: فوري للدفع لمرة واحدة.

**P3.7** · `/ar/reserve/<id>` — **Manual · يدوي** (10 minutes)
- Do: start a card payment, don't pay, wait 10 minutes, reload.
- افعل: ابدأ الدفع وانتظر ١٠ دقائق.
- See: "Your seat hold ran out".
- سترى: «انتهت مهلة الدفع».
- Rule: a card hold lasts 10 minutes (BR-ENR-01). Automated with a shortened hold in `apps/web/e2e/parent.spec.ts` › "hold expired".

**P3.8** · http://localhost:3000/ar/children
- See: the reservations with separate enrolment and refund badges, and "Updates from the centre" with the message approved in tour 2 — **never a draft**.
- سترى: «تحديثات من المركز» بالرسالة المعتمدة فقط.
- Rule: parents see only approved messages (FUP-MSG-08).
- القاعدة: وليّ الأمر يرى المعتمد فقط.

**P3.9** · http://localhost:3000/ar/enrolments/enr-mariam-phys/feedback
- Do: rate the teacher first, then the centre; choose public or private.
- افعل: قيّم المعلّم أولًا ثم المركز.
- See: two separate texts; "Public review" or "Private note".
- سترى: نصّين منفصلين.
- Rule: only verified parents of enrolled students review (MKT-REV-01, CF-27).
- القاعدة: التقييم من أولياء أمور مسجّلين فقط.

## Tour 4 · Pilot (practice centre) · جولة التجربة (مركز التدريب)

**L4.1** · terminal — **Manual · يدوي**
- Do: `pnpm pilot:practice`.
- افعل: شغّل `pnpm pilot:practice`.
- See: "Creating the practice centre…" and the **owner PIN** (once), then the server addresses.
- سترى: رمز المالك مرة واحدة.
- Rule: practice data lives in its own folder and never mixes with the real pilot (4.3). Tested in `apps/pilot/test/practice.test.ts`.

**L4.2** · http://127.0.0.1:8443/ar/centre
- Do: pick the owner's name, type a **wrong** PIN, then the right one.
- افعل: اختر اسم المالك، رمز خاطئ ثم الصحيح.
- See: "Wrong PIN. … tries left, then a 15-minute lock."; the right PIN opens Today. After 5 wrong PINs the person is locked for 15 minutes: even the right PIN then gets "Too many wrong PINs. Try again after …". (Try the lock on a spare person, not the owner.)
- سترى: عدد المحاولات المتبقية؛ بعد ٥ محاولات خاطئة يُقفل الحساب ١٥ دقيقة حتى مع الرمز الصحيح.
- Rule: PIN sign-in with lockout; the browser keeps nothing but an httpOnly cookie (A3).
- القاعدة: قفل بعد محاولات خاطئة.

**L4.3** · http://127.0.0.1:8443/ar/centre/cen-pilot/staff
- Do: "Add a person" → a first name, role Reception → "Add and show their PIN"; for a teacher (e.g. «كريم») press "Set PIN".
- افعل: أضف موظف استقبال وحدّد رمز معلّم.
- See: each PIN is shown **once**; reload and it's gone.
- سترى: الرمز يظهر مرة واحدة فقط.
- Rule: PINs are handed over in person and never shown again (A3).

**L4.4** · http://127.0.0.1:8444 (teacher app)
- Do: pick the teacher, type the PIN; under "Needs you" press "Record this session", then "Mark remaining present", mark one student (e.g. «نور») "Absent", "No assessment this session", "Review session record", "Confirm & save record". Do the same for today's session ("Complete session record"). On the observation step, voice says "Type the note instead".
- افعل: سجّل الحصتين باللمس مع غياب نفس الطالب.
- See: each record saved; after the second absence in a row, "This record raised a follow-up for centre staff".
- سترى: بعد الغياب الثاني متابعة للمركز.
- Rule: voice is off by default and per teacher (4.2); attendance by tap always works.

**L4.5** · http://127.0.0.1:8443 as Reception
- Do: open the follow-up → "Draft parent message" → tick → "Approve (you send it next)" → "Copy message" → "I sent it from the centre's WhatsApp".
- افعل: صِغ ← راجِع ← اعتمد ← انسخ ← «أرسلتها من واتساب المركز».
- See: "Approved — not sent yet", then "Approved — sent by hand by …". The history **never** says "Delivered" or "Read".
- سترى: «أرسلها يدويًا»، ولا «وصلت» أبدًا.
- Rule: never "Delivered" without a provider receipt (A6, BR-APR-11).
- القاعدة: لا «وصلت» بدون إيصال.

**L4.6** · same page → "Log the guardian's reply"
- Do: log the reply (method WhatsApp, result "Replied"), write what you learned, save.
- افعل: «سجّل ردّ وليّ الأمر».
- See: the outcome form pre-set to WhatsApp (manual) / Replied; the case "Awaiting confirmation".
- سترى: «بانتظار التأكيد».
- Rule: the case stays open until the return is confirmed (FUP-CAS-03).

**L4.7** · http://127.0.0.1:8443/ar/centre/cen-pilot/staff — voice card
- See: in practice, voice is off for everyone (practice never records audio). In the real pilot: per teacher, "Consent signed" → "Switch voice on"; "Switch voice off for everyone" is the kill switch.
- سترى: الصوت متوقف دائمًا في التدريب.
- Rule: voice only after signed consent, per teacher; one switch stops it for everyone (4.2). **Manual · يدوي** in the real pilot; automated in `apps/pilot/e2e/voice.spec.ts` (opt-in, needs the models).

**L4.8** · terminal — **Manual · يدوي**
- Do: `pnpm pilot:metrics`.
- افعل: `pnpm pilot:metrics`.
- See: the pilot's numbers for the **real** pilot folder; pointed at the practice folder it refuses.
- سترى: أرقام التجربة الحقيقية فقط.
- Rule: practice never enters the metrics. Tested in `apps/pilot/test/practice.test.ts`.

**L4.9** · terminal — **Manual · يدوي**
- Do: `pnpm pilot:preflight`.
- افعل: `pnpm pilot:preflight`.
- See: one ✅/❌ line per check, each ❌ with its fix in Arabic and English. While the demo runs, port 8090 (the demo's speech service) shows ❌ — that's correct.
- سترى: ✅ أو ❌ مع طريقة الإصلاح.
- Rule: the daily check before the first session (runbook §8). Tested in `apps/pilot/test/preflight.test.ts`.

**L4.10** · terminal — **Manual · يدوي**
- Do: Ctrl+C in the practice window, then `pnpm pilot:practice-wipe`.
- افعل: أوقف الخادم ثم `pnpm pilot:practice-wipe`.
- See: "✔ Practice centre deleted: …". It refuses any folder not marked as practice.
- سترى: حذف مركز التدريب فقط.
- Rule: the real data can't be deleted by mistake. Tested in `apps/pilot/test/practice.test.ts`.

## What to look at besides the steps · ماذا تلاحظ أيضًا

- Arabic: right-to-left, Arabic-Indic digits, names not cut off, phone numbers left-to-right.
- العربية: الاتجاه والأرقام والأسماء.
- Compare with Figma: http://localhost:3000/ar/dev lists each screen's Figma frame.
- قارن مع Figma.
- Note anything ugly, confusing or broken in [findings.md](findings.md), with the step ID and a screenshot.
- سجّل ملاحظاتك.
