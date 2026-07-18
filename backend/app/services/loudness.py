"""Loudness analysis for tracks without ReplayGain tags.

Runs ffmpeg's EBU R128 filter to measure integrated loudness and stores the
gain needed to reach the ReplayGain 2.0 reference of -18 LUFS.
"""

import logging
import re
import shutil
import subprocess
import threading
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.library import Track

logger = logging.getLogger(__name__)

TARGET_LUFS = -18.0
_INTEGRATED_RE = re.compile(r"I:\s*(-?\d+(?:\.\d+)?)\s*LUFS")


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def measure_track_gain(file_path: str) -> float | None:
    """Measure one file with ffmpeg ebur128. Returns gain in dB or None."""
    try:
        completed = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-nostats",
                "-i",
                file_path,
                "-map",
                "0:a:0",
                "-af",
                "ebur128=framelog=quiet",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    matches = _INTEGRATED_RE.findall(completed.stderr)
    if not matches:
        return None
    integrated = float(matches[-1])
    if integrated <= -70:  # silence / measurement failure
        return None
    return round(TARGET_LUFS - integrated, 2)


class LoudnessAnalyzer:
    """Analyzes tracks missing replay_gain in a background thread."""

    def __init__(self, session_factory: Callable[[], Session] = SessionLocal):
        self._session_factory = session_factory
        self._lock = threading.Lock()
        self._running = False
        self.done = 0
        self.total = 0
        self.failed = 0
        self.error: str | None = None

    @property
    def running(self) -> bool:
        return self._running

    def start(self) -> bool:
        with self._lock:
            if self._running:
                return False
            self._running = True
        self.done = 0
        self.total = 0
        self.failed = 0
        self.error = None
        threading.Thread(target=self._run, name="loudness-analysis", daemon=True).start()
        return True

    def _run(self) -> None:
        try:
            if not ffmpeg_available():
                self.error = "ffmpeg is not installed on the server"
                return
            with self._session_factory() as db:
                track_ids = list(
                    db.scalars(select(Track.id).where(Track.replay_gain.is_(None)))
                )
                self.total = len(track_ids)
                for track_id in track_ids:
                    track = db.get(Track, track_id)
                    if track is None:
                        self.done += 1
                        continue
                    gain = measure_track_gain(track.file_path)
                    if gain is None:
                        self.failed += 1
                    else:
                        track.replay_gain = gain
                    self.done += 1
                    if self.done % 20 == 0:
                        db.commit()
                db.commit()
        except Exception as exc:
            logger.exception("Loudness analysis failed")
            self.error = f"{type(exc).__name__}: {exc}"
        finally:
            self._running = False


loudness_analyzer = LoudnessAnalyzer()
