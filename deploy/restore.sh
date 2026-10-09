#!/bin/sh
# deploy/restore.sh <backup.dump.enc> [target-database] — restore one encrypted backup
# (docs/operations.md). Into a NEW database by default (link_restored): check it, then switch.
# Restoring over the live database needs --over-live and a typed "restore" (it stops nothing
# for you: stop api, worker and gateway first).
#   BACKUP_PASSPHRASE (required), PG_EXEC as in backup.sh.
set -eu
cd "$(dirname "$0")/.."
FILE=${1:?usage: deploy/restore.sh <backup.dump.enc> [target-database] [--over-live]}
TARGET=${2:-link_restored}
ENV_FILE=${ENV_FILE:-deploy/.env.production}
if [ -f "$ENV_FILE" ]; then
  eval "$(grep -E '^(BACKUP_[A-Z_]+)=' "$ENV_FILE" | sed 's/^/export /')"
fi
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
PG_EXEC=${PG_EXEC:-docker compose -f deploy/docker-compose.prod.yml --env-file $ENV_FILE exec -T postgres}

if [ -f "$FILE.sha256" ]; then
  (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" > /dev/null) \
    || { echo "✗ checksum does not match: $FILE" >&2; exit 1; }
fi
if [ "$TARGET" = "link" ]; then
  case " $* " in *" --over-live "*) ;; *) echo "✗ restoring over the live database needs --over-live" >&2; exit 1 ;; esac
  printf 'This replaces the live database "link". Type "restore" to continue: '
  read -r answer
  [ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }
fi

# A fresh database owned by app_migrator, with the extensions (superuser) — as the init script does.
# shellcheck disable=SC2086
$PG_EXEC psql -U postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$TARGET\" WITH (FORCE)" -c "CREATE DATABASE \"$TARGET\" OWNER app_migrator"
# shellcheck disable=SC2086
$PG_EXEC psql -U postgres -d "$TARGET" -v ON_ERROR_STOP=1 -q -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS btree_gist; ALTER SCHEMA public OWNER TO app_migrator;"
# shellcheck disable=SC2086
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" \
  | $PG_EXEC pg_restore -U postgres -d "$TARGET" --exit-on-error
# shellcheck disable=SC2086
TABLES=$($PG_EXEC psql -U postgres -d "$TARGET" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema','tiger','topology')")
echo "✓ restored $(basename "$FILE") into \"$TARGET\" ($TABLES tables)"
