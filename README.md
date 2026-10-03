# Link

**A marketplace for tutoring in Egypt, with AI follow-up tools on top.**

- **Parents** find teachers and centres near them, by curriculum (National, IGCSE, American, Nile), grade and subject. They read verified reviews, reserve a place and pay online.
- **Teachers** join free, build a public profile, rent weekly hall slots in centres (rent follows each centre's rent rule), create groups with their own fees, and get paid weekly.
- **Centres** join free, list their halls with capacity, free slots and rent, approve teachers, and receive rent through Link.
- **Link** earns a small booking commission (from the teacher's fee) and a small marketing fee on rent (from the centre's share). Every payment goes through Link.
- **Paid extras** help keep students enrolled: Egyptian Arabic voice records after class, readable decline alerts, follow-up cases, staff-approved WhatsApp updates, and topic analytics with weekly parent focus plans.

Arabic-first (right-to-left), with full English.

> **Status:** documentation only. Application code starts after the team reviews [docs/13-open-decisions.md](docs/13-open-decisions.md) and [docs/12-backlog-phase1.md](docs/12-backlog-phase1.md).

## Repo map (proposed — [ADR-0004](docs/adr/ADR-0004-monorepo-layout.md))

| Path                  | What                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/core-api`       | TypeScript NestJS modular monolith: REST + OpenAPI, SSE; worker and messaging-gateway entrypoints |
| `apps/ai-service`     | Python FastAPI: speech-to-text, name matching, extraction, drafting, triage, focus plans          |
| `apps/web`            | Next.js: public site (SEO), parent PWA, owner/staff web                                           |
| `apps/teacher-app`    | React Native (Expo): teacher marketplace, session records, offline voice queue                    |
| `apps/ops`            | Internal ops console (SSO + IP allow-list)                                                        |
| `packages/api-client` | Typed client generated from OpenAPI                                                               |
| `packages/ui`         | Design tokens and components (web + React Native)                                                 |
| `packages/i18n`       | Arabic and English messages                                                                       |
| `packages/config`     | Shared lint/TS config and event schemas                                                           |
| `infra/`              | Terraform for dev, staging and prod                                                               |
| `docs/`               | Product and engineering documentation                                                             |

## Documentation

| #   | Doc                                                            | What's in it                                                                           |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| —   | [CLAUDE.md](CLAUDE.md)                                         | Rules and conventions for every coding task                                            |
| 00  | [Overview](docs/00-overview.md)                                | Vision, actors, curricula, business model, phases                                      |
| 01  | [Business rules](docs/01-business-rules.md)                    | Money, booking, rent, payouts, reviews, verification, approvals — with worked examples |
| 02  | [PRD Phase 1 — Marketplace](docs/02-prd-phase1-marketplace.md) | Stories and acceptance criteria (P, C, J, L screens)                                   |
| 03  | [PRD Phase 2 — Follow-up](docs/03-prd-phase2-followup.md)      | Records, voice, rules, cases, messages (T, V, A screens)                               |
| 04  | [PRD Phase 3 — Analytics](docs/04-prd-phase3-analytics.md)     | Topic maps, scores (formula), alerts, reports, focus plans (AN screens)                |
| 05  | [Architecture](docs/05-architecture.md)                        | Components, modules, events, caching, resilience, adapters                             |
| 06  | [Data model](docs/06-data-model.md)                            | Every table, constraints, RLS, invariants                                              |
| 07  | [API](docs/07-api.md)                                          | Conventions and Phase 1 endpoints                                                      |
| 08  | [Payments and ledger](docs/08-payments-ledger.md)              | Accounts, postings, saga, reconciliation, payouts                                      |
| 09  | [AI voice pipeline](docs/09-ai-voice-pipeline.md)              | STT → clean-up → name match → extraction → confirmation; eval gates; cost              |
| 10  | [Security and privacy](docs/10-security-privacy.md)            | Permissions matrix, RLS, PDPL, retention, breach runbook                               |
| 11  | [Design system](docs/11-design-system.md)                      | Tokens, typography, components, RTL rules, screen inventory                            |
| 12  | [Backlog Phase 1](docs/12-backlog-phase1.md)                   | Epics, stories, sizes, build order                                                     |
| 13  | [Open decisions](docs/13-open-decisions.md)                    | Every TBD with its default, and source conflicts                                       |
| 14  | [Development environment](docs/14-dev-environment.md)          | Local services, env vars, seed data, commands, sandbox accounts per milestone          |
| —   | [Glossary](docs/glossary.md)                                   | English ↔ Arabic terms                                                                 |
| —   | [Changelog](docs/CHANGELOG.md)                                 | Every change to the docs, with the reason                                              |
| —   | [ADRs](docs/adr/)                                              | 0001 modular monolith · 0002 piasters + ledger · 0003 outbox · 0004 monorepo           |

## Design and diagram sources

- **Figma** — https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7 — two pages: "Link MVP • Editable screens" (`0:1`) and "Landing page · Website" (`68:605`). Screen inventory in [docs/11](docs/11-design-system.md) §7.
- **Eraser** — "Link — Full System Architecture": https://app.eraser.io/workspace/ZurKb6P9y4F6oa76V3wX

The Eraser diagrams, file `ZurKb6P9y4F6oa76V3wX`:

| #   | Diagram                    | ID                     |
| --- | -------------------------- | ---------------------- |
| 01  | System overview            | `vk1fsucYvh1TNDoBgZv2` |
| 02  | Backend runtime            | `bBM71PRkaCpnYOmzAYmD` |
| 03  | Data model (ERD)           | `vDhZGbDt1rtl9jEXJ0Aw` |
| 04  | Voice note → parent update | `4w6Rl11hA1i9X33Z5zcN` |
| 05  | Reservation & payment      | `pQZzRULA0klPa6NvjRfX` |
| 06  | Rent, Link fees & payouts  | `9rE1lIIU7Lzwg3hQ0Xjq` |
| 07  | Request lifecycle          | `_Kd1Th-RGd5y61vBieg1` |
| 08  | Student analytics loop     | `Ys5gZpV1IKJX-Tmk4tE2` |
| 09  | Topic score calculation    | `wkl2MNFCOTsIpSGd4-uw` |

Each detail lives in exactly one diagram; the docs cite them as "diagram 01" … "diagram 09". Main docs: 01, 02, 07 → [05](docs/05-architecture.md); 03 → [06](docs/06-data-model.md); 04 → [03](docs/03-prd-phase2-followup.md), [09](docs/09-ai-voice-pipeline.md); 05, 06 → [08](docs/08-payments-ledger.md); 08, 09 → [04](docs/04-prd-phase3-analytics.md).

All names and numbers in the designs are sample data.

## Getting started

Nothing to run yet. The local setup, env vars, seed data and sandbox accounts are in [docs/14-dev-environment.md](docs/14-dev-environment.md). Once code exists:

```bash
pnpm install
```

```bash
pnpm dev
```
