"""On-demand Opus transcoding with a disk cache.

The first request for a (track, bitrate) pair transcodes the whole file with
ffmpeg into IHY_DATA_DIR/transcodes; later requests (and seeking, via HTTP
ranges) are served from the cached file.
"""

import logging
import subprocess
import threading
from pathlib import Path

from app.core.config import get_settings
from app.models.library import Track
from app.services.loudness import ffmpeg_available

logger = logging.getLogger(__name__)

ALLOWED_BITRATES = {64, 96, 128, 160, 192, 256, 320}

_locks_guard = threading.Lock()
_locks: dict[str, threading.Lock] = {}


class TranscodeError(RuntimeError):
    pass


def transcodes_dir() -> Path:
    return get_settings().data_dir / "transcodes"


def _lock_for(name: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(name, threading.Lock())


def transcoded_path(track: Track, bitrate: int) -> Path:
    """Return the cached Opus file for the track, transcoding when needed."""
    if bitrate not in ALLOWED_BITRATES:
        raise TranscodeError(f"bitrate must be one of {sorted(ALLOWED_BITRATES)}")
    if not ffmpeg_available():
        raise TranscodeError("ffmpeg is not installed on the server")
    source = Path(track.file_path)
    if not source.is_file():
        raise TranscodeError("Source file not available")

    target = transcodes_dir() / f"track_{track.id}_{bitrate}.opus"
    with _lock_for(target.name):
        if target.is_file() and target.stat().st_mtime >= source.stat().st_mtime:
            return target
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".tmp")
        try:
            completed = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-nostats",
                    "-i",
                    str(source),
                    "-map",
                    "0:a:0",
                    "-vn",
                    "-c:a",
                    "libopus",
                    "-b:a",
                    f"{bitrate}k",
                    "-vbr",
                    "on",
                    "-f",
                    "ogg",
                    str(temporary),
                ],
                capture_output=True,
                text=True,
                timeout=600,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            temporary.unlink(missing_ok=True)
            raise TranscodeError(f"ffmpeg failed: {exc}") from None
        if completed.returncode != 0 or not temporary.is_file():
            temporary.unlink(missing_ok=True)
            tail = completed.stderr.strip().splitlines()[-1:] if completed.stderr else []
            raise TranscodeError(f"ffmpeg failed: {' '.join(tail) or 'unknown error'}")
        temporary.replace(target)
        return target


def invalidate_track_transcodes(track_id: int) -> None:
    """Drop cached transcodes for a deleted or re-tagged track."""
    directory = transcodes_dir()
    if not directory.is_dir():
        return
    for cached in directory.glob(f"track_{track_id}_*.opus"):
        try:
            cached.unlink()
        except OSError:
            logger.warning("Could not remove cached transcode %s", cached)
