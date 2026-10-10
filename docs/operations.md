# Operations (one server)

How to run Link for real users on one Linux server with Docker: first start, restart, logs, backups, restore and key rotation. Everything is in `deploy/`; what each setting does is in [go-live-switches.md](go-live-switches.md); the security items are in [security-checklist.md](security-checklist.md). Try any of it first on your own machine with `pnpm prod:local` (the same images and compose, with the local fakes and sample data).

Below, `dc` means:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production
```

## First start

1. A server with Docker (Ubuntu 24.04 LTS or similar): 4 vCPU, 8 GB RAM and 60 GB disk without voice notes; add 8 GB RAM (or a GPU) for ai-service.
2. Point the domain's DNS `A` record at the server. Open ports 80 and 443 only.
3. On the server: `git clone https://github.com/Eng-Ahmed-Hossam/Link-AI.git /srv/link && cd /srv/link`.
4. `pnpm prod:env --domain link.example.com` (or copy `deploy/.env.production.example` by hand), then fill in `ACME_EMAIL`, `NEXT_PUBLIC_CONTACT_EMAIL` and the provider settings. **Copy `FIELD_KEY`, `HMAC_KEY_LOOKUP`, `STORAGE_KEY` and `BACKUP_PASSPHRASE` somewhere safe away from the server**: without them, neither the database nor the backups can be read.
5. `dc up -d --build --wait`. Add `--profile ai` for voice notes, then download the speech models once: `dc --profile ai run --rm ai python scripts/download_models.py`.
6. Check it: `dc ps` (every service `healthy`), `curl -s https://link.example.com/v1/curricula`. If core-api refuses to start, its log names every wrong setting (`dc logs api`).
7. Nightly backups: `crontab -e` → `15 2 * * * cd /srv/link && deploy/backup.sh >> /var/log/link-backup.log 2>&1`.

## Restart, update, logs

| To | Run |
|---|---|
| See what runs and its health | `dc ps` |
| Restart one service | `dc restart api` (or `worker`, `gateway`, `web`, `ai`, `caddy`) |
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
