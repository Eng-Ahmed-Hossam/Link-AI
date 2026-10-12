# syntax=docker/dockerfile:1.7
# Hosted demo image: private CPU Whisper plus the fake-data demo API. The browser talks only to the
# demo API; its shared AI token never leaves this container.
FROM node:24-bookworm-slim AS demo
RUN corepack enable
WORKDIR /demo
COPY . .
RUN pnpm install --frozen-lockfile --filter @link/mocks...

FROM python:3.12-slim AS build
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export PIP_CERT=/run/secrets/extra_ca; fi \
 && pip install --no-cache-dir uv==0.8.4
WORKDIR /src/apps/ai-service
COPY py/link_nlp /src/py/link_nlp
COPY apps/ai-service/pyproject.toml apps/ai-service/uv.lock ./
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export SSL_CERT_FILE=/run/secrets/extra_ca; fi \
 && uv sync --frozen --no-dev --no-editable --no-install-project
COPY apps/ai-service/ai_service ./ai_service
COPY apps/ai-service/scripts/download_models.py ./scripts/download_models.py

FROM python:3.12-slim
RUN useradd --system --uid 10001 --home /app link && mkdir -p /models && chown link /models
WORKDIR /app
COPY --from=build /src/apps/ai-service/.venv /app/.venv
COPY --from=build /src/apps/ai-service/ai_service /app/ai_service
COPY --from=build /src/apps/ai-service/scripts /app/scripts
COPY --from=demo /usr/local/bin/node /usr/local/bin/node
COPY --from=demo /usr/local/bin/corepack /usr/local/bin/corepack
COPY --from=demo /usr/local/bin/pnpm /usr/local/bin/pnpm
COPY --from=demo /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=demo /demo /demo
RUN mkdir -p /demo/packages/mocks/.data && chown -R link /demo/packages/mocks/.data
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 AI_SERVICE_HOST=127.0.0.1 AI_MODELS_DIR=/models
USER link
EXPOSE 8090 8091
CMD ["python", "-m", "ai_service"]
