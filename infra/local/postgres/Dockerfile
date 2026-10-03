# PostgreSQL 16 + pgvector + PostGIS 3 (docs/14 §2, docs/06 §0).
# Base: the official pgvector image (postgres:16 on Debian bookworm). PostGIS comes from the
# PGDG apt repository that the postgres image already configures. (The postgis/postgis:16
# image is on Debian bullseye, whose PGDG repository is archived, so pgvector can't be added there.)
FROM pgvector/pgvector:pg16

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
 && rm -rf /var/lib/apt/lists/*

COPY initdb/ /docker-entrypoint-initdb.d/
