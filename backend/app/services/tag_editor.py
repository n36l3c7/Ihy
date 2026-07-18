import io
import logging
from pathlib import Path
from typing import Any

import mutagen
from PIL import Image
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.library import Album, Track
from app.services import app_settings, tag_reader
from app.services.scanner import _apply_info, _EntityCache, _prune_orphans

logger = logging.getLogger(__name__)

COVER_MAX_BYTES = 10 * 1024 * 1024


class TagEditError(Exception):
    pass


class FileMissingError(TagEditError):
    def __init__(self, path: str):
        super().__init__(f"Audio file not available: {path}")


class UnsupportedFormatError(TagEditError):
    def __init__(self, path: str):
        super().__init__(f"Unsupported or unreadable audio format: {path}")


class InvalidImageError(TagEditError):
    pass


# API field -> mutagen easy tag key (normalized across ID3, Vorbis and MP4)
_TAG_KEYS = {
    "title": "title",
    "artists": "artist",
    "album": "album",
    "album_artist": "albumartist",
    "genres": "genre",
    "year": "date",
    "track_number": "tracknumber",
    "disc_number": "discnumber",
}


def write_tags_to_file(path: Path, changes: dict[str, Any]) -> None:
    """Write the provided tag fields to the audio file. None/empty removes the tag."""
    try:
        audio = mutagen.File(path, easy=True)
    except Exception as exc:
        raise UnsupportedFormatError(str(path)) from exc
    if audio is None:
        raise UnsupportedFormatError(str(path))
    if audio.tags is None:
        audio.add_tags()

    for field, key in _TAG_KEYS.items():
        if field not in changes:
            continue
        value = changes[field]
        if value is None:
            values: list[str] = []
        elif isinstance(value, list):
            values = [str(item).strip() for item in value if str(item).strip()]
        else:
            text = str(value).strip()
            values = [text] if text else []
        if values:
            audio[key] = values
        elif key in audio:
            del audio[key]
    audio.save()


def refresh_track_from_file(db: Session, track: Track) -> Track:
    """Re-read the file and update the database record, exactly like a scan would."""
    path = Path(track.file_path)
    info = tag_reader.read_audio_file(path)
    if info is None:
        raise UnsupportedFormatError(track.file_path)
    separators = app_settings.get_metadata_separators(db)
    cache = _EntityCache(db)
    _apply_info(cache, track, info, path.stat(), path, separators)
    _prune_orphans(db)
    db.commit()
    db.refresh(track)
    return track


def update_track_tags(db: Session, track: Track, changes: dict[str, Any]) -> Track:
    """Write tags to the file, then refresh the database from what is on disk."""
    path = Path(track.file_path)
    if not path.is_file():
        raise FileMissingError(track.file_path)
    write_tags_to_file(path, changes)
    return refresh_track_from_file(db, track)


def batch_update_tags(
    db: Session, tracks: list[Track], changes: dict[str, Any]
) -> tuple[int, list[str]]:
    """Apply the same tag changes to many tracks. Failures do not abort the batch."""
    updated = 0
    errors: list[str] = []
    for track in tracks:
        try:
            update_track_tags(db, track, changes)
            updated += 1
        except TagEditError as exc:
            errors.append(str(exc))
        except Exception as exc:
            logger.exception("Unexpected error while tagging %s", track.file_path)
            errors.append(f"{track.file_path}: {type(exc).__name__}")
    return updated, errors


def save_album_cover(
    db: Session, album: Album, data: bytes, covers_dir: Path | None = None
) -> Path:
    """Validate and store an uploaded album cover, replacing any cached one."""
    if len(data) > COVER_MAX_BYTES:
        raise InvalidImageError("Image is too large (max 10 MB)")
    try:
        image = Image.open(io.BytesIO(data))
        image_format = image.format
        image.verify()
    except Exception as exc:
        raise InvalidImageError("Not a valid image file") from exc
    if image_format not in ("JPEG", "PNG"):
        raise InvalidImageError("Only JPEG and PNG covers are supported")

    if covers_dir is None:
        covers_dir = get_settings().data_dir / "covers"
    covers_dir.mkdir(parents=True, exist_ok=True)
    suffix = ".png" if image_format == "PNG" else ".jpg"
    for other_suffix in (".jpg", ".png"):
        if other_suffix != suffix:
            stale = covers_dir / f"album_{album.id}{other_suffix}"
            if stale.exists():
                stale.unlink()
    target = covers_dir / f"album_{album.id}{suffix}"
    target.write_bytes(data)
    album.cover_path = str(target)
    db.commit()
    return target
