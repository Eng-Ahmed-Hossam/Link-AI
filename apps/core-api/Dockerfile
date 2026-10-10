# syntax=docker/dockerfile:1.7
# core-api production image (ship job S1): one image, three entrypoints —
#   node dist/main.mjs api | worker | gateway, and node dist/migrate.mjs (migrations).
# Built from the repo root: docker build -f apps/core-api/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
# Optional: an extra CA for a TLS-inspecting proxy (--secret id=extra_ca,src=ca.crt); none = ignored.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
 && pnpm install --frozen-lockfile --filter @link/core-api... \
 && pnpm --filter @link/core-api build \
 && pnpm --filter @link/core-api deploy --prod /out \
 && rm -rf /out/src /out/seeds /out/scripts /out/test /out/openapi.json /out/pnpm-*.yaml

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
# Voice audio when STORAGE_PROVIDER=file (a named volume in deploy/docker-compose.prod.yml).
RUN mkdir -p /var/lib/link/files && chown node:node /var/lib/link/files
USER node
EXPOSE 4000 4002
ENTRYPOINT ["node", "--enable-source-maps", "dist/main.mjs"]
CMD ["api"]
