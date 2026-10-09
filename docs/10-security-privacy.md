# 10 · Security and privacy

Link holds data about children, their guardians and money. We comply with Egypt's **Personal Data Protection Law (Law 151/2020)** and its executive regulations. Legal points still open: OD-26 (data residency), OD-27 (breach time limits), OD-28 (retention). **Confirm every legal point in this file with counsel before launch.**

---

## 1. Roles and permissions

### Roles

| Role | Who | Scope |
|---|---|---|
| `parent` | Guardian account | Own children, own payments, own reviews |
| `teacher` | Teacher account | Own profile, groups, bookings, enrolments, earnings; Phase 2–3: own groups' records and analytics |
| `centre_owner` | Centre owner | Everything for their centre(s) |
| `centre_staff` | Admin / reception | Their centre, limited by permissions: `bookings.manage`, `reviews.reply`, `cases.manage`, `messages.approve`, `records.read` |
| `link_ops` | Link team | Ops console only, limited by the permissions `ops.verify`, `ops.moderate` and `ops.finance`, granted as bundles: "agent" = `ops.verify` + `ops.moderate`; "finance" = `ops.finance` (OD-37). There are no other ops roles. |
| `system` | Workers, ai-service (on behalf of a user) | Least privilege per job |

One user can hold several roles (e.g. teacher and parent).

### Matrix

✓ = allowed · (own) = only their own rows · (perm) = needs the named permission · — = not allowed

| Capability | Parent | Teacher | Centre owner | Centre staff | Link ops |
|---|---|---|---|---|---|
| Search; view public centre/teacher pages | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage children; reserve and pay | ✓ (own) | — | — | — | — |
| View own enrolments, payments, receipts | ✓ (own) | — | — | — | ✓ (audited) |
| Leave a review / private feedback | ✓ (verified parent) | — | — | — | — |
| Edit teacher profile, groups, fees | — | ✓ (own) | — | — | — |
| Request halls; end own bookings | — | ✓ (own) | — | — | — |
| See student name + year in a group | — | ✓ (own groups) | ✓ | ✓ | ✓ (audited) |
| See guardian phone | — | ✓ (own groups, with consent) | ✓ (with consent) | ✓ (with consent) | ✓ (audited) |
| Accept / decline enrolments (OD-08) | — | ✓ (own) | — | — | — |
| View teacher earnings and payouts | — | ✓ (own) | — | — | ✓ (perm `ops.finance`) |
| Edit centre profile, halls, rent rules | — | — | ✓ | — | — |
| Manage hall requests | — | — | ✓ | ✓ (perm `bookings.manage`) | — |
| View rent income and centre payouts | — | — | ✓ | — | ✓ (perm `ops.finance`) |
| Change payout account | — | ✓ (own, `/v1/me/payout-account`) | ✓ (per centre, `/v1/centres/{id}/payout-account`) | — | — |
| Mark a held session "did not take place" (OD-44) | — | ✓ (own groups) | ✓ | ✓ (perm `bookings.manage`) | — |
| Reply to / report reviews | — | ✓ (own) | ✓ | ✓ (perm `reviews.reply`) | — |
| Manage staff | — | — | ✓ | — | — |
| **Phase 2:** record sessions, confirm records, notes | — | ✓ (own groups) | — | — | — |
| **Phase 2:** read records and notes | — | ✓ (own groups) | ✓ | ✓ (perm `records.read`) | ✓ (audited) |
| **Phase 2:** edit rules | — | — | ✓ (approve) | propose | — |
| **Phase 2:** work cases | — | ✓ (own groups) | ✓ | ✓ (perm `cases.manage`; assigned) | — |
| **Phase 2:** approve parent messages | — | (OD-34) | ✓ | ✓ (perm `messages.approve`) | — |
| **Phase 3:** edit topic map; tag quizzes | — | ✓ (own) | — | — | — |
| **Phase 3:** see topic score numbers | — | ✓ (own groups) | ✓ | ✓ (perm `records.read`) | — |
| **Phase 3:** see topic bands | ✓ (own children) | ✓ | ✓ | ✓ | — |
| **Phase 3:** approve focus plans | — | ✓ (own) | — | — | — |
| Verify centres and teachers | — | — | — | — | ✓ (perm `ops.verify`) |
| Moderate reviews (hide, request edit) | — | — | — | — | ✓ (perm `ops.moderate`) |
| Refunds, disputes, reconciliation, commission rules | — | — | — | — | ✓ (perm `ops.finance`) |
| Ledger adjustments (P11), payout retry | — | — | — | — | ✓ (perm `ops.finance`) |
| Handle PDPL data-subject requests | — | — | — | — | ✓ (perm `ops.verify`) |
| Read the audit log | — | — | ✓ (own centre) | — | ✓ |

