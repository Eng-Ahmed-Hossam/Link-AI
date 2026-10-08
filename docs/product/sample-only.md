# What is still sample-only · ما زال تجريبيًا

Everything in the connected story runs on the mock server (`pnpm demo`) or in the browser (the public demo). This is what the next phase must make real before any real centre, teacher or parent uses Link. Each line names what stands in for it today.

| Area | Today (sample only) | Needs for real |
|---|---|---|
| **Accounts and sign-in** | Phone codes are always `123456`; nothing is texted. Sessions are `mock.<user>` tokens in the browser. The role chooser signs in sample users. | core-api auth: phone OTP by SMS (5 minutes, 5 tries, resend after 60 s), real sessions, roles from `role_assignments`, staff invites that arrive. |
| **Saved data** | One shared in-memory store on the mock server (lost on restart) or the browser's storage; no tenancy. | PostgreSQL with RLS per centre, the audit log in the same transaction, backups. |
| **Payments** | A mock provider page ("Simulate a successful payment"), made-up Fawry codes, a webhook simulated after a few seconds. No money moves. | A payment provider with hosted checkout (card, Fawry, mobile wallet), signed webhooks deduped on event id, the double-entry ledger, refunds. |
| **Fees, rent and payouts** | Link's 5% rent fee and 5% booking commission are fixed in the mock; rent, net and "next payout Thursday" are computed for display only. | Rates from `commission_rules` (snapshotted on each payment), rent invoices, weekly payouts to teachers' and centres' accounts, statements. |
| **SMS** | None (codes are fixed, invites are not sent). | An SMS provider for sign-in codes, staff invites and the Fawry fallback. |
| **WhatsApp** | Parent updates are approved but not sent; "Advance: Sent → Delivered" and the parent's reply are Demo controls. | A WhatsApp Business provider: approved templates, opt-in and STOP checked on every send, delivery events. |
| **Voice notes** | Fixture speech-to-text, or local Whisper on this laptop; audio stays on the device. | The ai-service with real speech-to-text, encrypted audio deleted after 30 days, PDPL consent. |
| **Maps and location** | A drawn map with pins; distances from sample data; "Location under review" is cleared by a Demo control. | Geocoding and a map provider; the ops console to verify a moved pin (CF-44). |
| **Photos** | Coloured tiles; "+ Add photo" counts up. | Uploads to object storage (signed URLs), review before publishing. |
| **Link ops** | No ops console: centre join requests (C01), teacher verification, review reports and refunds are only stored. | The ops console (L01–L03): verify centres and teachers, moderate reviews, refunds and disputes. |
| **Notifications** | Stage changes, approvals and new enrolments are not notified. | In-app and SMS/WhatsApp notifications (MKT-NTF). |
| **Contact email** | The site's contact address and `PILOT_REQUEST_TO` are not set; the request email provider key is empty. | The real address, and the email provider key in the server-side `.env.production`. |
