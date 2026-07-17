import logging
from collections.abc import Callable
from pathlib import Path

from mutagen.flac import FLAC
from mutagen.id3 import ID3
from mutagen.mp4 import MP4, MP4Cover
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.library import Album, Track

logger = logging.getLogger(__name__)

CoverExtractor = Callable[[Path], "tuple[bytes, str] | None"]


def extract_embedded_cover(path: Path) -> tuple[bytes, str] | None:
    """Return (image bytes, mime type) from a file's embedded artwork, if any."""
    suffix = path.suffix.lower()
    try:
        if suffix == ".mp3":
            pictures = ID3(path).getall("APIC")
            if pictures:
                return pictures[0].data, pictures[0].mime or "image/jpeg"
        elif suffix == ".flac":
            pictures = FLAC(path).pictures
            if pictures:
                return pictures[0].data, pictures[0].mime or "image/jpeg"
        elif suffix == ".m4a":
            audio = MP4(path)
            covers = audio.tags.get("covr") if audio.tags else None
            if covers:
                is_png = covers[0].imageformat == MP4Cover.FORMAT_PNG
                return bytes(covers[0]), "image/png" if is_png else "image/jpeg"
    except Exception:
        logger.warning("Failed to extract embedded cover from %s", path)
    return None


def resolve_album_cover(
    db: Session,
    album: Album,
    covers_dir: Path | None = None,
    extract: CoverExtractor = extract_embedded_cover,
) -> Path | None:
    """Find the album cover: folder image, extraction cache, or embedded artwork."""
    if album.cover_path:
        cover = Path(album.cover_path)
        if cover.is_file():
            return cover

    if covers_dir is None:
        covers_dir = get_settings().data_dir / "covers"
    for suffix in (".jpg", ".png"):
        cached = covers_dir / f"album_{album.id}{suffix}"
        if cached.is_file():
            return cached

    track = db.scalar(
        select(Track).where(Track.album_id == album.id, Track.has_embedded_cover.is_(True))
    )
    if track is None:
        return None
    extracted = extract(Path(track.file_path))
    if extracted is None:
        return None
    data, mime = extracted
    covers_dir.mkdir(parents=True, exist_ok=True)
    target = covers_dir / f"album_{album.id}{'.png' if mime == 'image/png' else '.jpg'}"
    target.write_bytes(data)
    return target
