import re
from dataclasses import dataclass, field
from pathlib import Path

import mutagen
from mutagen.flac import FLAC
from mutagen.id3 import ID3
from mutagen.mp4 import MP4

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".ogg", ".opus", ".m4a"}

_YEAR_PATTERN = re.compile(r"(\d{4})")


@dataclass
class AudioFileInfo:
    format: str
    duration: float
    bitrate: int | None
    sample_rate: int | None
    title: str | None
    artist: str | None
    album: str | None
    album_artist: str | None
    genres: list[str] = field(default_factory=list)
    year: int | None = None
    track_number: int | None = None
    disc_number: int | None = None
    has_embedded_cover: bool = False


def _first(audio: mutagen.FileType, key: str) -> str | None:
    values = audio.get(key)
    if not values:
        return None
    value = str(values[0]).strip()
    return value or None


def _parse_year(raw: str | None) -> int | None:
    """Extract a year from values like "1997", "1997-05-21" or "21/05/1997"."""
    if raw is None:
        return None
    match = _YEAR_PATTERN.search(raw)
    return int(match.group(1)) if match else None


def _parse_number(raw: str | None) -> int | None:
    """Parse values like "3" or "3/12" into 3."""
    if raw is None:
        return None
    head = raw.split("/", 1)[0].strip()
    try:
        return int(head)
    except ValueError:
        return None


def _has_embedded_cover(path: Path, audio: mutagen.FileType) -> bool:
    if isinstance(audio, FLAC):
        return bool(audio.pictures)
    suffix = path.suffix.lower()
    try:
        if suffix == ".mp3":
            return bool(ID3(path).getall("APIC"))
        if suffix == ".m4a":
            return "covr" in MP4(path)
    except Exception:
        return False
    return False


def read_audio_file(path: Path) -> AudioFileInfo | None:
    """Read technical info and tags from an audio file.

    Returns None when the file is unreadable or not a supported audio format.
    The easy interface normalizes tag names across ID3, Vorbis and MP4.
    """
    try:
        audio = mutagen.File(path, easy=True)
    except Exception:
        return None
    if audio is None:
        return None
    return AudioFileInfo(
        format=path.suffix.lower().lstrip("."),
        duration=float(getattr(audio.info, "length", 0.0) or 0.0),
        bitrate=getattr(audio.info, "bitrate", None) or None,
        sample_rate=getattr(audio.info, "sample_rate", None) or None,
        title=_first(audio, "title"),
        artist=_first(audio, "artist"),
        album=_first(audio, "album"),
        album_artist=_first(audio, "albumartist"),
        genres=[str(g).strip() for g in (audio.get("genre") or []) if str(g).strip()],
        year=_parse_year(_first(audio, "date")),
        track_number=_parse_number(_first(audio, "tracknumber")),
        disc_number=_parse_number(_first(audio, "discnumber")),
        has_embedded_cover=_has_embedded_cover(path, audio),
    )
