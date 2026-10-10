# Provider choice: payments, SMS, WhatsApp

**Status:** recommendation for Ahmed (ship job S4, 2026-10-10). **Nothing is signed up, bought or chosen.** Every provider needs the company's papers and a contract, so the choice and the accounts are Ahmed's (OD-04, OD-45, OD-15). **Every price below is "to verify"**: no provider here publishes a binding Egypt rate card that we could read, and several sources disagree. The figures come from the public pages linked under each section and are only there to size the decision. Ask each provider for a written quote.

Link already has an adapter for each one (docs/05 §7). A provider is one more implementation of an interface plus a config value. The money rules (ledger, idempotency, webhooks only, P1–P10) do not change with the provider:

| Adapter | File | Today |
|---|---|---|
| `PaymentProvider` (checkout, Fawry reference, saved-card charge, refund, expire, webhook, settlement report) | `apps/core-api/src/adapters/payments.ts` | `fake` (fake-pay), `none` (bookings off) |
| Payouts | `apps/core-api/src/ledger/payouts.ts` | `manual` (CSV for the bank or InstaPay, S3) |
| `SmsSender` | `apps/core-api/src/adapters/sms.ts` | `fake` (sms-sink) |
| `WhatsAppSender` | `apps/core-api/src/adapters/whatsapp.ts` | `fake`, `manual` (staff send by hand, OD-56) |

## Recommendation in one table

| Need | First choice | Second | Why |
|---|---|---|---|
| Payments (parents pay) | **Paymob** | **Kashier** | Both offer hosted checkout for cards and wallets, card tokens for the monthly plan, refunds and signed webhooks. Paymob also has a payout product (Paymob Send) that could replace the manual CSV. Kashier publishes a flat rate and documents saved-card charging clearly. Fawry on its own lacks recurring card payments (see below). |
| Fawry cash codes | Through the chosen gateway, if it can issue Fawry reference codes; otherwise **FawryPay** as a second `PaymentProvider` for the `fawry` method only | — | The parent app offers card, wallet and Fawry (BR-PMT). The adapter already routes per method. |
| Payouts (teachers, centres) | **Manual** (built) until volume hurts; then the payout API of the payments provider (Paymob Send, if chosen) | Bank bulk transfer file | One contract instead of two; the `manual` provider keeps working as the fallback. |
| SMS (sign-in codes, invites) | **An Egyptian aggregator** (e.g. Cequens, Victory Link, SMS Misr): ask all three for quotes | A global API (Infobip, Twilio, Vonage) as the fallback sender (OD-45) | Local pricing and local support for sender-ID registration; the global one is the fallback if the local one goes down. |
| WhatsApp (Phase 2 parent updates) | **Meta WhatsApp Cloud API, direct** | A BSP (e.g. Cequens, Infobip, Twilio, 360dialog) if Meta verification stalls | No BSP markup. The adapter was designed for Cloud API (docs/05 §7). The pilot sends by hand anyway (OD-56). |

**Do first (it takes longest):** the company papers (commercial register, tax card, bank account), then in parallel the sandbox requests to Paymob and Kashier, the sender ID "Link" with the SMS aggregator, and Meta Business verification. The code for each real adapter is about one to two weeks once a sandbox exists. Writing it before the sandbox is guesswork, so it waits.

## 1. Payments

### What Link needs from the provider

Every item comes from the docs, so this is the checklist to send each provider:

