# What is still sample-only · ما زال تجريبيًا

With `pnpm dev` ([RUNNING](../RUNNING.md)) Link runs on its real backend: sign-in, accounts, centres, halls, groups, seats, payments and the ledger, reviews, session records, voice notes, flags, follow-ups and parent messages all come from Postgres, with the real rules and per-centre isolation. What is left is what touches the outside world, or a screen nobody has built yet. Each line names what stands in for it today. The plan to close them, with owners and sizes: [before real users](../plan/before-real-users.md).

| Area | Today (stand-in) | Needs for real |
|---|---|---|
| **SMS** | sms-sink (:8093) catches every code and invite; nothing is sent. | An SMS sender (OD-45). |
| **Payments** | fake-pay (:8091) plays the provider: hosted page, Fawry references, signed webhooks, refunds, a 2% sample fee. No money moves. | A merchant account with hosted checkout (card, Fawry, wallet); the real gateway fee rate. |
| **Payouts** | "Next payout Thursday" (with "Held for rent") is computed; nothing is sent. | A payout provider and teachers' and centres' bank accounts. |
| **Rent shortfall** | The ledger can post a teacher's rent top-up (P4), but there is no screen to pay it. | A "Pay the rent shortfall" checkout for teachers. |
| **WhatsApp** | whatsapp-fake (:8094) receives approved messages; delivery and replies only when Demo controls ask. | WhatsApp Business: a number, approved templates, delivery events. |
| **Voice notes** | Local Whisper through ai-service on this machine, sample audio only (`pnpm voice:try`). | Hosting ai-service, and the consent pack before any real recording (OD-60). |
| **Ask Link** | Off unless a local model runs (Ollama). | A decision on the model and where it runs. |
| **Link ops** | The ops console runs on the real API (S2): verification, review moderation, refunds, data requests; sample ops users sign in with a code from sms-sink. | Real ops staff accounts (a `link_ops` role with a bundle, granted by an admin), the office address in `OPS_IP_ALLOWLIST`, DNS for `ops.<domain>`. |
| **Parent's home area** | Stored on the profile, set only through the API; the browser location is used otherwise. | The settings screen to set it. |
| **Maps and photos** | A drawn map with pins; coloured tiles for photos. | A map provider and geocoding; photo uploads with review. |
| **Notifications** | None beyond sign-in codes and invites. | In-app and SMS/WhatsApp notices (MKT-NTF). |
| **Hosting, email, domain** | Everything on this machine; the contact address and `PILOT_REQUEST_TO` are empty. | Servers, backups, a domain and a contact address. |
