# Architecture notes

This document records the main architectural decisions for Ihy and the reasoning behind them.

## Backend: Python + FastAPI

Two project requirements drove the language choice:

1. **Tag editing is a core feature.** `mutagen` is the reference library for reading *and writing* audio metadata (ID3v2, FLAC/Vorbis comments, embedded cover art). Node.js alternatives are weak on writing; Go alternatives are mostly read-only.
2. **spotdl is a Python library.** The highest-priority roadmap feature integrates natively in the same codebase and worker process.

FastAPI provides async request handling, Pydantic validation, and auto-generated OpenAPI docs.

## Database: SQLite (WAL mode)

- Zero extra containers; a single file to back up. The right default for self-hosting (same choice as Navidrome and Jellyfin).
- 10k–100k tracks is a small workload for SQLite; reads are local and index-backed.
- WAL mode keeps reads non-blocking during library scans (the only write-heavy phase).
- Full-text search over tracks/artists/albums will use SQLite FTS5.
- SQLAlchemy 2.0 keeps the schema portable to PostgreSQL if concurrent-write load ever demands it.

## Audio streaming: direct file serving with HTTP Range

Modern browsers natively decode MP3 and FLAC. The backend serves audio files directly with HTTP Range support (seek = range request) — no transcoding pipeline for the MVP. `ffmpeg` ships in the Docker image for future needs (exotic formats, waveform generation).

## Remote storage: host mounts, not in-app clients

The application does **not** implement SMB/NFS clients. Remote sources are mounted on the host (or via Docker volume drivers) and appear to the app as regular directories. Less code, fewer failure modes, and full compatibility with any storage the host OS can mount — the same approach used by every major media server.

## Multi-user model

The music library (tracks, albums, artists, genres) is shared. Playlists, favorites, and listening history belong to individual users. Roles: `admin` (manage users, sources, global settings) and `user`.

## Background jobs

APScheduler runs in-process for the MVP (library scans). The `workers/` module is isolated so jobs can move to a dedicated worker container later (spotdl downloads, scheduled rescans) without touching business logic.

## Deployment: single Docker image

Multi-stage build: a Node stage compiles the React frontend; the final Python image serves both the API and the static assets. One container to run, two volumes to mount (`/data` for app state, `/music` for the library).
