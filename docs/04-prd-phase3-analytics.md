# 04 · PRD — Phase 3: Paid extras — student analytics

**Goal:** show each student's strengths and weak spots by topic, warn early when a student slips, and send parents a short, teacher-approved "where to focus this week" plan.

**Gating:** a paid-extras feature flag (OD-05). Phase 3 needs Phase 2 confirmed records.

**Principles**
- Analytics read **only confirmed records**, never transcripts (BR-APR-05, BR-APR-08).
- Every number can be explained and traced to its source records (BR-APR-04).
- Teachers see the number. Parents see only the band (BR-DAT-06).
- Teacher notes appear **next to** a score and never change it.
- No labels about ability. No comparing a student with named classmates in anything a parent sees.

Diagrams (Eraser): **08** Student analytics loop and **09** Topic score calculation. IDs are in the [README](../README.md).

---

## 1. Topic maps — `ANL-TOP`

### ANL-TOP-01 · Topic map · AN03
As a teacher, I want my subject split into units and topics, so that quizzes and notes can be tagged.
- AC1: A tree: **Subject → Unit → Topic**, with Arabic and English names and an order.
- AC2: It starts from a **template per curriculum, school year and academic year** ("Started from the Egyptian curriculum template · Grade 9 · 2026/27"). The teacher's copy is editable and used by all their groups for that subject and year.
- AC3: Each topic has a status: `taught` or `coming_up` (with the planned week). **Coming-up topics get no score.**
- AC4: Shows per topic how many quizzes and notes are tagged ("Taught • 3 quizzes, 4 notes tagged").
- AC5: The teacher can add, rename, reorder and archive units and topics. Archiving never deletes evidence.

### ANL-TOP-02 · Topic templates (ops)
- AC1: Ops maintain templates per curriculum and school year as reference data. Template changes never overwrite a teacher's copy.

---

## 2. Topic evidence — `ANL-EVD`

### ANL-EVD-01 · Tag a quiz to topics · AN04
- AC1: Two tagging modes: **Whole quiz** (the quiz % counts for every topic tagged on the quiz) or **Per question** (each question has marks and one or more topics; a question tagged to two topics counts in full for each — there is no per-tag weight).
- AC2: Per question: label (Q1…), maximum marks, topic(s). The question marks must add up to the quiz maximum.
- AC3: The screen explains that "Per question gives each student a score per topic".

### ANL-EVD-02 · Marks by voice · AN04
- AC1: "Say the marks — only mention who lost marks", e.g. "Omar lost Q3 and Q4. Salma lost 2 marks in Q5."
- AC2: Link proposes per-student marks. Students who were not mentioned are listed as "confirm full marks", and the teacher must confirm them explicitly. Absent students get no marks (absence ≠ zero).
- AC3: Nothing is saved until the teacher confirms (BR-APR-01).

### ANL-EVD-03 · Topic tags on observations · V02, T11
- AC1: A teacher observation can carry a topic tag and a polarity (positive / concern), confirmed by the teacher.
- AC2: Tagged observations are **context only**. They show next to the score and feed the "same concern 3 times" rule (`repeated_concern`, evaluated by the followup module when a record is confirmed or a teacher note is saved — `note.saved`; a saved note is confirmed input, never an AI draft — BR-APR-08). They never change the score.

### ANL-EVD-04 · Build evidence (system)
- AC1: On `quiz.scored` and `record.confirmed`, the mastery worker writes one **evidence** row per (student, topic, assessment): % of marks, class %, precision weight and date.
- AC2: A correction to a mark rewrites the evidence and appends a new snapshot. Old snapshots stay.

---

## 3. Topic score — `ANL-SCR`

### ANL-SCR-01 · Formula
For one student *s* and one topic *t*:

**Step 1 — one piece of evidence per assessment.** For each assessment *i* that touches topic *t*:

| Tagging | Value `pᵢ` (0–100) | Precision weight `wpᵢ` |
|---|---|---|
| Per question | Σ marks on questions tagged *t* ÷ Σ max marks on those questions × 100 | **1.0** |
| Whole quiz | quiz marks ÷ quiz max × 100 | **0.5** |

Absent or "not entered" results make no evidence.

**Step 2 — recency weight.** `wrᵢ = 0.5 ^ (ageᵢ in days ÷ 28)`. Evidence loses half its weight every 4 weeks.

