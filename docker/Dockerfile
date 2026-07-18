# ---- Stage 1: build the frontend ----
FROM node:24-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
# Retries harden the install against transient DNS/network hiccups
# (Alpine's musl resolver occasionally drops a lookup mid-install)
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 5000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: runtime ----
FROM python:3.13-slim AS runtime

# ffmpeg: loudness analysis and Opus transcoding
# openssl: self-signed certificate generation at first start (entrypoint.sh)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg openssl \
    && rm -rf /var/lib/apt/lists/*

# spotdl lives in its own virtualenv: its dependencies (fastapi<0.104)
# conflict with the API's. Deno is pre-downloaded at build time because
# some YouTube downloads require it as a JS runtime.
RUN python -m venv /opt/spotdl \
    && /opt/spotdl/bin/pip install --no-cache-dir spotdl \
    && /opt/spotdl/bin/spotdl --download-deno \
    && rm -rf /root/.cache/pip

WORKDIR /app
COPY backend/ ./
RUN pip install --no-cache-dir .

COPY --from=frontend-build /build/dist /app/static
COPY docker/entrypoint.sh /app/entrypoint.sh

ENV IHY_STATIC_DIR=/app/static \
    IHY_DATA_DIR=/data \
    IHY_SPOTDL_COMMAND=/opt/spotdl/bin/spotdl

VOLUME ["/data", "/music"]
EXPOSE 8000

# Migrations + HTTPS (self-signed on first start unless IHY_SSL=off) + API
CMD ["sh", "/app/entrypoint.sh"]
