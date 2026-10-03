# ADR-0001 · Modular monolith (core-api) plus a separate ai-service

- **Status:** Accepted — agreed design in the kickoff prompt
- **Date:** 2026-10-03
- **Deciders:** Founding engineering team

## Context

Link starts with a small team. Phase 1 (marketplace and payments) needs strong consistency for money, seats and bookings. Phases 2–3 add AI workloads (speech-to-text, extraction, drafting) that use Python tools, scale differently, and must never slow down payments. Eraser diagram 02 (Backend runtime) shows Phase 1 shipping four stateless deployables — core-api, ai-service, messaging-gateway and workers — and says to "split modules into services only when load or team size needs it".

## Decision

1. **core-api** is one TypeScript NestJS application: a **modular monolith**. Each bounded context is a module (identity, org, rooms, groups, enrolment, search, reviews, payments, rent, payouts, records, voice, followup, messaging, analytics, audit, platform). Each owns its tables in a schema per context.
2. Module rules (see [05-architecture.md](../05-architecture.md) §2):
   - A module writes only its own tables.
   - Cross-module calls go through exported service interfaces, never repositories.
   - Reactions in another module go through outbox events, even in-process.
   - Foreign keys only within a schema.
3. **workers** and **messaging-gateway** are separate entrypoints (processes and containers) built from the core-api codebase. They share modules and contracts but scale on their own.
4. **ai-service** is a separate Python FastAPI service. It is stateless, gets jobs from the queue or synchronous calls, and writes back **only through core-api's API**, acting on behalf of a user. It never touches the database.
5. All provider integrations sit behind adapters, so vendors can change without touching business code.

## Consequences

- ✅ One transaction can cover a business change, its audit row and its outbox event. Money and seat logic stay simple and consistent.
- ✅ One deployable to operate for most logic; fast to build with a small team.
- ✅ AI load is isolated (bulkhead): an STT backlog cannot block checkout.
- ✅ Module rules keep a later split cheap: a module already talks through interfaces and events.
- ⚠️ Discipline is needed to keep boundaries. Enforce with lint rules on imports (e.g. dependency-cruiser) and code review.
- ⚠️ One shared database is a single scaling unit; read replicas and caching carry read load at first.

## Alternatives considered

- **Microservices from day one** (one service per bounded context). Rejected for now: operational cost, distributed transactions around money, slower delivery.
- **AI inside core-api (TypeScript).** Rejected: the Python ecosystem for speech and ML is stronger, and AI load must be isolated.
