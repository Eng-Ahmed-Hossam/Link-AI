# 00 · Overview

## Vision

**Link is a marketplace for tutoring in Egypt, with AI follow-up tools on top.**

- **The marketplace is the business.** Parents find teachers and centres and pay online. Teachers rent halls in centres. Centres fill their empty halls. Link earns a small cut of the money that moves through it.
- **The AI tools are paid extras.** They help keep students enrolled: Arabic voice records after class, decline alerts, follow-up tasks, approved WhatsApp updates to parents, and student analytics by topic.

**Market reality behind the model:** parents pay the teacher, and the teacher pays the centre rent for the hall. Nobody subscribes to the centre itself.

## Actors

| Actor | What they do | How money works for them |
|---|---|---|
| **Centre** (owner + staff) | Lists halls with capacity, free slots and rent. Accepts teachers' booking requests. Sees rent income. | Joins free. Receives rent through Link, minus Link's small marketing fee. Centres are never asked to pay upfront. |
| **Teacher** | Builds a public profile. Rents weekly hall slots; rent is calculated per the centre's rent rule. Creates groups with fees. Confirms enrolments. Sees earnings. | Joins free. Receives parents' payments through Link, minus Link's booking commission and the hall rent. |
| **Parent / student** | Searches by curriculum, grade, subject and location. Reads reviews. Reserves a place, pays and leaves reviews. | Free to use. Pays the teacher's fee only. |
| **Link ops** (internal) | Verifies centres and teachers. Moderates reviews. Handles refunds and disputes. | — |

## Curricula

Link serves teachers and students of every curriculum in Egypt:

| Curriculum | Notes |
|---|---|
| **National** | Public / government curriculum |
| **IGCSE** | British |
| **American** | American diploma |
| **Nile** | Egyptian Nile schools |

Curriculum is a first-class field on subjects, groups, students, search and topic maps. The exact grade/year names per curriculum are TBD (OD-07).

## Business model

| Revenue line | What it is | Taken from | Default rate |
|---|---|---|---|
| 1. Hall-rent marketing fee | Small % of each rent payment, for bringing teachers to the centre | Centre's share of the rent | 5% per centre, range 5–10% (OD-01) |
| 2. Booking commission | Small % of each student reservation | Teacher's fee | 5% per teacher (OD-02) |
| 3. Optional subscriptions | Paid extras only: AI voice records, follow-up, analytics | TBD (centre, teacher or both) | TBD (OD-05) |

Every payment goes through Link. There is no "cash at the desk" path. See [01-business-rules.md](01-business-rules.md) for every money rule with worked examples.

```
Parent ──pays fee──▶ Link ──(fee − commission)──▶ Teacher balance
                       │                               │
                       │                         rent deducted
                       ▼                               ▼
                 Link revenue ◀──marketing fee── Centre balance (rent − fee)
                                                       │
                              weekly payouts ──▶ bank account / mobile wallet
```

## Trust rules (non-negotiable)

1. The teacher confirms every record before it is saved.
2. Staff approve every message before it reaches a parent. The teacher approves the weekly parent focus plan.
3. Every flag shows the readable rule that raised it. No black-box scores.
4. A transcript is a receipt only. It is never shown to parents and never used in analytics. A **record** is the confirmed facts.
5. Every change goes to an append-only audit log, with undo.
6. Each centre's data is isolated (row-level security and tenant-scoped cache keys).
7. Parents opt in to WhatsApp and can stop at any time.
8. Only verified parents of enrolled students can review. Owners can reply to or report a review, never delete it.
9. We comply with Egypt's Personal Data Protection Law (Law 151/2020).
10. Voice audio is encrypted and deleted after 30 days.
11. Arabic-first and right-to-left, with full English.

## Phases

| Phase | Scope | Why this order | PRD |
|---|---|---|---|
| **1 — Marketplace and payments** | Accounts, centres, teachers, hall booking, groups, discovery, reservation and payment, ledger and payouts, reviews, ops console, public website | This is the revenue. Build it first. | [02](02-prd-phase1-marketplace.md) |
| **2 — Paid extras: follow-up** | Session records (tap + Arabic voice), readable rules, flags → cases, staff-approved WhatsApp messages, owner dashboard, Ask Link | Keeps students enrolled, which protects marketplace revenue | [03](03-prd-phase2-followup.md) |
| **3 — Paid extras: student analytics** | Topic maps, topic evidence, topic scores, decline alerts, reports, class heatmap, weekly parent focus plans | Deeper value from the confirmed records | [04](04-prd-phase3-analytics.md) |
| Later | R&D on Link's own Egyptian Arabic speech and extraction models | Lower cost and better accuracy | [09](09-ai-voice-pipeline.md) |

## Where to read next

| You want to… | Read |
|---|---|
| Know the rules for money, booking and reviews | [01-business-rules.md](01-business-rules.md) |
| Build a feature | The PRD for its phase, then [05-architecture.md](05-architecture.md), [06-data-model.md](06-data-model.md) and [07-api.md](07-api.md) |
| Touch money | [08-payments-ledger.md](08-payments-ledger.md) and [ADR-0002](adr/ADR-0002-money-piasters-double-entry-ledger.md) |
| Touch voice or AI | [09-ai-voice-pipeline.md](09-ai-voice-pipeline.md) |
| Touch personal data or permissions | [10-security-privacy.md](10-security-privacy.md) |
| Build UI | [11-design-system.md](11-design-system.md) |
| Pick the next task | [12-backlog-phase1.md](12-backlog-phase1.md) |
| Know what is still TBD | [13-open-decisions.md](13-open-decisions.md) |
| Translate a term | [glossary.md](glossary.md) |