1. **Hosted checkout** for cards (Visa, Mastercard, Meeza) and mobile wallets. Card data never touches Link (CLAUDE.md money rules).
2. **Fawry reference codes** valid for 24 hours (OD-09), with a way to cancel an unpaid code when the hold ends (`expire`).
3. **Saved-card tokens with merchant-initiated charges** for the monthly plan, plus card-only recurring (OD-10, OD-17 retries after 1 and 3 days). We schedule the charge ourselves (`chargeMandate`); we do not need the provider's own subscription engine.
4. **Full and partial refunds** through the API, idempotent (P9/P10, OD-03 pro-rata refunds).
5. **Signed webhooks** (HMAC) with a stable event ID, plus a "get payment" query. Status changes only on these (never on the browser return).
6. **A daily settlement report** by API or file: amount, fee and reference per line, for reconciliation (docs/08, `ledger.provider_settlement_lines`).
7. **Payouts** to teachers' and centres' bank accounts (IBAN), wallets and InstaPay, idempotent per payout (BR-OUT-05). Optional at the start, because `manual` is built.
8. **Marketplace fit:** Link takes the parents' money and pays teachers and centres later. Ask whether the provider's terms allow this on one merchant account or need sub-merchants / split settlement. **This is also a legal question** (see "Questions for the lawyer").
9. A **sandbox** with test cards, test wallets and test Fawry codes.

### Candidates

| | Paymob | Kashier | FawryPay |
|---|---|---|---|
| Cards, wallets | Yes: cards incl. Meeza, wallets, installments, BNPL ([1], [2]) | Yes ([4]) | Cards and wallets, plus its own reference codes ([7]) |
| Fawry reference codes | **To verify.** Paymob has its own "kiosk" cash method; ask whether it is Fawry's network or another one | **To verify** | Yes (its main product) |
| Saved card + merchant-initiated charge | Yes: card tokens and a subscription module; both a legacy (Accept) API and a newer Intention API exist, so check which one our account gets ([2], [3]) | Yes: "Save Token" then "Pay with Token"; no managed subscription engine (we do not need one) ([5]) | **Not supported** for recurring, per third-party integrators ([8]); to verify with Fawry |
| Payout API | Yes: Paymob Send / disbursements to wallets, bank wallets and bank cards; InstaPay **to verify** ([6]) | **To verify** | **To verify** |
| Published fee | Not published; quote on request ([1]) | **2.85% + EGP 3** per successful payment, no setup or monthly fee (older article, [9]); a comparison site says **2.75%** ([10]) | Per merchant agreement; not published ([7]) |
| Settlement report | To verify | To verify | To verify |

**Not recommended now:** a payment orchestrator (MoneyHash and similar) that sits in front of several gateways. Link's adapter already does that job, and an orchestrator adds a second contract and a second fee.

### Fees against Link's commission (to verify, but it matters)

Link pays the processing fee from its own commission (OD-15), and the booking commission is 5% (OD-02). Taking Kashier's older declared rate of **2.85% + EGP 3** only as an example:

| Parent pays (one month) | Link's 5% | Processing (example) | Link keeps |
|---|---|---|---|
| EGP 200 | EGP 10.00 | EGP 8.70 | **EGP 1.30** |
| EGP 400 | EGP 20.00 | EGP 14.40 | EGP 5.60 |
| EGP 1,000 | EGP 50.00 | EGP 31.50 | EGP 18.50 |

At this rate a payment under about **EGP 140** costs Link more than it earns. Ask every provider:

- Is the flat EGP 3 negotiable?
- Is the fee different for wallets and Fawry?
- Is the fee refunded when we refund?

This is Ahmed's call (OD-02, OD-15), not a code change. The rates live in `commission_rules`, and the provider's fee arrives on the settlement report.

## 2. SMS (sign-in codes and staff invites)

### What Link needs

- **Sign-in codes (OTP):** time-critical, around the clock, in Arabic and English.
- **Staff invites:** `templateCode: 'otp' | 'staff_invite'` today.
- **Sender ID "Link":** registered on all four networks (Vodafone, Orange, Etisalat by e&, WE).
- **Delivery reports** by webhook, so we can show "code sent" and retry on the fallback.
- **A second provider as fallback** (OD-45).

### What the rules say (from SMS vendors' guides, to verify with the aggregator)

