# Ihy

A self-hosted web application for streaming and managing your local music library (MP3, FLAC, and more), with advanced metadata editing built in.

## Features

### MVP (in development)

- **Music player** — play/pause, next/previous, shuffle, repeat, playback queue
- **Playlists and favorites** — per-user playlists and "liked" tracks
- **Library browsing** — automatic organization by tracks, artists, albums, and genres
- **Tag editor** — view and edit metadata (ID3 tags, cover art, year, genre, ...) for single files or in batch
- **Media sources** — local folders and remote storage (SMB/NFS via host mounts)
- **Multi-user** — shared music library with per-user playlists, favorites, and listening history

### Roadmap

- **spotdl integration** — watch artists/albums and download new releases automatically via scheduled background jobs
- **Lyrics** — automatic lyrics fetching (Genius or other open APIs)

## Tech stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Backend    | Python 3.12+, FastAPI, SQLAlchemy 2.0, Alembic                    |
| Database   | SQLite (WAL mode), PostgreSQL-ready via SQLAlchemy                |
| Audio tags | mutagen (read/write ID3, Vorbis comments, cover art)              |
| Frontend   | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand |
| Auth       | JWT (access + refresh tokens), Argon2 password hashing            |
| Jobs       | APScheduler (library scans, future spotdl downloads)              |
| Deployment | Single Docker image (multi-stage build), docker-compose           |

See [docs/architecture.md](docs/architecture.md) for the reasoning behind these choices.

## Project structure

```
ihy/
├── backend/          # FastAPI application
│   ├── app/
│   │   ├── api/      # HTTP routers (versioned under /api/v1)
│   │   ├── core/     # configuration, security, shared dependencies
│   │   ├── db/       # engine, session management
│   │   ├── models/   # SQLAlchemy models
│   │   ├── schemas/  # Pydantic request/response schemas
│   │   ├── services/ # business logic (scanner, tag editor, streaming, ...)
│   │   └── workers/  # background jobs (APScheduler)
│   ├── alembic/      # database migrations
│   └── tests/
├── frontend/         # React SPA
│   └── src/
│       ├── api/      # typed API client
│       ├── features/ # player, library, playlists, tag-editor, auth, admin
│       ├── stores/   # Zustand stores (player, queue)
│       └── ...
├── docker/           # Dockerfile and docker-compose.yml
└── docs/             # architecture and design notes
```

## Development setup

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate — Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

The interactive API documentation is available at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server runs at `http://localhost:5173` and proxies `/api` requests to the backend on port 8000.

### Tests and linting

```bash
# Backend
cd backend
ruff check .
pytest

# Frontend
cd frontend
npm run build
```

## Docker

```bash
cd docker
docker compose up -d --build
```

Edit `docker-compose.yml` first to mount your music folders and set `IHY_SECRET_KEY`. Remote sources (SMB/NFS) should be mounted on the host and passed to the container as regular volumes.

The image serves both the API and the built frontend on port 8000 and applies database migrations automatically on startup. App state lives in the `/data` volume; music folders are mounted under `/music` (or any path you configure as a source).

## Configuration

All settings can be overridden with environment variables using the `IHY_` prefix (see `backend/.env.example`):

| Variable          | Default             | Description                            |
| ----------------- | ------------------- | -------------------------------------- |
| `IHY_SECRET_KEY`  | change-me           | JWT signing key — set a random value   |
| `IHY_DATA_DIR`    | `./data`            | Database, cover cache, app state       |
| `IHY_DATABASE_URL`| sqlite in data dir  | Override to use PostgreSQL             |