**Step 3 — weighted average.**

```
score(s, t) = Σ (wpᵢ × wrᵢ × pᵢ) ÷ Σ (wpᵢ × wrᵢ)
```

The score is stored with 1 decimal and shown as a whole number (round half up).

**Step 4 — band.** Bands use the displayed whole number:

| Pieces of evidence | Score | Band |
|---|---|---|
| ≥ 3 | ≥ 80 | **Strong** |
| ≥ 3 | 60–79 | **Developing** |
| ≥ 3 | < 60 | **Needs work** |
| < 3 | any | **Not enough data** (no band shown to parents) |

> **Note:** every recency weight contains the same factor `0.5^(now/28)`, which cancels out in the average. So the score changes **only when evidence changes**. No nightly recompute is needed.

The starting values (half-life 4 weeks; 1.0 / 0.5 precision; 3 pieces minimum; 80 / 60 cut-offs) are tuned during the pilot. They are stored as configuration with a `model_version`.

### ANL-SCR-02 · Worked example (from diagram 09)
Omar, topic "Multi-step word problems", three per-question pieces of evidence:

| Quiz | Age | `pᵢ` | `wrᵢ` | `wrᵢ × pᵢ` |
|---|---|---|---|---|
| A | 35 days (5 weeks) | 75.0 | 0.5^(35/28) = 0.4204 | 31.53 |
| B | 14 days (2 weeks) | 37.5 | 0.5^(14/28) = 0.7071 | 26.52 |
| C | 0 days (this week) | 37.5 | 1.0000 | 37.50 |
| **Sum** | | | **2.1275** | **95.55** |

Score = 95.55 ÷ 2.1275 = **44.9 → 45**. Three pieces of evidence → band **Needs work**. (All three are per question, so the precision weights cancel.)

### ANL-SCR-03 · Who sees what
- AC1: Teacher (and centre owner): the number, band, evidence count and "How is this calculated?" link.
- AC2: Parent: the band only (AN06).
- AC3: Teacher notes tagged to the topic show next to the score, labelled as notes.

### ANL-SCR-04 · Snapshots (system)
- AC1: Each recompute **appends** a `topic_mastery` row (score, band, confidence, evidence count, model version, time). Rows are never edited in place.
- AC2: After an append, `mastery.updated` is published and the cache keys for that student are deleted.

---

## 4. Decline alerts — `ANL-DEC`

### ANL-DEC-01 · Class-adjusted decline alert · AN01
As a teacher, I want to know when a student is slipping below **their own** usual level, so that one hard quiz doesn't flag the whole class.

**Rule `score_decline_class_adjusted`, Rule v1. Defaults are in OD-35.** (Not to be confused with the simple Phase 2 rule `score_decline` in [03](03-prd-phase2-followup.md) FUP-RUL-01.)

1. For each quiz *q* in the group: `gap_q = student % − class average %`. The class average counts only students with a score.
2. **Usual gap** = the average `gap_q` over the 4 quizzes before the latest 2 (`student_baselines.usual_gap_vs_class`).
3. **Fire** when the student has **≥ 3 scores** and **each of the latest 2 quizzes** has `gap_q ≤ usual gap − 10 points`.

AN01 example: usual gap +8 (Q2–Q5). Quiz 6: 60% vs class 69% → gap −9. Quiz 7: 50% vs class 70% → gap −20. Both are ≤ 8 − 10 = −2, so the alert fires.

- AC1: The alert card shows the headline ("Omar Hassan's maths scores are dropping — 2 quizzes in a row below his usual level"), the rule in plain words with who set it and its version, a chart of the last 6 quizzes (student vs class average, below-usual bars marked), and the evidence (each quiz, usual level, participation, weakest topic).
- AC2: If the same flag is already open for the same student, group and topic, no new flag is raised (dedupe, INV-08).
- AC3: When no rule matches, there is no alert, but the new score still shows in reports.
- AC4: **Who computes what** ([05](05-architecture.md) §4): the trend worker only updates `student_baselines` and emits `signal.candidate` for `score_decline_class_adjusted`; the followup module dedupes and saves the signal. Low participation and "same concern 3 times" are Phase 2 rules evaluated by the followup module, not by the trend worker. Diagram 08 still draws them inside the trend worker (CF-17).

