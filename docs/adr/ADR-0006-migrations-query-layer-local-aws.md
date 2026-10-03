# ADR-0006 · SQL-first migrations (dbmate), Kysely query layer, local AWS stand-in

- **Status:** Accepted for local development (walking skeleton, M0 local half)
- **Date:** 2026-10-03
- **Deciders:** Task owner; implemented with the local dev environment

## Context

The schema in [06](../06-data-model.md) depends on PostgreSQL features that ORMs model badly or not at all: row-level security policies, triggers (append-only tables, `centre_id` copies), generated columns, `UNIQUE … NULLS NOT DISTINCT`, exclusion constraints with `btree_gist`, PostGIS geography, and partitioned tables. No doc picked a migration tool or a query layer. The schema must stay owned by SQL, not by an ORM.

Docs/14 also names **LocalStack** for local S3, SNS/SQS, KMS and Secrets Manager. Since 2026 the `localstack/localstack` image refuses to start without an account auth token (`LOCALSTACK_AUTH_TOKEN`) — tested 2026-10-03 with build 2026.9.0 — which breaks the rule "no outside accounts are needed locally".

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Migrations: dbmate** (MIT). Plain `.sql` files in `apps/core-api/migrations/`, each with `-- migrate:up` / `-- migrate:down`, applied in a transaction as `app_migrator`. Run with `pnpm db:migrate`, `db:rollback`, `db:status`. Installed from npm (`dbmate`), which ships native binaries for Windows, macOS and Linux. | SQL-first: every feature in 06 is written as SQL with nothing in between. Single binary, no JVM or Python, works the same in CI. |
| 2 | **Query layer: Kysely** on top of `pg` (node-postgres), with row types generated from the live schema (`kysely-codegen`) in Part 2. Raw SQL through Kysely's `sql` tag where needed (RLS `SET LOCAL`, PostGIS). | A typed query builder that never owns the schema and never runs DDL. Transactions are explicit, so each request can set the RLS context with `SET LOCAL` inside its own transaction (10 §2). |
| 3 | **No ORM entities, no schema sync, no ORM migrations.** | Two owners of the schema would drift. |
| 4 | **Roles and credentials.** Migration 0001 creates `app_user`, `app_worker` and `app_ops` as `NOLOGIN NOBYPASSRLS` and grants per table. Passwords never appear in migrations. Locally `pnpm db:migrate` sets `LOGIN PASSWORD` from `.env.local`; in the cloud Terraform will (E0-03, OD-31). `app_migrator` and the extensions are created by the Postgres container's init script (PostGIS needs superuser); migration 0001 repeats `CREATE EXTENSION IF NOT EXISTS` for the cloud. | Keeps secrets out of git and out of migration history. |
| 5 | **Local AWS: Moto server** (Apache-2.0), service `aws-local` on port **4566**, built from `infra/local/aws/`. It creates the buckets, the event topic, one queue + DLQ per consumer group (SNS→SQS subscriptions with raw delivery and a redrive policy), the KMS aliases and a Secrets Manager entry on every start (Moto keeps state in memory). The AWS SDK only needs `S3_ENDPOINT` / an endpoint override, as with LocalStack. | Needs no account. Covers every service docs/14 lists. |
| 6 | **Postgres image:** `pgvector/pgvector:pg16` (Debian bookworm) plus PostGIS 3 from PGDG. | `postgis/postgis:16-3.5` is on Debian bullseye, whose PGDG repository is archived, so pgvector cannot be installed there. |
| 7 | **Host ports are configurable** (`POSTGRES_HOST_PORT`, `REDIS_*_HOST_PORT`, …), defaulting to docs/14. | A native PostgreSQL on 5432 is common on Windows machines. |

## Consequences

- ✅ The schema is exactly what 06 says, reviewable as SQL, with working down migrations.
- ✅ The local stack starts with Docker Desktop alone.
- ⚠️ Moto is not LocalStack: no IAM enforcement, in-memory state (queues are emptied on restart), and SNS→SQS delivery is synchronous. Contract tests against the real cloud queue come with E0-03.
- ⚠️ Kysely types must be regenerated after each migration (`pnpm db:types`, Part 2); CI will check for drift.
- ⚠️ dbmate runs each migration in one transaction. Statements that cannot run in a transaction (e.g. `CREATE INDEX CONCURRENTLY`) need `-- migrate:up transaction:false`.

## Alternatives considered

- **Prisma / TypeORM migrations.** Rejected: they own the schema and cannot express RLS, exclusion constraints or `NULLS NOT DISTINCT` without raw-SQL escape hatches everywhere.
- **Drizzle.** Viable as a query layer, but its migration generator wants to own the schema; we would use it read-only, which is what Kysely already is.
- **node-pg-migrate / graphile-migrate.** Viable SQL-capable tools; dbmate is simpler (plain files, one binary) and language-neutral if the Python service ever needs it.
- **Flyway / Sqitch.** Need a JVM or Perl on every Windows machine.
- **Pinning an old LocalStack community tag.** Rejected: unmaintained images age badly; one more thing to explain.
