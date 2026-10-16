# The hosted staging's nightly backup (Stage 3): a Railway cron service runs deploy/backup.sh
# unchanged against the private Postgres. Built from the repo root:
#   docker build -f deploy/backup.Dockerfile .
# Settings (Railway variables, values never in git): BACKUP_PASSPHRASE (required), PGHOST,
# PGUSER, PGPASSWORD (the private Postgres), PG_DATABASE=link, PG_EXEC=env (pg_dump runs here,
# not through docker compose), BACKUP_DIR=/backups (a volume), BACKUP_KEEP (default 14).
# The client must match the server's major version (Postgres 16).
FROM postgres:16-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY deploy/backup.sh deploy/backup.sh
RUN chmod +x deploy/backup.sh
CMD ["sh", "deploy/backup.sh"]
