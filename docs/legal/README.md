# Legal drafts and the consent pack

> **DRAFTS for a lawyer.** Written by the engineering side from the product rules (docs/01, docs/10) so the lawyer has something concrete to correct. They are **not legal advice** and **not approved**. Nothing here may be shown to real users until Ahmed approves the reviewed texts in writing (OD-60). Sample data only until then.

## What is here

| File | What it is | Where people see it | Consent label (`CONSENT_VERSIONS`) |
|---|---|---|---|
| [terms.md](terms.md) | Terms of use: the marketplace, payments through Link, fees, cancellations, reviews, conduct | Sign-up (every app), the website footer | `terms` |
| [privacy.md](privacy.md) | Privacy notice under Law 151/2020 (PDPL): what Link collects, why, who sees it, how long, people's rights | Sign-up, the website footer, Account → My data | `privacy` |
| [refund-policy.md](refund-policy.md) | Cancellations and refunds for parents | Checkout (P07), the booking page (P08) | part of `terms` |
| [centre-terms.md](centre-terms.md) | Terms for centres: halls, rent, the marketing fee, verification, payouts | "Add my centre" (C01), owner web | part of `terms` |
| [teacher-terms.md](teacher-terms.md) | Terms for teachers: ID check, booking commission, rent, payouts | Teacher app sign-up | part of `terms` |
| [consents.md](consents.md) | The short in-product consent texts, in Arabic and English: children's data, sharing the parent's phone with the teacher, WhatsApp and SMS updates, "Link may contact me" (C01), voice notes | Add a child, checkout, Follow-up settings, C01 | one label per text |
| [data-requests.md](data-requests.md) | How Link answers access, correction and deletion requests (the ops procedure) | Ops console → Data requests | — |

The concierge pilot has its own, separate pack in [docs/pilot](../pilot/README.md) (`teacher-consent.md`, `guardian-notice.md`, `centre-agreement.md`).

## Questions for the lawyer

1. **Controller and processor.** Link is the controller for accounts, payments and marketplace data. For Follow-up records, is Link the centre's processor (the centre decides what to record about its students) or a joint controller? The drafts assume **processor** for Follow-up and say so.
2. **Children.** Law 151/2020 treats a child's data as sensitive. The drafts take the guardian's explicit consent per child when the child is added (`child_data_processing`). Is that enough, and what must the text say?
3. **PDPL licence and registration** with the Personal Data Protection Centre, and whether Link needs a data protection officer from day one.
4. **Cross-border transfer** (OD-26): hosting region, the payment provider, SMS and WhatsApp (Meta) providers.
5. **Retention**: the periods in privacy.md §6 (voice 30 days; financial records as tax and commercial law require; the drafts say 5 years — confirm).
6. **Payments**: Link collects the teacher's fee and pays it out weekly. Does that need a payment-facilitator arrangement with the provider or a Central Bank of Egypt permission? (Ask the provider too, OD-04.)
7. **Reviews**: liability for parents' reviews; the moderation rules in terms.md §8.
8. **Response time** for data requests: the drafts promise 30 days (the console counts it). Confirm the legal limit.

## How a text goes live (configuration, no code)

1. The lawyer corrects a draft; Ahmed approves it in writing.
2. Give it a label, e.g. `terms=2026-11-v1`, and set every approved label in `CONSENT_VERSIONS` on the server (deploy/.env.production). Every consent event stores the label the person saw (BR-DAT-03).
3. Put the approved short texts into the Arabic and English messages (packages/i18n) in place of the drafts.
4. Production refuses to start while any required text still has a draft label (the production guard, `CONSENT_VERSIONS: … still use a draft text`). That is deliberate: no real data before approval (OD-60).
5. A changed text gets a new label; the apps then ask again (the re-consent screen is the remaining small code item in docs/plan/before-real-users.md §3).