- **Registration:** alphanumeric sender IDs must be pre-registered in Egypt, 3–11 characters. **Arabic-script sender IDs are not accepted** ([11], [12]).
- **Papers:** commercial register extract, tax card, an authorisation letter and sample messages ([11], [12]).
- **Lead time:** about 15 business days to three weeks ([11]). **This is the longest SMS task, so start it with the company papers.**
- **Hours:** transactional messages (codes) can go out around the clock; marketing has a daytime window. Link sends no SMS marketing.

### Candidates

| | Egyptian aggregator (Cequens, Victory Link, SMS Misr, …) | Global API (Infobip, Twilio, Vonage) |
|---|---|---|
| Price per SMS to Egypt | Quoted per contract, usually in EGP. **Get quotes.** | Resellers list roughly **USD 0.19–0.36** per message ([13], [14]); to verify |
| Sender-ID registration | Done for us with the networks | Done through them, same papers, sometimes slower |
| Support, invoices | Local, EGP | Foreign currency, card or wire |
| Role | **Primary** | **Fallback** |

**Cost idea:** each sign-in sends one code, and sessions last (refresh tokens), so SMS volume ≈ new sign-ins + new devices. The pilot sends a few hundred messages a month, not thousands.

### An option to decide (not built)

WhatsApp "authentication" messages for sign-in codes cost far less than SMS in Egypt (see §3). A code over WhatsApp first, with SMS as the fallback, would cut the bill. But OD-40 says Phase 1 uses SMS and WhatsApp starts in Phase 2, opt-in only. **Product decision for Ahmed; we keep SMS-only until then.**

## 3. WhatsApp (Phase 2 parent updates)

### What Link needs

- **Approved templates** for staff-approved parent updates (BR-APR): utility category, Arabic and English.
- **Opt-in** before sending, and **STOP** that takes effect at once (CLAUDE.md trust rules).
- **Delivery and read status** by signed webhook; status moves only on those (BR-APR-11).
- **A business number**, Meta Business verification and an approved display name ("Link").

### Pricing model (Meta, to verify on Meta's rate card [15])

- **Per message:** since 1 July 2025 Meta charges per delivered template message by category (marketing, utility, authentication), set by the recipient's country ([15], [16]).
- **Utility messages** are free inside the 24-hour customer-service window.
- **Change from 1 October 2026:** one rate site reports that service replies and in-window utility messages become chargeable. **Single source, verify** ([17]).
- **Egypt, per message, as reported (USD, excluding 14% VAT):**

  | Category | Reported rate | Sources |
  |---|---|---|
  | Utility | about 0.0036–0.0054 | [17], [18] |
  | Authentication | about 0.0036–0.0054 | [17], [18] |
  | Marketing | about 0.064–0.077 | [17], [18] |

- **Rate history:** Meta lowered Egypt's utility and authentication rates on 1 October 2025 and its marketing rate on 1 January 2026 ([16]).
- **What Link pays:** only utility. A weekly update to 1,000 parents ≈ 4,000–4,300 messages a month ≈ **USD 15–25** at those rates.

### Candidates

| | Meta Cloud API (direct) | BSP (Cequens, Infobip, Twilio, 360dialog, …) |
|---|---|---|
| Message price | Meta's rate only | Meta's rate + BSP markup or monthly fee |
| Setup | Meta Business verification (days to weeks, needs company papers), a number not used on the WhatsApp app | Same verification, with their help |
| Our adapter | Built for it (docs/05 §7) | Each BSP has its own API; more adapter work |
| Support | Meta's self-service | A local account manager (Cequens is Egyptian) |

**Recommendation:** start Meta Business verification together with the company papers, since it gates everything. Build the Cloud API adapter when Phase 2 starts. Until then the pilot's manual sending (OD-56) stays as it is.

## Questions to send each provider (copy into the email)

