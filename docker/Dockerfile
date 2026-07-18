# ---- Stage 1: build the frontend ----
FROM node:24-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: runtime ----
FROM python:3.13-slim AS runtime

# ffmpeg: reserved for future transcoding and waveform generation
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/ ./
RUN pip install --no-cache-dir ".[spotdl]"

COPY --from=frontend-build /build/dist /app/static

ENV IHY_STATIC_DIR=/app/static \
    IHY_DATA_DIR=/data

VOLUME ["/data", "/music"]
EXPOSE 8000

# Apply database migrations, then start the API server
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
