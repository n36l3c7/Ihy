<p align="center">
  <img src="docs/assets/banner.png" alt="Ihy — self-hosted music, ancient soul" width="100%">
</p>

<p align="center">
  <a href="https://github.com/n36l3c7/Ihy/releases"><img src="https://img.shields.io/github/v/release/n36l3c7/Ihy?color=d9a441&label=release" alt="Release"></a>
  <img src="https://img.shields.io/badge/python-3.13-3fb8a5" alt="Python 3.13">
  <img src="https://img.shields.io/badge/react-19-3fb8a5" alt="React 19">
  <img src="https://img.shields.io/badge/docker-single%20image-2e5e8c" alt="Docker">
  <img src="https://img.shields.io/badge/OpenSubsonic-compatible-d9a441" alt="OpenSubsonic">
  <a href="https://n36l3c7.github.io/Ihy/"><img src="https://img.shields.io/badge/website-n36l3c7.github.io%2FIhy-14100b" alt="Website"></a>
</p>

**Ihy** is a self-hosted music server and web player, named after the Egyptian god of
music — the child of Hathor, always depicted playing the **sistrum**, the sacred rattle
whose bars inspired the logo (look closely: they are equalizer bars).

Point it at your music folders and you get a fast, multi-user, installable web app with
serious playback features, a full tag editor, automatic downloads and an API that your
favourite mobile apps already speak.

---

## Features

### Player
- Gapless playback with optional **crossfade** (3–12s) — the next track is preloaded and
  handed over through the Web Audio graph
- **10-band equalizer**, playback speed, sleep timer, bookmarks, "stop after this track"
- **Volume normalization** (ReplayGain tags read at scan time + ffmpeg EBU R128 analysis
  for untagged files, −18 LUFS reference)
- **Autoplay radio**: when the queue ends, similar tracks keep the music going
- Queue panel with drag-and-drop, **saved queues** that remember the exact position
- **Cross-tab sync** (Spotify Connect-style): any browser tab can control the one playing
- **Chromecast** support and OS media keys / lock-screen controls (MediaSession)
- Fullscreen Now Playing with cover-tinted background and **synced karaoke lyrics**

### Library
- Tracks, artists, albums, genres and folder browsing, with search, pagination,
  grid/list views, multi-select, bulk actions and right-click context menus everywhere
- **Multi-artist tags** split on configurable separators ("ACDC/Kiss" → two artists)
- Full **tag editor**: single track, batch, and an mp3tag-style per-album editor —
  changes are written to the files and re-synced
- Covers from tags or folder images, **artist images** fetched automatically (Deezer)
  or uploaded, **artist bios** from Wikipedia
- Playlists with **M3U/M3U8/XSPF import and export**
- **Smart playlists**: rule engine (genre, artist, year, duration, play count, liked,
  added/played time windows) with all/any matching, sorting and limits
- Favorites, listening history, statistics, incremental library scans

### Integrations
- **OpenSubsonic API**: connect Symfonium, Tempo, DSub, play:Sub and friends with a
  dedicated per-user secret (your real password is never exposed)
- **Scrobbling** to ListenBrainz and Last.fm, per user
- **spotdl**: watch artists or albums and download new releases on a cron-style
  schedule, with live logs and one-click fixing of failed downloads
- **On-demand Opus transcoding** (64–320 kbps) with a disk cache — full seeking support
- Lyrics from lrclib.net, cached locally

### Platform
- **Installable PWA** with a service worker: offline app shell and **offline downloads**
  (tracks stored in the browser, playable with no network)
- Responsive **mobile UI**: bottom navigation, compact mini-player, fullscreen queue
- **Command palette** (`Ctrl+K`) and global keyboard shortcuts
- **8 themes**, including the Egypt-x-cyberpunk *Neon Nile* and *Glitch*
- **Multi-user**: shared library, per-user playlists/favorites/history, admin accounts
- **Backup/restore** of settings and user data with selectable sections
- HTTPS out of the box (self-signed certificate generated on first start)

## Minimum requirements