1. Written Egypt rates per method (card, Meeza, wallet, Fawry/cash), for payments, refunds and payouts. Are fees refunded on refunds? Monthly or setup fees? VAT?
2. Can we take payments for teachers and centres and pay them later (marketplace)? On one merchant account, or with sub-merchants or split settlement? Any limit on holding funds?
3. Saved-card tokens with merchant-initiated charges (no customer present) for a monthly plan: supported for Meeza and debit cards too?
4. Fawry reference codes: issued by you? How long valid? Can we cancel an unpaid one?
5. Webhooks: HMAC signature, event IDs, retries. Is there a "get payment" API?
6. Settlement: when (T+?), and is there a daily report API with the fee per transaction?
7. Payouts: bank (IBAN), wallets, InstaPay? Idempotency key? Fee per payout?
8. Sandbox access before contract signature?
9. SMS only: sender-ID registration for "Link" on all four networks (lead time and papers), the OTP rate, delivery-report webhooks, and the throughput limit.

## Questions for the lawyer (in docs/legal/README.md, question 6)

- **Collecting for others:** Link collects parents' money and pays teachers and centres later. Does this make Link a payment facilitator under the Central Bank of Egypt's rules? The PSP rules have been in force since 17 June 2025, with a 12-month transition ([19], [20]). Or is it fine when the licensed gateway holds the funds?
- **Money held before payout:** the weekly payout holds money between the parent paying and the teacher being paid. Does that need a separate account or a guarantee?

## Sources (read 2026-10-10; prices change, verify each one)

1. Paymob overview (payment methods, pricing "usage-based"): https://www.softwares.com/software/paymob · https://packagist.org/packages/ahmed-abd0/laravel-paymob
2. Paymob developer portal (subscription module, card tokens): https://developers.paymob.com/ · https://developers.paymob.com/uae/faqs-latest-1 · https://apis.io/providers/paymob/
3. Paymob legacy Accept docs, subscriptions: https://docs.paymob.com/docs/subscription
4. Kashier developer docs: https://developers.kashier.io/docs
5. Kashier recurring payments (save token, pay with token): https://developers.kashier.io/docs/accept-payments/recurring
6. Paymob disbursement API (Paymob Send): https://apis.io/apis/paymob/paymob-disbursement-api/
7. FawryPay integration guides (third party): https://documentation.ixopay.com/manual/adapters/fawry · https://jentic.com/apis/fawrypay.com/fawrypay
8. Fawry recurring not supported (third party): https://cartdna.com/en/shopify-payment-methods/fawry
9. Kashier 2.85% + EGP 3 (older article): https://kr-asia.com/egyptian-payments-platform-kashier-raises-six-figure-seed
10. Kashier 2.75% (comparison site): https://paymentproviders.io/compare/nagad-vs-kashier?focus=fees
11. Egypt sender-ID rules (vendor guides): https://d7networks.com/sms/egypt/sender-id-registration · https://www.sent.dm/resources/egypt-sms-guide
12. AWS, Egypt sender-ID registration: https://docs.aws.eu/sms-voice/latest/userguide/registrations-egypt.html
13. SMS and WhatsApp prices (reseller): https://docs.verifik.co/phone-validations/sms-and-whatsapp-prices/
14. SMS pricing table (reseller): https://www.messagecentral.com/en-in/product/message-now/pricing
15. Meta, WhatsApp Business Platform pricing: https://developers.facebook.com/docs/whatsapp/pricing
16. Meta pricing updates (Egypt rate changes): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
17. WhatsApp API pricing Egypt (updated July 2026): https://chatmaxima.com/whatsapp-api-pricing/egypt/
18. WhatsApp API providers in Egypt: https://m.aisensy.com/blog/best-whatsapp-api-provider-in-egypt/
19. CBE payment facilitator framework (2019): https://www.ibanet.org/article/6FC3317B-4F9C-4DFC-BDF1-80CF98B68B21
20. CBE PSP regulations (2025): https://insightplus.bakermckenzie.com/bm/banking-finance_1/egypt-new-regulation-on-payment-solutions