## 2. Tenant isolation (RLS)

- **Tenant = centre.** Every tenant table has `centre_id` (see [06-data-model.md](06-data-model.md) §0).
- core-api connects as `app_user` **without** `BYPASSRLS`. Each request's transaction runs:
  ```sql
  SET LOCAL app.user_id    = '<uuid>';
  SET LOCAL app.roles      = '{teacher,parent}';
  SET LOCAL app.centre_ids = '{<uuid>,…}';   -- centres where the user is owner/staff
  SET LOCAL app.teacher_id = '<uuid or empty>';
  SET LOCAL app.guardian_id= '<uuid or empty>';
  ```
- Policies use the codes in [06-data-model.md](06-data-model.md) (`PUBLIC`, `SELF`, `CENTRE`, `TEACHER`, `GUARDIAN`, `OPS`, `SYSTEM`).
- **A teacher works across centres.** Their access comes from `teacher_id`, not from `centre_ids`, and covers only their own groups.
- Public reads go through **views** that expose only public columns (no phone numbers, no student data).
- Cache keys for tenant data are prefixed `{env}:c:{centreId}:` (05 §5). Code review rejects any tenant key without the prefix.
- **Tests:** CI runs a cross-tenant suite. For every endpoint, a user from centre A must get `404` for centre B's resources.

## 3. Consent (PDPL)

Every consent is a row in `org.consent_events` keyed on the consenting person's **`user_id`** — any role, not only guardians. For a guardian **without an account** (`guardians.user_id` is NULL), `user_id` is NULL and `guardian_id` identifies them; a CHECK requires one of the two. `student_id` is optional context. The current state is the latest row per `(COALESCE(user_id, guardian_id), student_id, kind)` ([06](06-data-model.md)).

| Consent | Who gives it | When | `kind` |
|---|---|---|---|
| Terms and privacy notice | Every user (parent, teacher, owner, staff) | Sign-up | `terms`, `privacy`, with version |
| Guardian data-processing consent for a child | Guardian | Adding a child | `child_data_processing` (copied to `student_guardians.consent_version/at`) |
| Share guardian phone with teacher and front desk | Guardian | Checkout (P07), unticked by default | `share_phone_with_teacher` |
| WhatsApp updates (Phase 2) | Guardian | Opt-in screen or first approved message flow | `whatsapp_updates`; "STOP" withdraws at once |
| SMS fallback (Phase 2) | Guardian | Same | `sms_updates` |
| Weekly focus plans (Phase 3) | Guardian | Opt-in | `focus_plans` |
| Use of corrections and voice notes for AI evaluation and training | Teacher and guardian (per centre agreement) | Opt-in (E15-01 consent pack) | `ai_training_use` |

Rules:
- Consent is **freely given, specific and recorded with its text version**. Pre-ticked boxes are not used.
- Withdrawal is as easy as giving consent and takes effect at once. Consent state is **never cached**.
- Students are minors. Their data is handled only through a guardian's consent or to deliver the service the guardian bought.
- **Data minimisation:** a student record holds name, curriculum and school year only. No national ID or birth date is collected for students.

### Data-subject rights
`POST /v1/me/data-requests` (`access`, `correction`, `deletion`). Ops handle them within the legal time limit (TBD with counsel). Deletion anonymises personal data and keeps financial and audit records that the law requires us to keep.

## 4. Retention (OD-28)

| Data class | Retention | Mechanism |
|---|---|---|
| Voice audio | **30 days** after upload (fixed rule) | `voice_notes.delete_after`; daily clean-up job deletes the object and sets `audio_deleted` |
| Transcripts | 90 days (default) | `transcript_delete_after`; same job blanks the column |
| OTP codes | 5 minutes | Redis TTL |
| Idempotency records | 24 hours | Redis TTL / cleanup |
| ID documents (eKYC) | TBD with counsel | Retention job per data class |
| Leads (landing-page form, `org.leads`) | Not converted: deleted 6 months after the last contact. Converted: name and WhatsApp number wiped once the centre or teacher account exists; the row keeps only `status` and `converted_centre_id` (default · OD-28) | Retention job per data class |
| Records, notes, analytics | TBD with counsel (default: keep while the account is active) | Retention job per data class |
| Payments, ledger, invoices, payouts | As required by tax law (TBD) | Never deleted; personal fields anonymised on deletion requests |
| Audit log | TBD (default: keep) | Monthly partitions; archived, never edited |
| Logs and traces | 30 days | Log platform retention |

## 5. Encryption and secrets

