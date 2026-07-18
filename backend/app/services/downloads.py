import logging
import shlex
import shutil
import subprocess
import threading
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.downloads import DownloadWatch
from app.services import app_settings
from app.services.scan_manager import scan_manager

logger = logging.getLogger(__name__)

SPOTDL_TIMEOUT_SECONDS = 3600
LOG_MAX_LINES = 500

# runner(query, output_dir, options) -> (success, output tail)
SpotdlRunner = Callable[[str, Path, dict], "tuple[bool, str]"]


def _spotdl_executable() -> str | None:
    """Resolve the configured spotdl command (name on PATH or absolute path)."""
    return shutil.which(get_settings().spotdl_command)


def spotdl_available() -> bool:
    return _spotdl_executable() is not None


def run_spotdl(query: str, output_dir: Path, options: dict) -> tuple[bool, str]:
    """Download a query with the spotdl CLI. Existing files are skipped by spotdl."""
    executable = _spotdl_executable()
    if executable is None:
        return False, "spotdl executable not found"
    template = str(output_dir / "{artist}" / "{album}" / "{title}.{output-ext}")
    command = [executable, "download", query, "--output", template]
    if options.get("output_format"):
        command += ["--format", str(options["output_format"])]
    if options.get("bitrate"):
        command += ["--bitrate", str(options["bitrate"])]
    if options.get("threads"):
        command += ["--threads", str(options["threads"])]
    if options.get("client_id") and options.get("client_secret"):
        command += [
            "--client-id",
            str(options["client_id"]),
            "--client-secret",
            str(options["client_secret"]),
        ]
    if options.get("extra_args"):
        command += shlex.split(str(options["extra_args"]))
    try:
        completed = subprocess.run(
            command, capture_output=True, text=True, timeout=SPOTDL_TIMEOUT_SECONDS, check=False
        )
    except subprocess.TimeoutExpired:
        return False, "spotdl timed out"
    except OSError as exc:
        return False, f"Failed to launch spotdl: {exc}"
    output = (completed.stdout or "") + (completed.stderr or "")
    return completed.returncode == 0, output[-2000:]


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class DownloadManager:
    """Runs spotdl for every enabled watch in a background thread, one run at a time.
    A library scan is triggered afterwards so new files appear immediately."""

    def __init__(
        self,
        session_factory: Callable[[], Session] = SessionLocal,
        runner: SpotdlRunner = run_spotdl,
        start_scan: Callable[[], bool] | None = None,
    ):
        self._session_factory = session_factory
        self._runner = runner
        self._start_scan = start_scan if start_scan is not None else scan_manager.start
        self._lock = threading.Lock()
        self._running = False
        self.current_watch: str | None = None
        self.last_finished_at: datetime | None = None
        self._log: deque[str] = deque(maxlen=LOG_MAX_LINES)

    @property
    def log_lines(self) -> list[str]:
        return list(self._log)

    @property
    def running(self) -> bool:
        return self._running

    def start(self) -> bool:
        """Start checking all enabled watches. Returns False when already running."""
        with self._lock:
            if self._running:
                return False
            self._running = True
        threading.Thread(target=self._run, name="spotdl-watch-check", daemon=True).start()
        return True

    def _run(self) -> None:
        processed = 0
        self._log.clear()
        self._log.append(f"[{_utcnow():%H:%M:%S}] Watch check started")
        try:
            with self._session_factory() as db:
                options = app_settings.get_spotdl_options(db)
                watches = list(
                    db.scalars(
                        select(DownloadWatch)
                        .where(DownloadWatch.enabled.is_(True))
                        .options(selectinload(DownloadWatch.source))
                        .order_by(DownloadWatch.id)
                    )
                )
                for watch in watches:
                    self.current_watch = watch.name
                    self._log.append(f"=== {watch.name} ({watch.query})")
                    success, detail = self._runner(watch.query, Path(watch.source.path), options)
                    for line in detail.splitlines():
                        if line.strip():
                            self._log.append(line.rstrip())
                    self._log.append(f"=== {watch.name}: {'ok' if success else 'FAILED'}")
                    watch.last_run_at = _utcnow()
                    watch.last_status = "ok" if success else "error"
                    watch.last_error = None if success else detail[-500:]
                    db.commit()
                    processed += 1
            if processed > 0:
                self._log.append("Triggering library scan")
                self._start_scan()
            self._log.append(f"[{_utcnow():%H:%M:%S}] Watch check finished")
        except Exception:
            logger.exception("Download watch check failed")
            self._log.append("Watch check crashed — see server logs")
        finally:
            self.current_watch = None
            self.last_finished_at = _utcnow()
            self._running = False


download_manager = DownloadManager()
