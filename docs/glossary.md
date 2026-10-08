# Glossary — English ↔ Arabic

Use these terms in code, UI copy and docs. In the **Source** column, "Figma" means the Arabic is taken from the designs. "Proposed" means a native copywriter must confirm it before release.

Code always uses the English term, in `snake_case` in the database and `camelCase` in TypeScript.

## People and places

| English | Arabic | Code name | Notes | Source |
|---|---|---|---|---|
| Centre | سنتر / مركز | `centre` | Colloquial: سنتر. Formal UI copy uses مركز (Figma: "مركز النور"). | Figma |
| Centre owner | صاحب السنتر / المالك | `centre_owner` | Figma uses "مساحة المالك" (owner workspace). | Figma |
| Centre staff / reception | الموظفين / الاستقبال | `centre_staff` | | Figma |
| Teacher | المعلّم / المدرس | `teacher` | Figma uses المعلّم. Speech and search also use مستر / ميس. | Figma |
| Parent / guardian | وليّ الأمر | `guardian` | A parent account holds a guardian profile. | Figma |
| Student / child | الطالب / الابن | `student` | | Figma |
| Link (brand) | لينك | — | Arabic text always says «لينك» (website and apps); the logo keeps the Latin "Link" wordmark. Decided 2026-10-08. | Decided |
| Link ops | فريق لينك | `link_ops` | Internal team. | Proposed |
| Hall | قاعة | `room` | Designs use "room", "hall" and "Hall A". Code uses `room`; UI copy uses "hall" (قاعة). | Proposed |

## Marketplace and money

| English | Arabic | Code name | Notes | Source |
|---|---|---|---|---|
| Group | مجموعة | `group` | A class a teacher runs in one hall slot. | Figma ("مجموعاتي") |
| Session | حصة | `group_session` | One meeting of a group. Statuses: `scheduled`, `held` (automatic at its end time), `cancelled` (in advance), `not_held` ("did not take place", لم تُعقد). Seats are counted per session. | Figma ("الحصص") |
| Weekly slot | ميعاد أسبوعي | `weekly_slot` | Day + start time + end time. | Proposed |
| Hall booking | حجز قاعة | `room_booking` | A teacher's approved weekly slot in a hall. | Proposed |
| Room request | طلب قاعة | `teacher_application` | A booking request before approval (C06). | Proposed |
| Enrolment / reservation | حجز مكان | `enrolment` | States: `pending_payment`, `awaiting_teacher`, `confirmed`, `past_due`, `cancelled`, `expired`, `declined`, `ended`. | Proposed |
| Expired (enrolment) | انتهت مهلة الدفع | `expired` | The seat hold ran out unpaid. Late money can still confirm it if a seat is free. | Proposed |
| Seat | مكان | `seat` | Counted per session. | Proposed |
| Seat hold | حجز مؤقت للمكان | `seat_hold` | Covers every session the plan covers. 10 min for card and wallet, 24 h for Fawry. | Proposed |
| Waitlist | قائمة الانتظار | `waitlist_entry` | | Proposed |
| Waitlist offer | عرض مكان من قائمة الانتظار | `waitlist_entry.status = offered` | Reserves the seat for 24 h and counts as a hold; accepted with `POST /v1/waitlist/{id}/accept`. | Proposed |
| Monthly plan (parent) | خطة شهرية | `payment_plan = monthly_recurring` | Parent copy says "monthly plan", never "subscription" (P07 says "Monthly subscription", CF-06). | Proposed |
| Subscription (paid extras) | اشتراك الخدمات الإضافية | `subscription` | Only for paid extras (OD-05). Never used for a parent's plan. | Proposed |
| Fee (per session / per month) | سعر الحصة / السعر الشهري | `session_fee_pt` / `monthly_fee_pt` | | Proposed |
| Lead | طلب تواصل | `lead` | From the landing page's "Get started" form; not an account. | Proposed |
| Rent | إيجار القاعة | `rent` | | Proposed |
| Rent rule | طريقة حساب الإيجار | `rent_rule` | Fixed per session / per student per session / % of fees. | Proposed |
| Booking commission | عمولة الحجز | `booking_commission` | Link's % of each student payment, taken from the teacher. | Proposed |
| Hall-rent marketing fee | رسوم التسويق على الإيجار | `rent_fee` | Link's % of rent, taken from the centre. | Proposed |
| Payout | تحويل الأرباح | `payout` | | Proposed |
| Refund | استرداد | `refund` | | Proposed |
| Balance | الرصيد | `balance` | | Proposed |
| Piaster | قرش | `_pt` suffix | 1 EGP = 100 piasters. | — |
| Fawry | فوري | `fawry` | Pay cash with a reference code at a Fawry outlet. | — |
| Mobile wallet | محفظة إلكترونية | `wallet` | e.g. Vodafone Cash. | — |
| Hosted checkout | صفحة دفع آمنة | `checkout_session` | The payment provider's page. Card data never touches Link. | Proposed |
| Review (public) | تقييم | `review` (visibility `public`) | | Proposed |
| Private feedback | ملاحظة خاصة | `review` (visibility `private`) | | Proposed |
| Verified | موثّق | `verification = verified` | | Proposed |

## Follow-up (Phase 2)

