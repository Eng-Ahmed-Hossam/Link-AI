# Link — the connected story · القصة المتصلة

One story across the three roles, on the local demo: a teacher rents a Saturday slot at Al Nour Centre, opens a group there, a parent books and pays, Link's fee and commission show on their own lines, the parent reviews after the first session, and — with the Follow-up extra — two absences turn into an approved update to the parent. Every step below is also checked, click by click, by `apps/web/e2e-demo/story.spec.ts`. Screenshots of each step (Arabic): `docs/frontend/walkthroughs/connected-story/` (the numbers in brackets).

قصة واحدة بين الأدوار الثلاثة: معلّمة تستأجر موعد السبت في مركز النور وتفتح مجموعة، ووليّ أمر يحجز ويدفع، ورسوم لينك وعمولته في سطر مستقل، ثم تقييم بعد أول حصة، ومع إضافة المتابعة يتحوّل غيابان إلى تحديث معتمد لوليّ الأمر. كل خطوة يختبرها `story.spec.ts` ضغطة بضغطة.

- Sample data only: no real names, phones or payments. · بيانات تجريبية فقط.
- Write anything that looks wrong in [findings.md](findings.md), with the step number. · اكتب أي ملاحظة في findings.md مع رقم الخطوة.
- English lines quote the English screens (`/en/…`); Arabic lines quote the Arabic screens. · السطور العربية تذكر الأزرار كما تظهر بالعربية.
- Deeper tours of each feature: [feature-tours.md](feature-tours.md). · جولات أعمق لكل خاصية: feature-tours.md.

## 0 · Before you start · قبل أن تبدأ

| | English | العربية |
|---|---|---|
| Start | In a terminal at `D:\Link_Edu`: `pnpm demo`, wait for the addresses (about a minute), then `pnpm demo:warm` in a second terminal. | `pnpm demo` ثم `pnpm demo:warm` في طرفية ثانية. |
| The way in | http://localhost:3000/en/try — three cards: **Parent · Teacher · Centre owner**. Each opens that role's app, signed in as the sample user. | صفحة اختيار الدور: «وليّ أمر · معلّم · صاحب مركز». |
| Switch role | The dark demo banner on every page: **Switch role** goes back to the three cards. Switching never resets the story. | زر «تبديل الدور» في الشريط العلوي، ولا يمسح القصة. |
| Demo tools | In the same banner (local demo only): **Demo tools** opens the controls in a side panel. Also at http://localhost:3000/en/dev. | «Demo tools» في الشريط يفتح لوحة التحكم. |
| Start over | Demo tools → **Reset story**. | Demo tools ثم Reset story. |
| Start at any step | Demo tools → **Jump to step N** → the data is set up so you can start at step N. | Demo tools ثم Jump to step N. |
| Windows | One browser window per role, side by side: the teacher at phone size (F12 → phone icon), the owner full size, the parent at phone size. | نافذة لكل دور. |

**The cast:** Al Nour Centre (Maadi) with 4 halls — Hall A (40 seats), Room 1 (24), Room 2 (30), Room 3 (20, not listed) · Ms Salma Fathy, Maths · the owner, Tamer Fouad · Reception, Dina Adel · the parent, Hassan Mahmoud, with Mariam (Secondary 2) and Youssef (Secondary 1).

**الشخصيات:** مركز النور (المعادي) وفيه ٤ قاعات · أ. سلمى فتحي، رياضيات · المالك تامر فؤاد · الاستقبال دينا عادل · وليّ الأمر حسن محمود، ومعه مريم (الثاني الثانوي) ويوسف (الأول الثانوي).

## 1 · Teacher: rent a Saturday slot · المعلّمة: استئجار موعد السبت

**Start here:** Demo tools → Reset story (or Jump to step 1).

- **Switch to:** http://localhost:3000/en/try → **Teacher** → the teacher app opens on **My groups**.
- **بدّل إلى:** صفحة اختيار الدور ثم «معلّم»، فيفتح تطبيق المعلّم على «مجموعاتي».
- **Address:** http://localhost:8081/rooms (tab **Rooms**).
- **Click:** the card **Room 1 • 24 seats** → **A new group** → **Maths** → **Secondary 2** → students you expect **20** → planned fee **550** → **4:00 PM** → **Sat** → **Send room request**.
- **اضغط:** «قاعة ١»، ثم «مجموعة جديدة»، الرياضيات، الثاني الثانوي، ٢٠ طالبًا، ٥٥٠ ج.م، ٤:٠٠ م، السبت، ثم «إرسال طلب القاعة».
- **You should see:** the rent estimate — your fees, **Centre rent — EGP 250 / session**, **Link commission (5%, illustrative)**, what you keep — then **My room requests** with "Waiting for Al Nour Centre to review" (screens 02–04).
- **سترى:** تقدير الإيجار بسطور منفصلة، ثم «طلبات القاعات» وطلبك «في انتظار مراجعة مركز النور».
- **Why it matters:** the teacher sees the centre's rent and Link's commission before she commits — nothing is hidden in a total.
- **لماذا:** المعلّمة ترى الإيجار والعمولة قبل أن تلتزم.

