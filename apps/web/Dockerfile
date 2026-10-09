# syntax=docker/dockerfile:1.7
# Web production image (ship job S1): the public site, parent app and centre web in live mode,
# as a Next.js standalone server. NEXT_PUBLIC_* values are fixed at build time.
# Built from the repo root: docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /repo
ENV CI=1 NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone NEXT_PUBLIC_API_MODE=live
# production: real users (demo code swapped for a stub, guard in next.config.ts); staging: the
# same build with LINK_ENV=staging for pnpm prod:local.
ARG NEXT_PUBLIC_APP_ENV=production
ARG NEXT_PUBLIC_SITE_URL=https://example.invalid
# Where the web server forwards /v1 (core-api on the server's private network).
ARG CORE_API_URL=http://api:4000
ARG NEXT_PUBLIC_POSTHOG_KEY=
ARG NEXT_PUBLIC_CONTACT_EMAIL=
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    CORE_API_URL=$CORE_API_URL NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL
RUN corepack enable
COPY . .
# Optional: an extra CA for a TLS-inspecting proxy (--secret id=extra_ca,src=ca.crt); none = ignored.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
 && pnpm install --frozen-lockfile --filter @link/web... \
 && pnpm --filter @link/web exec next build \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
 && cp -r apps/web/public apps/web/.next/standalone/apps/web/public

FROM node:24-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone /app
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
