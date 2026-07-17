import threading
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.services.scanner import ScanResult, TagReader, scan_library
from app.services.tag_reader import read_audio_file


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class ScanManager:
    """Runs library scans in a background thread, one at a time."""

    def __init__(
        self,
        session_factory: Callable[[], Session],
        read_tags: TagReader = read_audio_file,
    ):
        self._session_factory = session_factory
        self._read_tags = read_tags
        self._lock = threading.Lock()
        self._running = False
        self.started_at: datetime | None = None
        self.finished_at: datetime | None = None
        self.last_result: ScanResult | None = None
        self.error: str | None = None

    @property
    def running(self) -> bool:
        return self._running

    def start(self, full: bool = False) -> bool:
        """Start a scan in the background. Returns False when one is already running."""
        with self._lock:
            if self._running:
                return False
            self._running = True
        self.started_at = _utcnow()
        self.finished_at = None
        self.error = None
        threading.Thread(
            target=self._run, args=(full,), name="library-scan", daemon=True
        ).start()
        return True

    def _run(self, full: bool) -> None:
        try:
            with self._session_factory() as db:
                self.last_result = scan_library(db, self._read_tags, full=full)
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
        finally:
            self.finished_at = _utcnow()
            self._running = False


scan_manager = ScanManager(SessionLocal)
