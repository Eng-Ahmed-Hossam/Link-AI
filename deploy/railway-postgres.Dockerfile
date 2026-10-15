# PostgreSQL 16 with pgvector and PostGIS for Railway.
# Railway builds this file from the repository root, unlike the local Compose
# build whose context is infra/local/postgres.
FROM pgvector/pgvector:pg16

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
 && rm -rf /var/lib/apt/lists/*

COPY infra/local/postgres/initdb/ /docker-entrypoint-initdb.d/
