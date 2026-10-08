# Link

**Follow-up for tutoring centres in Egypt.** After class a teacher speaks a short note; Link turns it into records, raises a readable flag when a student starts slipping, and drafts a parent update that staff approve. A marketplace for parents, teachers and centres follows later.

Arabic-first (right-to-left), with full English.

> **Sample data only.** Everything in this repo — the demo, screenshots, designs, tests — uses fictional names and numbers. Real centre data exists only in a running pilot (pseudonymised, on the centre's own laptop or the hosted pilot) and is never committed. See [SECURITY.md](SECURITY.md).

## Quick start

Requirements: Node 24, pnpm 12, Python 3.12 with [uv](https://docs.astral.sh/uv/) (only for voice notes). Windows or Linux.

```bash
pnpm install
pnpm demo        # mock server + owner web (localhost:3000) + teacher app (localhost:8081)
pnpm demo:warm   # in a second terminal: compile every page once
```

- Landing page: http://localhost:3000/ar · every screen with one-click sign-in: http://localhost:3000/ar/dev
- The connected story, step by step across the three roles: [docs/testing/walkthrough.md](docs/testing/walkthrough.md)
- Deeper tours of each feature: [docs/testing/feature-tours.md](docs/testing/feature-tours.md)

**Pilot practice** (the concierge pilot with a throwaway training centre; setup in [docs/pilot/runbook.md](docs/pilot/runbook.md)):

```bash
pnpm pilot:build
pnpm pilot:practice        # prints the owner PIN once; owner web http://127.0.0.1:8443
pnpm pilot:practice-wipe   # afterwards
```

**Checks:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm run i18n:check`; end-to-end suites per app (`pnpm --filter @link/web test:e2e`, `test:e2e:demo`, `pnpm --filter @link/teacher-app test:e2e`, `pnpm --filter @link/pilot test:e2e`). All commands: [docs/14-dev-environment.md](docs/14-dev-environment.md).

## Where things are

- **Repo map:** [docs/dev/repo-map.md](docs/dev/repo-map.md)
- **Rules for every code change:** [CLAUDE.md](CLAUDE.md)
- **Product and engineering docs:**

| #     | Doc                                                                                                                                            | What's in it                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 00    | [Overview](docs/00-overview.md)                                                                                                                | Vision, actors, curricula, business model, phases               |
| 01    | [Business rules](docs/01-business-rules.md)                                                                                                    | Money, booking, rent, reviews, approvals, with worked examples  |
| 02–04 | [Phase 1](docs/02-prd-phase1-marketplace.md) · [Phase 2](docs/03-prd-phase2-followup.md) · [Phase 3](docs/04-prd-phase3-analytics.md)          | Product requirements per phase                                  |
| 05–08 | [Architecture](docs/05-architecture.md) · [Data model](docs/06-data-model.md) · [API](docs/07-api.md) · [Payments](docs/08-payments-ledger.md) | How the full product is built                                   |
| 09    | [AI voice pipeline](docs/09-ai-voice-pipeline.md)                                                                                              | Speech-to-text → name match → extraction → teacher confirmation |
| 10    | [Security and privacy](docs/10-security-privacy.md)                                                                                            | Permissions, PDPL (Law 151/2020), retention                     |
| 11    | [Design system](docs/11-design-system.md)                                                                                                      | Tokens, components, RTL rules, screen inventory                 |
| 12–13 | [Backlog](docs/12-backlog-phase1.md) · [Open decisions](docs/13-open-decisions.md)                                                             | What's next; every decision with its default                    |
| —     | [Pilot pack](docs/pilot/README.md)                                                                                                             | Runbook, consent, guides, accuracy gate, go/no-go               |
| —     | [ADRs](docs/adr/) · [Changelog](docs/CHANGELOG.md) · [Glossary](docs/glossary.md)                                                              | Decisions, doc history, English ↔ Arabic terms                  |

## Design and diagrams

- **Figma:** https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7 — "Link MVP • Editable screens" (`0:1`) and "Landing page · Website" (`68:605`). Screen inventory in [docs/11](docs/11-design-system.md) §7.
- **Eraser:** https://app.eraser.io/workspace/ZurKb6P9y4F6oa76V3wX — nine diagrams (system overview, backend runtime, data model, voice note → parent update, reservation & payment, rent & payouts, request lifecycle, analytics loop, topic score); the docs cite them as "diagram 01" … "diagram 09".

## Licence

Proprietary. All rights reserved — see [LICENSE](LICENSE).
