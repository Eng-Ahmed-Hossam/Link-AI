# What's left before real users

Link runs end to end on its real backend on one machine, with sample data and local fakes for every outside service ([RUNNING](../RUNNING.md), [sample-only](../product/sample-only.md)). Before a real centre, teacher or parent uses it, three kinds of work remain. **Owner**: Ahmed (paperwork, accounts, decisions) or agent (code and docs). **Size**: S = a day or less, M = a few days, L = a week or more of work.

## 1. Accounts and paperwork

These take longer to arrive than the code takes to write; start them first.

| Item | What it is | Owner | Size | Decision |
|---|---|---|---|---|
| Company | The legal entity that signs with providers and holds the merchant account; also needed for PDPL registration (Law 151/2020). | Ahmed | L | — |
| Merchant account | A payment provider (Paymob, Kashier or Fawry) with hosted checkout for card, Fawry and wallet, plus payouts to bank accounts. Ask for the sandbox first. **Gateway fee**: Link pays it from its 5% commission; at a 2.5% fee Link keeps 2.5 of its 5 points (docs/08 P5) — **rate to verify with the real provider**. | Ahmed | L | OD-04, OD-15 |
| WhatsApp Business | A business number, Meta verification, and the message templates for parent updates approved by Meta. | Ahmed | M | — |
| SMS sender | An Egyptian SMS aggregator account with a registered sender name for sign-in codes and invites; a second one as fallback. | Ahmed | M | OD-45 |
| Domain | The web address for the site, the parent app and the owner web, plus its DNS. | Ahmed | S | — |
| Contact email | The address on the site and where pilot requests go (`PILOT_REQUEST_TO`), and an email sending key. | Ahmed | S | — |
| Consent pack | The texts parents, teachers and owners agree to (terms, privacy, children's data, WhatsApp/SMS updates), reviewed by a lawyer. No real data until it is approved. | Ahmed (texts) · agent (wire the versions in) | M · S | OD-60 |

## 2. Hosting

| Part | Needs | Where |
|---|---|---|
| Website, parent app, owner and staff web (`apps/web`) | A Next.js host with server routes | **Vercel** is fine |
| Public demo (mock data in the browser) | Static hosting | **Vercel** (already planned) |
| core-api: api, worker, messaging-gateway | Always-on containers (the worker runs the money jobs every few minutes; the gateway receives provider webhooks) | A server: containers on a cloud (AWS proposed, OD-31) |
| PostgreSQL with PostGIS, Redis ×2 | Managed databases with backups | The same cloud as core-api |
| File storage, encryption keys, queues | S3-compatible storage with encryption, a key service, a queue with dead-letter queues | The same cloud |
| ai-service (Whisper and the extraction) | A server with a strong CPU or a GPU, in a region allowed for student data | A server, never Vercel (OD-26) |
| Teacher app | App store builds (Expo); the web build is for demos only | Apple and Google stores |
| Ops console | A web app behind single sign-on and an IP allow-list | A server, with core-api |

Not on Vercel: anything that runs jobs, keeps files, holds money state or runs speech-to-text.

## 3. Product gaps

| Gap | What's missing | Owner | Size |
|---|---|---|---|
| Parent's home area | The settings screen to set the home area (the API and the column exist; distances use it already). | agent | S |
| Teachers paying a rent shortfall | When a month's fees don't cover the rent, the teacher pays the rest: a checkout endpoint and a button on Earnings. The ledger postings (P4) are built and tested. | agent | M |
| Payouts being sent | The payout provider adapter, teachers' and centres' bank accounts, the Thursday payout job, payout statements, and reconciliation of what the bank shows. Today the amount is only computed. | agent (needs the merchant account) | L |
| Ops console | Verify centres and teachers, moderate reviews, approve or deny refunds (L01–L03), replacing `pnpm ops:verify-centre` and `pnpm ops:refunds`; single sign-on and the IP allow-list. | agent | L |
| Consent pack in the product | Show the approved texts, record their versions, and ask again when a text changes. | agent (after Ahmed's texts) | S |

Also before launch, smaller: real maps and geocoding (OD-46), photo uploads with review, notifications (MKT-NTF), and the paid-extras price (OD-05).
