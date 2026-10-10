# syntax=docker/dockerfile:1.7
# Ops console production image (ship job S2): a Next.js standalone server, live only. On the server
# Caddy serves it at ops.<LINK_DOMAIN> and sends /v1/* straight to core-api (OPS_IP_ALLOWLIST
# needs the real client address). Built from the repo root: docker build -f apps/ops/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /repo
ENV CI=1 NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
# Only used if the Next server itself forwards /v1 (no Caddy in front).
ARG CORE_API_URL=http://api:4000
ENV CORE_API_URL=$CORE_API_URL
RUN corepack enable
COPY . .
# Optional: an extra CA for a TLS-inspecting proxy (--secret id=extra_ca,src=ca.crt); none = ignored.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
 && pnpm install --frozen-lockfile --filter @link/ops... \
 && pnpm --filter @link/ops exec next build \
 && cp -r apps/ops/.next/static apps/ops/.next/standalone/apps/ops/.next/static

FROM node:24-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/ops/.next/standalone /app
USER node
EXPOSE 3001
CMD ["node", "apps/ops/server.js"]
