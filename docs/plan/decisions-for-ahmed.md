# Decisions that need Ahmed (triage of docs/13, 2026-10-15)

35 rows of [docs/13](../13-open-decisions.md) (19 OD, 16 CF) were closed as **decided: built default**: the default is built and tested, so only a change of mind would reopen them. Rows left open: 39. Most of those are either settings you can leave at their default for a trial, vendor contracts that wait for a company, or Figma-only notes. These 15 are the ones that need you. Each has a recommendation; none blocks the sample-data trial.

| # | Decision (docs/13) | Recommendation | Why it needs you | Needed before |
|---|---|---|---|---|
| 1 | **Fee rates**: rent fee 5–10% (OD-01), booking commission 5% (OD-02) | Keep 5% and 5%; set per centre / teacher in `commission_rules` | Your revenue model | First real payment |
| 2 | **Processing fees** (OD-15): who pays the provider's fee | Link absorbs it, but check it first: at about 2.85% + EGP 3 a 5% commission earns nothing under about EGP 140. Ask the provider for its flat fee, then decide whether to raise the commission | Money; the default can lose money on small fees | Provider contract |
| 3 | **Payment provider** (OD-04) and **SMS provider** (OD-45) | Paymob first, Kashier second; an Egyptian SMS aggregator plus a global fallback ([provider-choice](provider-choice.md)) | A contract and company papers | Going live |
| 4 | **Refund and cancellation policy** (OD-03, OD-20) | Full refund before the first session; pro-rata after; Fawry and wallet refunds go to a wallet or bank account the parent gives | A legal and consumer-protection choice | First booking |
| 5 | **Chargebacks** (OD-18) | Taken from the teacher's unpaid balance; Link carries the loss after payout | Who carries the risk | Card payments on |
| 6 | **Paid-extras price and who subscribes** (OD-05) | Pilot price in docs/13; bill the centre, not the teacher | Pricing | Pilot end |
| 7 | **Consent pack and legal texts** (OD-60, OD-52) | Send the 8 questions in `docs/legal/README.md` to a lawyer | Needs a lawyer; no real data before it | Any real user |
| 8 | **Breach and retention periods** (OD-27, OD-28) | Keep 72 h / 3 days, transcripts 90 days; have counsel confirm | Law 151/2020 | Any real user |
| 9 | **Where it runs** (OD-26, OD-31) | One Egyptian-friendly server (built, S1) now; AWS only when you outgrow it. Pick the region with counsel | Data residency | Going live |
| 10 | **Ops sign-in** (CF-56) | Keep phone code + office allow-list for the trial; add SSO with MFA before ops staff handle real money | Security vs speed | Real money |
| 11 | **Teacher verification vendor** (OD-19, OD-47) | Manual ID check by ops first (built); buy eKYC later | A vendor contract | After the pilot |
| 12 | **Guardian phone numbers shown to teachers** (OD-25) | Only with the guardian's consent given at checkout (built) | A privacy choice | Any real user |
| 13 | **Launch area and curriculum names** (OD-06, OD-07) | One district first; ops reviews the seeded grade names | Your launch plan | First centres |
| 14 | **Payout minimum and schedule** (OD-30, OD-04) | No minimum, Thursday batch (built) | Cash-flow policy | First payout |
| 15 | **Trial staging exposure**: Vercel Hobby is non-commercial, and the demo reset routes on Railway are public | Move the web to a paid Vercel plan (or your own server) before sending the link to centres; limit the demo API to the Vercel origin | Money and a public link; see [staging doc](../deploy/staging-vercel-railway.md) risks 4 and 7 | Before sharing the link |

Left open on purpose, no decision needed now: maps provider and cost cap (OD-46), logo vector (OD-49), decline-alert thresholds (OD-35, set per centre after the pilot), Figma-only conflicts (CF-20, CF-42, CF-43, CF-45, CF-49).
