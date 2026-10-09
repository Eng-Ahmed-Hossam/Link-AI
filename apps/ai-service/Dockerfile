# syntax=docker/dockerfile:1.7
# ai-service production image (ship job S1): local Whisper + extraction. The speech models are a
# volume (AI_MODELS_DIR=/models), downloaded once with `pnpm ai:models` or the image's
# `python scripts/download_models.py`; nothing is baked in. Built from the repo root:
#   docker build -f apps/ai-service/Dockerfile .
FROM python:3.12-slim AS build
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never
# Optional: an extra CA for a TLS-inspecting proxy (--secret id=extra_ca,src=ca.crt); none = ignored.
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
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 AI_SERVICE_HOST=0.0.0.0 AI_MODELS_DIR=/models
USER link
EXPOSE 8090
CMD ["python", "-m", "ai_service"]
