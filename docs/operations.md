# Operations (one server)

How to run Link for real users on one Linux server with Docker: first start, restart, logs, backups, restore and key rotation. Everything is in `deploy/`; what each setting does is in [go-live-switches.md](go-live-switches.md); the security items are in [security-checklist.md](security-checklist.md). Try any of it first on your own machine with `pnpm prod:local` (the same images and compose, with the local fakes and sample data).

Below, `dc` means:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production
```

## First start

1. A server with Docker (Ubuntu 24.04 LTS or similar): 4 vCPU, 8 GB RAM and 60 GB disk without voice notes; add 8 GB RAM (or a GPU) for ai-service.
2. Point the domain's DNS `A` records at the server: `link.example.com` and `ops.link.example.com` (the ops console). Open ports 80 and 443 only.
3. On the server: `git clone https://github.com/Eng-Ahmed-Hossam/Link-AI.git /srv/link && cd /srv/link`.
4. `pnpm prod:env --domain link.example.com` (or copy `deploy/.env.production.example` by hand), then fill in `ACME_EMAIL`, `NEXT_PUBLIC_CONTACT_EMAIL` and the provider settings. **Copy `FIELD_KEY`, `HMAC_KEY_LOOKUP`, `STORAGE_KEY` and `BACKUP_PASSPHRASE` somewhere safe away from the server**: without them, neither the database nor the backups can be read.
5. `dc up -d --build --wait`. Add `--profile ai` for voice notes, then download the speech models once: `dc --profile ai run --rm ai python scripts/download_models.py`.
6. Check it: `dc ps` (every service `healthy`), `curl -s https://link.example.com/v1/curricula`. If core-api refuses to start, its log names every wrong setting (`dc logs api`).
7. Nightly backups: `crontab -e` → `15 2 * * * cd /srv/link && deploy/backup.sh >> /var/log/link-backup.log 2>&1`.
8. The first ops users (see [Ops console](#ops-console) below).

## Ops console

Link staff verify centres and teachers, moderate reviews, decide refunds and answer data requests at **`https://ops.<LINK_DOMAIN>`** (apps/ops). Nobody gets in from the web unless the server grants it:

| To | Run |
|---|---|
| Let the office reach it | set `OPS_IP_ALLOWLIST` in `deploy/.env.production` to the office's public address(es) or ranges (`203.0.113.9, 198.51.100.0/24`), then `dc up -d api`. **Empty = closed in production.** `any` opens it everywhere (not advised). |
| Give someone access | `dc exec api node dist/main.mjs ops-access grant 01XXXXXXXXX agent "Name"` — bundles (OD-37): `agent` (verify centres and teachers, moderate reviews, data requests), `finance` (refunds), or `agent+finance`. They sign in with a phone code (CF-56). |
| See who has access | `dc exec api node dist/main.mjs ops-access list` |
| Remove access | `dc exec api node dist/main.mjs ops-access revoke 01XXXXXXXXX` (their sessions end at once) |

Every view and decision in the console is in the audit log (`audit.audit_events`), with the ops user's ID. Locally the same commands are `pnpm ops:access list|grant|revoke`.

## Payouts every Thursday

Link holds teachers' and centres' money and pays it out weekly (BR-OUT-01). Until a payout API is chosen, ops finance pay by hand:

1. **Thursday 09:00 (Cairo)** the worker makes the week's batch: one payout per teacher and centre with money to pay, a verified profile and a **verified payout account** (BR-OUT-03). The money leaves their available balance (P6). Ops can also press **Make this week's batch** in the console (safe to press twice).
2. Ops console → **Payouts** → first check any **payout accounts** waiting (holder name matches the teacher or centre; a small test transfer if in doubt) → Verify or Reject.
3. **Download CSV** on the batch: reference, payee, account holder, IBAN or wallet number, amount. Make each transfer in the bank's bulk upload or InstaPay. The download is in the audit log; delete the file once the transfers are done.
4. For each payout: **Mark sent** (type the bank or InstaPay reference), or **Mark bounced** with what the bank said — the money goes back to the payee's balance and their account shows "fix needed" in the app. When they add a new account and you verify it, **Retry this payout** (the same payout; never a second one for the week, BR-OUT-05).

## Restart, update, logs

| To | Run |
|---|---|
| See what runs and its health | `dc ps` |
| Restart one service | `dc restart api` (or `worker`, `gateway`, `web`, `ops`, `ai`, `caddy`) |
| Update to a new version | `git pull && dc up -d --build --wait` (migrations run first, in `migrate`; the services wait for it) |
| Logs (JSON, no personal data) | `dc logs -f --tail 200 api` · all of them: `dc logs -f --tail 50` |
| One service's health | `dc exec api wget -qO- http://127.0.0.1:4000/ready` · worker `:4003/health` · gateway `:4002/health` |
| Stop everything (keeps the data) | `dc down` |

Error tracking is optional: set `SENTRY_DSN` (any Sentry-compatible endpoint) and restart; every error-level log line is then reported, with no personal data.

## Back up and restore

`deploy/backup.sh` makes one encrypted backup (pg_dump → AES-256 with `BACKUP_PASSPHRASE`) in `BACKUP_DIR`, keeps the newest `BACKUP_KEEP`, and copies it to `BACKUP_S3_URI` if set (needs the `aws` CLI). Run it by hand any time. CI proves on every change that a backup restores and passes the cross-tenant suite.

Voice audio (`files` volume) is not in the database backup. It is deleted after 30 days anyway; back the volume up separately only if you want it.

**Restore** (into a new database first, to check it):

```bash
deploy/restore.sh /var/backups/link/link-link-20261009T021500Z.dump.enc          # → database link_restored
dc exec postgres psql -U postgres -d link_restored -c 'select count(*) from identity.users'
```

To make it the live database: `dc stop api worker gateway`, then `deploy/restore.sh <file> link --over-live` (asks you to type `restore`), then `dc up -d --wait`.

## Rotate keys

| Key | How | What happens |
|---|---|---|
| Database passwords (`APP_*_PASSWORD`) | Change them in `deploy/.env.production`, then `dc up -d --wait` (the `migrate` step sets the new passwords) | Nothing visible |
| `POSTGRES_PASSWORD`, `APP_MIGRATOR_PASSWORD` | `dc exec postgres psql -U postgres -c "ALTER ROLE app_migrator PASSWORD '…'"` (and for `postgres`), then the same value in the file | Nothing visible |
| `JWT_SIGNING_KEY` | New value **and** a new `JWT_SIGNING_KEY_ID`, then `dc up -d` | Everyone signs in again |
| `PAYMENT_WEBHOOK_SECRET`, `WHATSAPP_WEBHOOK_SECRET`, `AI_SERVICE_TOKEN` | Change it at the provider (or both containers) and here at the same time | Webhooks in between are refused and retried by the provider |
| `BACKUP_PASSPHRASE` | New value; new backups use it | Keep the old one for as long as you keep old backups |
| `FIELD_KEY`, `HMAC_KEY_LOOKUP`, `STORAGE_KEY` | **Do not change** after launch: the stored data is written with them. A key compromise needs re-encryption — a planned job, not a setting | core-api reports a key mismatch at start-up if one changed |

## When something is wrong

- **core-api refuses to start** with "Refusing to start with LINK_ENV=production": fix each ✗ setting it lists (`docs/go-live-switches.md`).
- **A service is unhealthy**: `dc logs --tail 100 <service>`; `dc restart <service>`.
- **Certificates**: Caddy needs ports 80 and 443 open and the DNS record in place; `dc logs caddy`.
- **Disk full**: old images (`docker image prune`), old backups (`BACKUP_KEEP`), logs.
- **A suspected breach**: follow the breach runbook, [docs/10 §9](10-security-privacy.md#9-breach-runbook).
