"""Waveform peaks for the seekbar.

The audio is decoded once with ffmpeg to 8 kHz mono PCM, reduced to a fixed
number of normalized peaks and cached as JSON in IHY_DATA_DIR/waveforms.
"""

import json
import logging
import subprocess
from pathlib import Path

from app.core.config import get_settings
from app.models.library import Track
from app.services.loudness import ffmpeg_available

logger = logging.getLogger(__name__)

BUCKETS = 240
SAMPLE_RATE = 8000


def waveforms_dir() -> Path:
    return get_settings().data_dir / "waveforms"


def compute_peaks(pcm: bytes, buckets: int = BUCKETS) -> list[float]:
    """Reduce little-endian 16-bit mono PCM to normalized per-bucket peaks."""
    count = len(pcm) // 2
    if count == 0:
        return []
    samples = memoryview(pcm)[: count * 2].cast("h")
    per_bucket = max(1, count // buckets)
    stride = max(1, per_bucket // 64)  # sampling within the bucket is enough
    peaks: list[float] = []
    for bucket in range(buckets):
        start = bucket * per_bucket
        if start >= count:
            break
        end = min(count, start + per_bucket)
        peak = 0
        for index in range(start, end, stride):
            value = samples[index]
            if value < 0:
                value = -value
            if value > peak:
                peak = value
        peaks.append(peak / 32768)
    top = max(peaks) or 1.0
    return [round(peak / top, 3) for peak in peaks]


def get_or_create_waveform(track: Track) -> list[float] | None:
    cached = waveforms_dir() / f"track_{track.id}.json"
    if cached.is_file():
        try:
            return json.loads(cached.read_text())
        except (OSError, ValueError):
            cached.unlink(missing_ok=True)
    if not ffmpeg_available():
        return None
    try:
        completed = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-nostats",
                "-i",
                track.file_path,
                "-map",
                "0:a:0",
                "-ac",
                "1",
                "-ar",
                str(SAMPLE_RATE),
                "-f",
                "s16le",
                "-",
            ],
            capture_output=True,
            timeout=300,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        logger.warning("Waveform decoding failed for %s", track.file_path)
        return None
    peaks = compute_peaks(completed.stdout)
    if not peaks:
        return None
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(peaks))
    return peaks


def invalidate_track_waveform(track_id: int) -> None:
    (waveforms_dir() / f"track_{track_id}.json").unlink(missing_ok=True)
