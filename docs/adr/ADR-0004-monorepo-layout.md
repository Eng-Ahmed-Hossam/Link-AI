# ADR-0004 · Monorepo layout (pnpm + Turborepo)

- **Status:** **Proposed** — the team must confirm it at the docs review
- **Date:** 2026-10-03
- **Deciders:** Founding engineering team

## Context

Link has a TypeScript backend, two Next.js web apps, an Expo mobile app, a Python AI service, shared UI, i18n and an API client generated from OpenAPI, plus Terraform. The apps share contracts (OpenAPI, events), tokens and translations, which change together.

## Decision (proposed)

One repository, **pnpm workspaces + Turborepo** for the TypeScript parts, with the Python service in the same repo:

```
link/
├─ apps/
│  ├─ core-api/        # NestJS modular monolith (ADR-0001)
│  │  └─ src/
│  │     ├─ main.api.ts        # entrypoint: REST API + SSE
│  │     ├─ main.worker.ts     # entrypoint: workers (outbox relay, jobs)
│  │     ├─ main.gateway.ts    # entrypoint: messaging-gateway
│  │     └─ modules/<context>/ # identity, org, rooms, groups, enrolment, …
│  ├─ ai-service/      # Python FastAPI (uv for deps; pytest; ruff)
│  ├─ web/             # Next.js: public site + parent PWA + owner/staff web (route groups)
│  ├─ teacher-app/     # React Native (Expo)
│  └─ ops/             # Next.js internal console (SSO + IP allow-list)
├─ packages/
│  ├─ api-client/      # generated from core-api OpenAPI
│  ├─ ui/              # tokens + components (web + React Native)
│  ├─ i18n/            # ar/en ICU messages, shared keys
│  └─ config/          # eslint, tsconfig, prettier, event schemas (events/)
├─ infra/              # Terraform: dev / staging / prod
│  └─ local/           # docker compose for local services (docs/14-dev-environment.md)
└─ docs/               # this documentation
```

Proposed choices that go beyond the kickoff prompt — **confirm each**:

| # | Choice | Why |
|---|---|---|
| 1 | `workers` and `messaging-gateway` are **entrypoints inside `apps/core-api`**, not separate apps | They share modules and contracts with core-api (ADR-0001); the prompt's repo layout lists no app for them |
| 2 | `apps/web` holds the public site, the parent PWA **and** the owner/staff web as route groups `(public)`, `(parent)`, `(centre)` | The prompt lists only one `apps/web`; split into two apps later if bundles or release cadence diverge |
| 3 | The teacher marketplace screens (J01–J07) live in `apps/teacher-app` | They are mobile designs; the architecture places "groups, halls, voice notes" in the teacher app |
| 4 | Event contracts live in `packages/config/events` and generate TypeScript and Python types | One source for producers (TS) and consumers (TS and Python) |
| 5 | Python tooling: `uv`, `ruff`, `pytest`, `mypy`; Turborepo calls it through package scripts | Keeps one `pnpm test` / `pnpm lint` at the root |

## Consequences

- ✅ A contract change (OpenAPI, event, token, string) and its users change in one pull request; CI checks them together.
- ✅ Turborepo caching keeps CI fast.
- ⚠️ CI must handle two toolchains (Node and Python).
- ⚠️ Clear CODEOWNERS are needed per app and package.

## Alternatives considered

- **Polyrepo.** Rejected: contracts would drift; more release overhead for a small team.
- **Nx instead of Turborepo.** Viable; Turborepo is simpler and is what the kickoff prompt proposes.
