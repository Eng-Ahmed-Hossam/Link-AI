#!/bin/sh
# deploy/backup.sh — one encrypted backup of Link's database (ship job S1; docs/operations.md).
# Nightly from cron on the server, e.g.:  15 2 * * *  cd /srv/link && deploy/backup.sh >> /var/log/link-backup.log 2>&1
#
#   pg_dump (custom format) → AES-256 with BACKUP_PASSPHRASE (openssl, PBKDF2) → BACKUP_DIR,
#   keeps the newest BACKUP_KEEP copies, and copies each to BACKUP_S3_URI when set (aws CLI).
# Settings come from deploy/.env.production (or the environment):
#   BACKUP_PASSPHRASE (required) · BACKUP_DIR (default /var/backups/link) · BACKUP_KEEP (default 14)
#   BACKUP_S3_URI (optional, s3://bucket/path) · PG_EXEC: how to reach the database container
#   (default: docker compose exec on the production compose) · PG_DATABASE (default link)
# The dump never leaves the server unencrypted. Restore: deploy/restore.sh <file>.
set -eu
cd "$(dirname "$0")/.."
ENV_FILE=${ENV_FILE:-deploy/.env.production}
if [ -f "$ENV_FILE" ]; then
  # Only the backup settings, never the rest of the file.
  eval "$(grep -E '^(BACKUP_[A-Z_]+)=' "$ENV_FILE" | sed 's/^/export /')"
fi
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE (deploy/.env.production)}"
DIR=${BACKUP_DIR:-/var/backups/link}
KEEP=${BACKUP_KEEP:-14}
DB=${PG_DATABASE:-link}
PG_EXEC=${PG_EXEC:-docker compose -f deploy/docker-compose.prod.yml --env-file $ENV_FILE exec -T postgres}

mkdir -p "$DIR"
chmod 700 "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DIR/link-$DB-$STAMP.dump.enc"
TMP="$OUT.part"
trap 'rm -f "$TMP"' EXIT

# shellcheck disable=SC2086
$PG_EXEC pg_dump -U postgres -d "$DB" -Fc \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$TMP"
[ -s "$TMP" ] || { echo "✗ backup is empty" >&2; exit 1; }
mv "$TMP" "$OUT"
chmod 600 "$OUT"
sha256sum "$OUT" | sed "s|$DIR/||" > "$OUT.sha256"
echo "✓ $(date -u +%FT%TZ) backup $OUT ($(du -h "$OUT" | cut -f1))"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp --only-show-errors "$OUT" "$BACKUP_S3_URI/" && aws s3 cp --only-show-errors "$OUT.sha256" "$BACKUP_S3_URI/"
  echo "✓ copied to $BACKUP_S3_URI"
fi

# Keep the newest KEEP backups of this database.
ls -1t "$DIR"/link-"$DB"-*.dump.enc 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old" "$old.sha256"
  echo "  removed $(basename "$old")"
done
