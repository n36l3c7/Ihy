import logging
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import httpx
import mutagen
from mutagen.id3 import ID3
from mutagen.mp4 import MP4
from sqlalchemy.orm import Session

from app.models.library import Track
from app.models.lyrics import Lyrics

logger = logging.getLogger(__name__)

LRCLIB_URL = "https://lrclib.net/api/get"
USER_AGENT = "Ihy self-hosted music server (https://github.com/n36l3c7/Ihy)"

# fetcher(track) -> (plain, synced) or None when nothing was found
LyricsFetcher = Callable[[Track], "tuple[str | None, str | None] | None"]


def read_embedded_lyrics(path: Path) -> str | None:
    """Read unsynced lyrics stored inside the audio file itself."""
    suffix = path.suffix.lower()
    try:
        if suffix == ".mp3":
            frames = ID3(path).getall("USLT")
            if frames and str(frames[0].text).strip():
                return str(frames[0].text)
        elif suffix == ".m4a":
            audio = MP4(path)
            values = audio.tags.get("\xa9lyr") if audio.tags else None
            if values and str(values[0]).strip():
                return str(values[0])
        else:  # FLAC / OGG use Vorbis comments
            audio = mutagen.File(path)
            if audio is not None and audio.tags:
                for key in ("lyrics", "unsyncedlyrics"):
                    values = audio.tags.get(key)
                    if values and str(values[0]).strip():
                        return str(values[0])
    except Exception:
        logger.warning("Failed to read embedded lyrics from %s", path)
    return None


def fetch_from_lrclib(track: Track) -> tuple[str | None, str | None] | None:
    """Look the track up on lrclib.net (open API, no key required)."""
    if not track.artists or not track.title:
        return None
    params: dict[str, str | int] = {
        "artist_name": track.artists[0].name,
        "track_name": track.title,
        "duration": int(track.duration),
    }
    if track.album is not None:
        params["album_name"] = track.album.title
    try:
        response = httpx.get(
            LRCLIB_URL, params=params, timeout=10, headers={"User-Agent": USER_AGENT}
        )
    except httpx.HTTPError as exc:
        logger.warning("lrclib request failed: %s", exc)
        return None
    if response.status_code != 200:
        return None
    data = response.json()
    plain = data.get("plainLyrics") or None
    synced = data.get("syncedLyrics") or None
    if plain is None and synced is None:
        return None
    return plain, synced


def get_or_fetch(
    db: Session,
    track: Track,
    *,
    refresh: bool = False,
    fetcher: LyricsFetcher | None = None,
) -> Lyrics:
    """Return cached lyrics, or resolve them: embedded tag first, then lrclib.
    The result (including "not found") is cached until an explicit refresh."""
    existing = db.get(Lyrics, track.id)
    if existing is not None and not refresh:
        return existing

    if fetcher is None:
        fetcher = fetch_from_lrclib

    content: str | None = None
    synced: str | None = None
    source: str | None = None
    embedded = read_embedded_lyrics(Path(track.file_path))
    if embedded is not None:
        content, source = embedded, "file"
    else:
        fetched = fetcher(track)
        if fetched is not None:
            content, synced = fetched
            source = "lrclib"

    if existing is None:
        existing = Lyrics(track_id=track.id)
        db.add(existing)
    existing.content = content
    existing.synced_content = synced
    existing.source = source
    existing.fetched_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(existing)
    return existing
