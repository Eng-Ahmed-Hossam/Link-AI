#!/bin/sh
# Runs once, on an empty volume, as the container superuser.
# Local stand-in for what the cloud database admin does (Terraform, OD-31):
#   - the `link` database, owned by `app_migrator` (the only role migrations run as);
#   - `link_test`, the same for the core-api integration and RLS tests (they wipe it freely);
#   - the extensions, which need superuser for PostGIS.
# Migration 0001 repeats `CREATE EXTENSION IF NOT EXISTS` and creates the app roles.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE app_migrator LOGIN CREATEROLE PASSWORD '${APP_MIGRATOR_PASSWORD}';
CREATE DATABASE link OWNER app_migrator;
CREATE DATABASE link_test OWNER app_migrator;
SQL

for db in link link_test; do
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER SCHEMA public OWNER TO app_migrator;
SQL
done
