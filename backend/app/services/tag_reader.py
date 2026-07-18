import re
from dataclasses import dataclass, field
from pathlib import Path

import mutagen
from mutagen.flac import FLAC
from mutagen.id3 import ID3
from mutagen.mp4 import MP4

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".ogg", ".opus", ".m4a"}

_YEAR_PATTERN = re.compile(r"(\d{4})")
_GAIN_PATTERN = re.compile(r"[-+]?\d+(?:[.,]\d+)?")


def _register_replaygain_keys() -> None:
    """Expose ReplayGain tags through the easy interface for ID3 and MP4.

    Vorbis comments (FLAC/Ogg/Opus) already pass lowercase keys through.
    """
    from mutagen.easyid3 import EasyID3
    from mutagen.easymp4 import EasyMP4Tags

    if "replaygain_track_gain" not in EasyID3.valid_keys:
        EasyID3.RegisterTXXXKey("replaygain_track_gain", "REPLAYGAIN_TRACK_GAIN")
    if "replaygain_track_gain" not in EasyMP4Tags.Get:
        EasyMP4Tags.RegisterFreeformKey("replaygain_track_gain", "replaygain_track_gain")


_register_replaygain_keys()


def _parse_gain(raw: str | None) -> float | None:
    """Parse values like "-6.32 dB" into -6.32."""
    if raw is None:
        return None
    match = _GAIN_PATTERN.search(raw.replace("−", "-"))
    if match is None:
        return None
    try:
        return float(match.group(0).replace(",", "."))
    except ValueError:
        return None


@dataclass
class AudioFileInfo:
    format: str
    duration: float
    bitrate: int | None
    sample_rate: int | None
    title: str | None
    album: str | None
    # Raw tag values; multi-value splitting on configured separators
    # happens later, in the scanner.
    artists: list[str] = field(default_factory=list)
    album_artists: list[str] = field(default_factory=list)
    genres: list[str] = field(default_factory=list)
    year: int | None = None
    track_number: int | None = None
    disc_number: int | None = None
    has_embedded_cover: bool = False
    replay_gain: float | None = None


def _first(audio: mutagen.FileType, key: str) -> str | None:
    values = audio.get(key)
    if not values:
        return None
    value = str(values[0]).strip()
    return value or None


def _all(audio: mutagen.FileType, key: str) -> list[str]:
    values = audio.get(key) or []
    return [str(value).strip() for value in values if str(value).strip()]


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
        album=_first(audio, "album"),
        artists=_all(audio, "artist"),
        album_artists=_all(audio, "albumartist"),
        genres=_all(audio, "genre"),
        year=_parse_year(_first(audio, "date")),
        track_number=_parse_number(_first(audio, "tracknumber")),
        disc_number=_parse_number(_first(audio, "discnumber")),
        has_embedded_cover=_has_embedded_cover(path, audio),
        replay_gain=_parse_gain(_first(audio, "replaygain_track_gain")),
    )