| English | Arabic | Code name | Notes | Source |
|---|---|---|---|---|
| Record (session record) | سجل الحصة | `session_record` / `record_entry` | The **confirmed facts** per student per session. | Figma ("سجلات مكتملة") |
| Draft | مسودة | `status = draft` | | Figma |
| Voice note | ملاحظة صوتية | `voice_note` | Audio. Deleted after 30 days. | Proposed |
| Transcript | النص الحرفي للتسجيل | `voice_notes.transcript` | Word-for-word text. A receipt only — never shown to parents and never used in analytics. | Proposed |
| Attendance: present / absent / late / not recorded | حاضر / غائب / متأخر / غير مسجّل | `present` / `absent` / `late` / `not_recorded` | "Not recorded" is **not** absent. | Figma |
| Score | الدرجة | `score` | | Figma |
| Participation | المشاركة | `participation` | `low` / `normal` / `high`. | Proposed |
| Observation / note | ملاحظة | `observation` / `note` | | Figma |
| Note topics: understanding / needs revisit / behaviour / positive / absence context | الفهم / يحتاج مراجعة / السلوك / إيجابية / سبب الغياب | `understanding` / `needs_revisit` / `behaviour` / `positive` / `absence_context` | | Figma (AR05) |
| Rule | قاعدة | `rule` | | Figma ("القواعد والإعدادات") |
| Flag (signal) | تنبيه | `signal` | Raised when a readable rule matches confirmed records. One open flag per rule, student, group and topic. | Proposed |
| Score decline (Phase 2 rule) | تراجع الدرجات | rule `score_decline` | The simple rule on comparable assessments (A07). Not the Phase 3 decline alert. | Proposed |
| Case / follow-up | متابعة | `case` | Figma: "المتابعات". | Figma |
| Contact attempt | محاولة تواصل | `case_attempt` | | Proposed |
| Outcome | النتيجة | `outcome` | | Proposed |
| Parent message | رسالة لوليّ الأمر | `message` | | Figma |
| Activity history (audit log) | سجل النشاط | `audit_events` | | Figma |
| Ask Link (assistant) | اسأل لينك | `assistant` | | Proposed |

## Analytics (Phase 3)

| English | Arabic | Code name | Notes | Source |
|---|---|---|---|---|
| Topic map | خريطة الموضوعات | `topics` (tree) | Subject → Unit → Topic. | Proposed |
| Unit | وحدة | `topics` (`kind = unit`) | | Proposed |
| Topic | موضوع / درس | `topics` (`kind = topic`) | | Proposed |
| Quiz / assessment | اختبار / كويز | `assessment` | | Proposed |
| Topic score | درجة الموضوع | `topic_mastery.score` | 0–100. Teachers only. | Proposed |
| Band: Strong / Developing / Needs work / Not enough data | متمكّن / في تقدّم / يحتاج تدريب / بيانات غير كافية | `strong` / `developing` / `needs_work` / `not_enough_data` | Parents see only the band. | Proposed |
| Decline alert | تنبيه تراجع | `signal` (rule `score_decline_class_adjusted`) | The class-adjusted Phase 3 rule (AN01, OD-35). Computed by the trend worker. | Proposed |
| Weekly focus plan | خطة التركيز الأسبوعية | `focus_plan` | Drafted by Link, approved by the teacher. | Proposed |
| Subject report | تقرير المادة | `subject_report` | | Proposed |
| Class heatmap | خريطة الفصل | — | Students × topics. | Proposed |

## Curricula and school years

The names below are a proposal (OD-07). Ops edit them as reference data.

| English | Arabic | Code (`curricula.code`) | Example years (unconfirmed) |
|---|---|---|---|
| National (public / government) | المنهج الوطني (الحكومي) | `NATIONAL` | Primary 1–6 (الصف الأول–السادس الابتدائي), Preparatory 1–3 (الإعدادي), Secondary 1–3 (الأول–الثالث الثانوي) |
| IGCSE (British) | المنهج البريطاني IGCSE | `IGCSE` | Year 7–Year 13 (Y10–Y11 = IGCSE; Y12–Y13 = AS/A level) |
| American | المنهج الأمريكي | `AMERICAN` | Grade 1–Grade 12 |
| Nile | منهج النيل | `NILE` | TBD with the education advisor |

## Engineering terms

| Term | Meaning |
|---|---|
| Tenant | A centre. All centre data is isolated by `centre_id` with Postgres row-level security (RLS). |
| Outbox | A table that is written in the same transaction as the business change. A relay publishes its rows as events. |
| Inbox | A table each consumer uses to skip events it has already handled. |
| Idempotency key | A client-chosen key. A retry with the same key returns the first result and never writes twice. |
| `NULLS NOT DISTINCT` | A PostgreSQL 15+ unique-constraint option that treats NULLs as equal. Used wherever a unique key has a nullable column. |
| Permission bundle | A named set of ops permissions granted together: "agent" (`ops.verify` + `ops.moderate`) and "finance" (`ops.finance`). The role is always `link_ops` (OD-37). |
| Name token | `<S1>` (matched student), `<A1>` (ambiguous), `<U1>` (unknown). Replaces every person name before an LLM call. |
| Posting | One balanced ledger transaction (its debits equal its credits). |
| Saga | A multi-step flow with compensation steps (hold seat → pay → confirm, or release and refund). |