| | Minimum |
|---|---|
| Runtime | Docker Engine 24+ with Compose v2 (any OS) |
| Memory | ~1 GB RAM for the container |
| Disk | space for your library + a few hundred MB for `/data` (covers, transcodes, DB) |
| Browser | a current Chrome, Edge, Firefox or Safari |
| Optional | a Spotify account for spotdl watches, Chromecast on the same LAN |

Everything else (Python, Node, ffmpeg, spotdl, Deno) is bundled inside the image.

## Installation

```bash
git clone https://github.com/n36l3c7/Ihy.git
cd Ihy/docker

# secrets live in a gitignored .env next to the compose file
echo "IHY_SECRET_KEY=$(openssl rand -hex 32)" > .env

# edit docker-compose.yml to mount your music folders, then:
docker compose up -d --build
```

Open **https://localhost:8000** (or your server's address). The first visit asks you to
create the admin account; then add your mounted folders under *Settings → Sources* and
run a scan.

- Migrations run automatically on startup.
- HTTPS uses a self-signed certificate generated into the `/data` volume on first start;
  import `/data/ssl/cert.pem` on your devices to make browsers fully trust it (required
  for PWA install and offline downloads), or set `IHY_SSL=off` for plain HTTP behind a
  reverse proxy.
- Remote music (SMB/NFS) should be mounted on the host and passed through as volumes.

### Updating

```bash
git pull
docker compose up -d --build
```

## Usage notes

- **Mobile apps**: your Subsonic credentials (server, username, generated secret) are in
  the *Scrobbling* page; the secret can be rotated at any time.
- **Install as an app**: use the browser's "Add to Home Screen" / "Install app".
- **Keyboard**: `Space` play/pause · `←/→` seek ±5s · `↑/↓` volume · `Ctrl+K` palette.
- **Offline**: the download button on playlists and albums stores audio in the browser;
  manage it from the *Downloads* page.

## Configuration

Environment variables (prefix `IHY_`), usually set in `docker/.env`:

| Variable | Default | Description |
| --- | --- | --- |
| `IHY_SECRET_KEY` | change-me | JWT signing key — set a long random value |
| `IHY_DATA_DIR` | `/data` (image) | Database, covers, transcodes, certificates |
| `IHY_DATABASE_URL` | SQLite in data dir | Override to use PostgreSQL |
| `IHY_SSL` | `auto` | `auto` = HTTPS with generated/mounted cert, `off` = plain HTTP |
| `IHY_SSL_SAN` | — | Extra certificate names, e.g. `IP:192.168.1.10,DNS:ihy.home` |
| `IHY_SSL_CERT` / `IHY_SSL_KEY` | `/data/ssl/*` | Paths to your own certificate pair |
| `IHY_SPOTDL_COMMAND` | `/opt/spotdl/bin/spotdl` (image) | spotdl executable |
| `IHY_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifetime |

## Development

```bash
# backend — http://localhost:8000 (API docs at /docs)
cd backend
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# frontend — http://localhost:5173, proxies /api to :8000
cd frontend
npm install
npm run dev
```

Quality gates: `ruff check .` and `pytest` in `backend/` (193 tests),
`npm run build` in `frontend/` (type-checks and bundles).

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0, Alembic, APScheduler |
| Database | SQLite (WAL) by default, PostgreSQL-ready |
| Audio | mutagen (tags), ffmpeg (loudness analysis, Opus transcoding) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, Zustand |
| Auth | JWT (access + refresh), Argon2 hashing; separate Subsonic secrets |
| Deployment | Single multi-stage Docker image, HTTPS entrypoint |

More background in [docs/architecture.md](docs/architecture.md).

## Credits

Lyrics by [lrclib.net](https://lrclib.net) · artist images by
[Deezer](https://developers.deezer.com) · bios by
[Wikipedia](https://en.wikipedia.org) · downloads by
[spotDL](https://github.com/spotDL/spotify-downloader) · feature inspiration from
Musicolet and monochrome.tf · named after
[Ihy](https://en.wikipedia.org/wiki/Ihy), god of music and the sistrum.
