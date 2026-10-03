# ADR-0002 · Money in piasters with a double-entry ledger

- **Status:** Accepted — agreed design in the kickoff prompt (§2.11)
- **Date:** 2026-10-03
- **Deciders:** Founding engineering team

## Context

All money moves through Link: parents pay teachers, teachers pay rent, Link takes a commission and a rent fee, and Link pays out weekly. Mistakes in money cost trust and may break the law. The Eraser ERD (diagram 03) stores amounts as `decimal` (CF-01).

## Decision

1. **Integer piasters.** Every amount is a `bigint` number of piasters (1 EGP = 100 pt), in columns with the suffix `_pt`. No floats or decimals for money in the database, the API (`amountPt`) or the code. Formatting to EGP happens only at the UI edge.
2. **Rates** are `numeric(5,2)` percentages in `commission_rules`, with validity dates. They are never hard-coded. The rate used is snapshotted on the payment or invoice. Two rules of the same kind and scope never overlap in time — including the global default — enforced by an exclusion constraint on `(kind, scope_id, validity)`, where `scope_id` is a generated non-NULL column ([06](../06-data-model.md)).
3. **Fee arithmetic** is exact; Link's fee is rounded **down** to a whole piaster (OD-16).
4. **Double-entry ledger:** `ledger_accounts`, `ledger_transactions`, `ledger_entries`. Every money event posts one transaction whose debits equal its credits, enforced by a deferred constraint trigger. Entries are append-only; corrections are new transactions.
5. **Balances** are derived from entries, never stored by hand and never cached.
6. **Idempotency:** every transaction has a unique `idempotency_key` derived from the event (e.g. `capture:{provider}:{providerRef}`), so a replay posts nothing new.
7. **Reconciliation** against provider settlement reports runs daily; payouts only use reconciled money.

Posting rules are in [08-payments-ledger.md](../08-payments-ledger.md).

## Consequences

- ✅ No rounding drift; sums are exact; amounts are easy to compare in tests.
- ✅ Every piaster can be traced; balances can be rebuilt from history; audits are simple.
- ✅ Rate changes never change past money.
- ⚠️ Every money feature must define its posting rule before coding.
- ⚠️ Reports need aggregation queries; add snapshot tables for closed periods if they get slow (never as a cache of live balances).

## Alternatives considered

- **`numeric` money columns.** Rejected: easy to mix scales; floats leak in through JS.
- **Single-entry balance columns updated in place.** Rejected: no audit trail, race-prone, impossible to reconcile.
- **Third-party ledger service.** Not now; revisit if volume or regulation requires it.
