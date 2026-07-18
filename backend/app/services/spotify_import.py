"""Import a Spotify playlist: spotdl downloads the tracks, then an Ihy
playlist is built in the same order by matching the library.

Pipeline (background thread): save metadata -> download -> scan -> match.
"""

import json
import logging
import shutil
import subprocess
import threading
import time
from collections import deque
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.library import Source, Track
from app.models.user import User
from app.services import app_settings, user_library
from app.services.downloads import run_spotdl, spotdl_available
from app.services.scan_manager import scan_manager

logger = logging.getLogger(__name__)

SCAN_WAIT_SECONDS = 600


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def save_playlist_metadata(url: str, options: dict) -> list[dict]:
    """Run `spotdl save` to fetch the playlist's track metadata as JSON."""
    executable = shutil.which(get_settings().spotdl_command)
    if executable is None:
        raise RuntimeError("spotdl executable not found")
    save_path = get_settings().data_dir / "spotify-import.spotdl"
    save_path.parent.mkdir(parents=True, exist_ok=True)
    command = [executable, "save", url, "--save-file", str(save_path)]
    if options.get("client_id") and options.get("client_secret"):
        command += [
            "--client-id",
            str(options["client_id"]),
            "--client-secret",
            str(options["client_secret"]),
        ]
    completed = subprocess.run(
        command, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=600,
    )
    if completed.returncode != 0 or not save_path.is_file():
        tail = (completed.stdout or "").strip().splitlines()[-3:]
        raise RuntimeError("spotdl save failed: " + " / ".join(tail))
    entries = json.loads(save_path.read_text(encoding="utf-8"))
    save_path.unlink(missing_ok=True)
    return entries


def _normalize(value: str) -> str:
    return " ".join(value.lower().split())


def match_entries(db: Session, entries: list[dict]) -> list[Track | None]:
    """Match spotdl metadata entries to library tracks by title + artist,
    falling back to title only."""
    tracks = list(
        db.scalars(select(Track).options(selectinload(Track.artists)))
    )
    by_title: dict[str, list[Track]] = {}
    for track in tracks:
        by_title.setdefault(_normalize(track.title), []).append(track)

    matched: list[Track | None] = []
    for entry in entries:
        title = _normalize(str(entry.get("name") or ""))
        wanted = {_normalize(str(artist)) for artist in entry.get("artists") or []}
        candidates = by_title.get(title, [])
        chosen = None
        for candidate in candidates:
            have = {_normalize(artist.name) for artist in candidate.artists}
            if wanted & have:
                chosen = candidate
                break
        if chosen is None and candidates:
            chosen = candidates[0]
        matched.append(chosen)
    return matched


class SpotifyImportManager:
    """One playlist import at a time, in a background thread."""

    def __init__(self):
        self._lock = threading.Lock()
        self._running = False
        self.state: str = "idle"  # saving | downloading | scanning | building | done | error
        self.error: str | None = None
        self.total = 0
        self.matched = 0
        self.playlist_id: int | None = None
        self.playlist_name: str | None = None
        self.finished_at: datetime | None = None
        self._log: deque[str] = deque(maxlen=200)

    @property
    def running(self) -> bool:
        return self._running

    @property
    def log_lines(self) -> list[str]:
        return list(self._log)

    def start(self, user_id: int, url: str, name: str | None, source_id: int | None) -> bool:
        with self._lock:
            if self._running:
                return False
            self._running = True
        self.state = "saving"
        self.error = None
        self.total = 0
        self.matched = 0
        self.playlist_id = None
        self.playlist_name = None
        self._log.clear()
        threading.Thread(
            target=self._run,
            args=(user_id, url, name, source_id),
            name="spotify-playlist-import",
            daemon=True,
        ).start()
        return True

    def _wait_for_scan(self) -> None:
        deadline = time.monotonic() + SCAN_WAIT_SECONDS
        while scan_manager.running and time.monotonic() < deadline:
            time.sleep(1)

    def _run(self, user_id: int, url: str, name: str | None, source_id: int | None) -> None:
        try:
            with SessionLocal() as db:
                options = app_settings.get_spotdl_options(db)
                source = (
                    db.get(Source, source_id)
                    if source_id is not None
                    else db.scalar(
                        select(Source).where(Source.enabled.is_(True)).order_by(Source.id)
                    )
                )
                if source is None:
                    raise RuntimeError("No enabled source folder to download into")
                output_dir = Path(source.path)

            self._log.append(f"[{_utcnow():%H:%M:%S}] Fetching playlist metadata...")
            entries = save_playlist_metadata(url, options)
            self.total = len(entries)
            list_name = (
                name
                or str((entries[0].get("list_name") if entries else None) or "")
                or "Spotify import"
            ).strip()[:100]
            self.playlist_name = list_name
            self._log.append(f"Playlist: {list_name} ({self.total} tracks)")

            self.state = "downloading"
            success, detail = run_spotdl(url, output_dir, options, self._log.append)
            if not success:
                # Continue anyway: some tracks may have downloaded fine
                tail = detail.splitlines()[-1] if detail else ""
                self._log.append(f"spotdl finished with errors: {tail}")

            self.state = "scanning"
            self._log.append("Scanning the library...")
            self._wait_for_scan()  # a watcher-triggered scan may already run
            scan_manager.start(full=False)
            time.sleep(1)
            self._wait_for_scan()

            self.state = "building"
            with SessionLocal() as db:
                user = db.get(User, user_id)
                if user is None:
                    raise RuntimeError("Requesting user no longer exists")
                matched = match_entries(db, entries)
                playlist = user_library.create_playlist(db, user, name=list_name)
                for track in matched:
                    if track is not None:
                        user_library.add_playlist_item(db, playlist, track)
                db.commit()
                self.matched = sum(1 for track in matched if track is not None)
                self.playlist_id = playlist.id
            self._log.append(
                f"Playlist created: {self.matched}/{self.total} tracks matched"
            )
            self.state = "done"
        except Exception as exc:
            logger.exception("Spotify playlist import failed")
            self.error = str(exc)[:500]
            self.state = "error"
            self._log.append(f"Import failed: {self.error}")
        finally:
            self.finished_at = _utcnow()
            self._running = False


spotify_import_manager = SpotifyImportManager()


__all__ = [
    "SpotifyImportManager",
    "match_entries",
    "save_playlist_metadata",
    "spotdl_available",
    "spotify_import_manager",
]
