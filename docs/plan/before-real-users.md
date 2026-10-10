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
| Ops console | A web app at `ops.<domain>` behind the IP allow-list (built, S2) | The same server, with core-api (`deploy/docker-compose.prod.yml`) |

Not on Vercel: anything that runs jobs, keeps files, holds money state or runs speech-to-text.

## 3. Product gaps

| Gap | What's missing | Owner | Size |
|---|---|---|---|
| ~~Parent's home area~~ | **Built (S3):** Account → Home area (areas with a verified centre, `GET /v1/areas`). | agent | — |
| ~~Teachers paying a rent shortfall~~ | **Built (S3):** Earnings → Rent still to pay → card or Fawry (`POST /v1/rent-invoices/{id}/checkout`, P4 on the webhook). | agent | — |
| Payouts being sent | **Built (S3), by hand:** payout accounts (teacher app, owner web; checked by ops finance), the Thursday batch, the CSV for the bank or InstaPay, sent / bounced / retry in the ops console, payout history for payees ([operations](../operations.md#payouts-every-thursday)). Left: a payout API adapter once a provider offers one (S4), and matching the bank statement automatically. | agent (API after S4) | S |
| ~~Ops console~~ | **Built (S2):** L01 centres, teacher checks, L02 reviews, L03 refunds, data requests, on its own host with the IP allow-list; access granted by a server command ([operations](../operations.md#ops-console)). Still to come with their features: disputes, reconciliation, commission rules, reference data, ledger adjustments, payout monitoring (MKT-OPS-05…07, -10, -11). SSO with MFA only if Ahmed wants it (CF-56). | agent | — |
| Consent pack in the product | **Drafts written (S2, [docs/legal](../legal/README.md)); labels are a setting (`CONSENT_VERSIONS`) and production refuses drafts.** Left: put the approved texts into the apps, record `terms`/`privacy` at sign-up, and ask again when a label changes. | agent (after Ahmed's texts) | S |
| ~~Data-subject rights~~ | **Built (S2):** Account → My data (copy, correction, deletion); ops answer in the console, with an audited JSON export. Teacher app and owner web: by email until their screens get the same card. | agent | — |

Also before launch, smaller: real maps and geocoding (OD-46), photo uploads with review, notifications (MKT-NTF), and the paid-extras price (OD-05).