| Item | Control |
|---|---|
| In transit | TLS 1.2+ everywhere; HSTS on web; mTLS between internal services |
| At rest | Managed disk encryption for Postgres, Redis and backups; SSE-KMS for object storage with per-environment keys |
| Field level | Account phones (`identity.users`), guardian phones, payout account details and holder names are envelope-encrypted in the app (KMS data keys), with HMAC columns for lookup and a last-4 column where a masked number is shown. Locally the key-encryption key comes from `.env.local`, because aws-local keeps KMS keys in memory only |
| Card data | Never touches Link. Hosted checkout and provider tokens only — PCI scope stays minimal (SAQ A) |
| Secrets | Secrets manager + KMS; rotated; never in code, images or env files in git; one least-privilege IAM role per deployable (diagram 02) |
| Object access | Signed URLs only, with short expiry. No public buckets. |
| Devices | The teacher app encrypts its offline queue and SQLite store with a key from the device's secure storage. Its session tokens live in the OS secure storage (Keychain / Keystore). **The Expo web build of the teacher app is not a production target**: it exists for development and demos only, and keeps its tokens in browser storage (decided 2026-10-09) |
| Key IDs | Every encrypted value carries the ID (fingerprint) of the key that wrapped it, and `platform.data_keys` records which keys wrote the stored data; a mismatch is reported at start-up instead of failing as corrupt data |

## 6. Audit log

- `audit.audit_events` is **append-only and write-once**: no update/delete grants, and a trigger raises an error on either.
- Written **in the same transaction** as the change it describes (05 §2, rule 6).
- Captures: actor, action, object, before/after (personal data minimised), reason, model version for AI-proposed changes, request and trace IDs.
- **Undo** writes a new change and a new audit event that points to the one it undoes (`undoes_event_id`). History is never deleted.
- Every ops read of personal data is audited, not only writes.
- Owners see their centre's history (A17). Ops see everything, through the ops console.

## 7. Application security

- Phone OTP with rate limits (07 §1); codes stored as hashes; at most 5 tries per code.
- Refresh tokens are rotated; reuse revokes the whole session chain.
- Ops console: SSO with MFA, IP allow-list, separate deployment.
- Webhooks: signature verified by the adapter **before** parsing; replay protection on provider event IDs and timestamps.
- Input validation at the API edge from the OpenAPI schema; output encoding in the web apps; CSP on all web apps.
- WAF and DDoS protection at the edge; bot filtering on public search.
- Dependency scanning and SAST in CI; container image scanning; a penetration test before launch.
- **No personal data** in logs, traces or PostHog. Redaction happens at the source.
- LLM safety: no person name reaches an LLM — every detected name span (matched, ambiguous or unknown) is tokenised, and guardian contacts are redacted (09 §2.4, §8); prompts include only confirmed facts; outputs validated against schemas.

## 8. Governance

| Item | Status |
|---|---|
| Data Protection Officer (DPO) | To appoint (diagram 02: "DPO & licence") |
| Licence from the Personal Data Protection Centre | To obtain before processing at scale (diagram 02: "PDP Centre licence") |
| Cross-border transfer / hosting region | OD-26 |
| Records of processing | Kept by the DPO; updated with each new data class |
| Vendor contracts | Data-processing terms with every provider; no training on our data; deletion on request |

## 9. Breach runbook

**When to use it:** any suspected unauthorised access to, loss of or disclosure of personal data, including a leaked key, a misconfigured bucket, a cross-tenant read or a lost device with unsynced data.

**Prerequisites:** on-call has access to the incident channel, cloud console (break-glass), Sentry, logs and the audit log. The DPO's and counsel's contact details are in the on-call handbook.

| Step | Owner | Action | Time |
|---|---|---|---|
| 1. Detect and declare | On-call | Open an incident; set severity; start a timeline. | T+0 |
| 2. Contain | On-call + eng lead | Revoke keys and tokens; block the path (feature flag, WAF rule, policy fix); isolate affected services. Preserve evidence (logs, snapshots). | ASAP |
| 3. Assess | Eng lead + DPO | What data, whose (centres, guardians, children), how many people, how long, still ongoing? Use the audit log to scope. | Within 24 h |
| 4. Notify the regulator | DPO | Notify the Personal Data Protection Centre. | **Within 72 h** (OD-27; confirm with counsel) |
| 5. Notify affected people | DPO + support | Tell affected guardians, teachers and centres in Arabic and English: what happened, what data, what we did, what they should do. | **Within 3 days** (OD-27; confirm with counsel) |
| 6. Recover | Eng | Fix the root cause; rotate secrets; restore from backups if needed; verify RLS and cache-key scoping. | — |
| 7. Review | Eng lead + DPO | Blameless post-mortem within 5 working days; action items in the backlog; update this runbook. | — |

**Rollback:** containment steps are reversible feature flags or policy changes; keep them in place until the review signs off.

**Escalation:** on-call → eng lead → founders + DPO → counsel.