## 2 · Owner: through the columns, then approve · المالك: من عمود لعمود ثم الموافقة

- **Switch to:** banner **Switch role** → **Centre owner** → the owner's home, **Room schedule**.
- **بدّل إلى:** «تبديل الدور» ثم «صاحب مركز»، فتفتح الصفحة الرئيسية «جدول القاعات».
- **Address:** http://localhost:3000/en/centre/cen-nour/requests (menu **Room requests**).
- **Click:** on Ms Salma's card: **Book a call** → **Book a meeting** → **Approve**. Then menu **Room schedule** → **Sat**.
- **اضغط:** «حدّد مكالمة»، ثم «حدّد مقابلة»، ثم «وافق»، ثم «جدول القاعات» والسبت.
- **You should see:** the card moves Requested → Phone call → Meeting at centre → Approved ("Starts … • rent EGP 250 / session"); on Saturday, Room 1 at 4 PM shows Ms Salma, booked, not started (screens 05–07).
- **سترى:** البطاقة تنتقل حتى «تمت الموافقة»، وفي جدول السبت تظهر قاعة ١ محجوزة باسم أ. سلمى.
- **Why it matters:** the owner decides; approving books the slot on the schedule at once.
- **لماذا:** الموافقة تحجز الموعد في الجدول فورًا.

## 3 · Teacher: open the group · المعلّمة: فتح المجموعة

- **Switch to:** **Switch role** → **Teacher** → **My groups**.
- **Click:** the card **Open your group: Maths • Sec 2** → per month **550**, per session **150**, seats **30** → **Open group**; then seats **24** → **Open group**.
- **اضغط:** بطاقة «افتح مجموعتك»: شهريًا ٥٥٠، للحصة ١٥٠، المقاعد ٣٠، ثم «فتح المجموعة»؛ ثم المقاعد ٢٤ و«فتح المجموعة».
- **You should see:** 30 is refused — "The hall has 24 seats." — then the group appears with both fees (screen 08).
- **سترى:** يُرفض ٣٠ لأن القاعة ٢٤ مقعدًا، ثم تظهر المجموعة بالرسمين.
- **Why it matters:** each teacher sets her own fees, monthly and per session; seats can never exceed the hall.
- **لماذا:** المعلّم يحدّد رسومه، والمقاعد لا تزيد عن سعة القاعة.

## 4 · Parent: find, reserve, pay · وليّ الأمر: البحث والحجز والدفع

- **Switch to:** **Switch role** → **Parent** → **Search**.
- **Click:** **Al Nour Centre** → the new group (Maths • Sec 2, Saturday 4 PM) → **Continue to payment** → **Pay for one month only** → **Pay … & reserve** → on the mock provider page **Simulate a successful payment**.
- **اضغط:** «مركز النور»، ثم مجموعة السبت ٤ م، ثم «متابعة للدفع»، و«ادفع لشهر واحد فقط»، و«ادفع … واحجز»، ثم «تجربة دفع ناجح».
- **Then the Fawry variant:** open the group again → **Change** → **Youssef** → **Continue to payment** → **Pay for one month only** → **Fawry** → **Pay … & reserve**.
- **ثم فوري:** افتح المجموعة مرة أخرى، ثم «تغيير» ويوسف، ثم «فوري».
- **You should see:** "Confirming…" then **Place reserved!** — the seats left go from 24 to 23; with Fawry, a reference code and "Your seat is held for 24 hours" (screens 09–14). No card field anywhere in Link, and no booking fee.
- **سترى:** «تم حجز المكان!» والمقاعد المتاحة تقل واحدًا؛ ومع فوري كود مرجعي والمكان محجوز ٢٤ ساعة. لا حقل بطاقة في لينك ولا رسوم حجز.
- **Why it matters:** parents pay the teacher's fee only, through Link; the seat is counted per session, the moment it is paid or held.
- **لماذا:** وليّ الأمر يدفع رسوم المعلّم فقط، والمقعد يُحسب لكل حصة.

## 5 · Teacher: the new seat and the earnings · المعلّمة: التسجيل الجديد والأرباح

- **Switch to:** **Switch role** → **Teacher**.
- **Click:** **My groups** → **New enrolments**; then the tab **Earnings**.
- **اضغط:** «مجموعاتي» ثم «التسجيلات الجديدة»، ثم تبويب «الأرباح».
- **You should see:** Mariam's paid month (and Youssef held with Fawry); in Earnings: parents paid, **Link commission (5%, illustrative)**, the rent to Al Nour • Room 1 on its own line, the next payout on Thursday (screens 15–16).
- **سترى:** تسجيل مريم المدفوع، وفي الأرباح: ما دفعه أولياء الأمور، وعمولة لينك، وإيجار المركز، كلٌّ في سطر، والتحويل يوم الخميس.
- **Why it matters:** the teacher sees exactly what Link and the centre take, line by line.
- **لماذا:** المعلّمة ترى ما يأخذه لينك والمركز سطرًا بسطر.