### ANL-DEC-02 · Teacher decision
- AC1: Actions: **Assign follow-up** (opens a case, Phase 2 flow), **Add a note**, **Not a concern — tell Link why** (a reason is required).
- AC2: Dismissals and their reasons are counted per rule to help tune thresholds.

---

## 5. Reports — `ANL-RPT`

### ANL-RPT-01 · Teacher subject report per student · AN02
- AC1: Header numbers: average (with change, e.g. "68% ↓ from 81%"), attendance ("11 / 12 sessions"), participation.
- AC2: Score trend: student vs class average per quiz.
- AC3: Score by topic: number, band and evidence count ("Linear equations 88 / 100 · 5 pieces of evidence"). A topic with fewer than 3 pieces shows "—".
- AC4: "What you've noticed": a summary of the teacher's notes. **Every sentence links to its source** (note date, quiz and question, session).
- AC5: Drafted by Link from confirmed records. The teacher reviews it before anything is shared.

### ANL-RPT-02 · Owner class analytics · AN07
- AC1: Cards: class average (last 4 weeks), students flagged this week (assigned / open), the topic needing most work, quizzes tagged to topics ("6 of 7 • 1 untagged").
- AC2: **Heatmap: students × topics.** Each cell is a topic score (0–100). Empty = not enough data. A class-average row is shown.
- AC3: "Declining this week" list with the rule that fired.
- AC4: "Rules that fired • 4 weeks" with counts per rule and an "Edit rules" link. Says "Counts help you tune thresholds".

---

## 6. Weekly focus plans — `ANL-FOC`

### ANL-FOC-01 · Draft the plan (system) · AN05
- AC1: **Weekly** (diagram 08), for each student whose guardian opted in, Link drafts a plan in Egyptian Arabic. The default run day is Sunday, as AN06 shows ("Approved … Sun 4 Oct"). The day is configurable per centre.
- AC2: Inputs: the 1–2 weakest topics with a band (Needs work or Developing), the strongest topic (for praise), and the teacher's notes on those topics. Only confirmed records from the last 4 weeks are used.
- AC3: Constraints: no labels about ability, no comparison with other students, home tips taken **only** from the teacher's approved tip list, and evidence links included for the teacher.
- AC4: The draft shows "What Link found" (focus topic with score and sources; praise topic) and the message text.

### ANL-FOC-02 · Teacher approves · AN05
- AC1: Actions: edit, approve, or skip this week. The teacher can attach a practice sheet.
- AC2: Only an approved plan is sent (BR-APR-03). Approval publishes `focus.approved`, then a WhatsApp utility template is sent (opt-in checked, as in FUP-MSG-03).
- AC3: Parent replies come back to the teacher.

### ANL-FOC-03 · Parent view · AN06
- AC1: "This week, focus on …" with a short explanation in plain words.
- AC2: "3 things to do at home" (from the approved tips).
- AC3: "How <child> is doing by topic" — **bands only**.
- AC4: "Why we think this" (e.g. "Based on his last 2 quizzes and the teacher's notes"), "Approved by <teacher> • <date>", and "Written by Link from <teacher>'s records".

---

## 7. Later — R&D track — `ANL-RND`

### ANL-RND-01 · Link's own Egyptian Arabic models
From diagram 01, "R&D · own Arabic models":
- A **data engine** turns teacher corrections into labels. Only data covered by consent is used (see [10-security-privacy.md](10-security-privacy.md)).
- An **annotation team** of Egyptian Arabic transcribers.
- **Speech fine-tune:** for example, Whisper-large-v3 with LoRA, on GPUs.
- **Extraction distillation:** a small open model, for example Nile-Chat.
- A locked **gold test set**, never trained on. A model is promoted to the **model registry** only if it beats the current vendor on the gold set.

---

## 8. Screen → story map

| Screen | Stories |
|---|---|
| AN01 Decline alert | ANL-DEC-01, ANL-DEC-02 |
| AN02 Subject report | ANL-RPT-01, ANL-SCR-03 |
| AN03 Topic map | ANL-TOP-01 |
| AN04 Tag a quiz + marks by voice | ANL-EVD-01, ANL-EVD-02 |
| AN05 Approve focus plan | ANL-FOC-01, ANL-FOC-02 |
| AN06 Parent focus view | ANL-FOC-03 |
| AN07 Class analytics | ANL-RPT-02 |
| Mastery band component | ANL-SCR-01 (bands) |
| Definitions frame | Glossary and principles above |