## 6 · Owner: rent income · المالك: دخل الإيجار

- **Switch to:** **Switch role** → **Centre owner**.
- **Address:** http://localhost:3000/en/centre/cen-nour/rent-income (menu **Rent income**).
- **You should see:** a row Ms Salma Fathy • Room 1 • EGP 250 / session, the **Link fee (5%)** column, and "To you" = rent − fee; the totals are the sum of the rows (screen 17).
- **سترى:** صف أ. سلمى في قاعة ١، وعمود «رسوم لينك»، والصافي = الإيجار ناقص الرسوم.
- **Why it matters:** the centre's net is computed from the data, never typed; Link's marketing fee is its own line.
- **لماذا:** الصافي محسوب من البيانات، ورسوم لينك في عمود مستقل.

## 7 · Parent reviews, owner replies · وليّ الأمر يقيّم والمالك يرد

**First:** Demo tools → **Simulate first session done** (the story's first Saturday has taken place). Or Jump to step 7.

- **Switch to:** **Switch role** → **Parent** → **My children** → choose **Mariam**.
- **Click:** on Maths with Ms Salma: **Leave feedback** → 5 stars for Ms Salma → a sentence → **Submit feedback**.
- **اضغط:** «أبنائي» ومريم، ثم «اكتب رأيك»، ٥ نجوم، جملة، ثم «إرسال الرأي».
- **Then the owner:** menu **Reviews** → **Reply publicly** on the new review → a sentence → **Post reply**.
- **ثم المالك:** «التقييمات»، ثم «ردّ علنًا»، ثم «نشر الرد».
- **You should see:** "Thank you"; the owner's reply under the review; there is no delete or hide (screens 18–19).
- **سترى:** «شكرًا لك»، ثم رد المالك تحت التقييم؛ لا يوجد حذف أو إخفاء.
- **Why it matters:** only a parent whose child has attended can review, and a centre can reply or report — never delete.
- **لماذا:** التقييم لوليّ أمر حضر ابنه، والمركز يرد أو يبلّغ ولا يحذف.

## 8 · Follow-up, the paid extra · المتابعة، الإضافة المدفوعة

- **Teacher:** **Switch role** → **Teacher** → tab **Follow-up** → **Complete session record** (Sec 2 · Maths) → Mariam **Absent** → next → next → type a note → review → **Confirm**.
- **المعلّمة:** تبويب «المتابعة»، ثم «أكمل سجل الحصة»، مريم غائبة، اكتب ملاحظة، ثم أكّد.
- **Then:** Demo tools → **Simulate next session done**, and record the second Saturday the same way (Mariam absent again).
- **ثم:** Demo tools ثم Simulate next session done، وسجّل الحصة الثانية بنفس الطريقة.
- **Owner:** **Switch role** → **Centre owner** → menu **Today**: Mariam's follow-up, "absent from 2 consecutive sessions", assigned to **Reception** (screen 21).
- **المالك:** «اليوم»: متابعة مريم «غابت عن حصتين متتاليتين» مسندة إلى «الاستقبال».
- **Reception:** http://localhost:3000/en/centre in a private window → **Sign in as Reception (Dina Adel, sample)** → Mariam's follow-up → **Draft parent message** → tick **I checked the student, guardian and dates** → **Approve & send** (screen 22). Then Demo tools → **Advance: Sent → Delivered** twice.
- **الاستقبال:** «صِغ رسالة لوليّ الأمر»، ثم علامة المراجعة، ثم «اعتمد وأرسل».
- **Parent:** **My children** → **Updates from the centre**: the approved message (screen 23).
- **وليّ الأمر:** «أبنائي» ثم «تحديثات من المركز».
- **Reception:** the follow-up → **Record the outcome** → by phone, reached → **Save outcome & next step** (screen 24).
- **الاستقبال:** «سجّل النتيجة»، بالهاتف، تم التواصل، ثم «احفظ النتيجة والخطوة التالية».
- **Why it matters:** only confirmed records trigger rules; every flag shows its rule and dates; nothing reaches a parent until staff approve it.
- **لماذا:** القواعد تعمل على السجلات المؤكّدة فقط، ولا يصل شيء لوليّ الأمر دون اعتماد.

## 9 · Follow-up extra off · إيقاف إضافة المتابعة

- **Click:** Demo tools → **Follow-up extra: on** (turns it off for Al Nour).
- **اضغط:** Demo tools ثم Follow-up extra.
- **You should see:** the owner's menu keeps the Marketplace items and loses the Follow-up group; the teacher's **Follow-up** tab is gone and its page opens My groups; the parent's **Updates from the centre** is gone; the group is still bookable on the centre's page (screens 25–27).
- **سترى:** تختفي عناصر المتابعة عند المالك والمعلّمة ووليّ الأمر، ويبقى السوق يعمل.
- **Why it matters:** Follow-up is a paid extra per centre; the marketplace never depends on it.
- **لماذا:** المتابعة إضافة مدفوعة لكل مركز، والسوق لا يعتمد عليها.
