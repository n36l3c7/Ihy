"""Filesystem watcher: new/changed audio files trigger an incremental scan.

One watchdog observer watches every enabled source recursively; events are
debounced so a batch of copied files results in a single scan.
"""

import logging
import threading
from pathlib import Path

from sqlalchemy import select
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from app.db.session import SessionLocal
from app.models.library import Source
from app.services.scan_manager import scan_manager
from app.services.tag_reader import SUPPORTED_EXTENSIONS

logger = logging.getLogger(__name__)

DEBOUNCE_SECONDS = 8.0

_observer: Observer | None = None
_timer: threading.Timer | None = None
_lock = threading.Lock()


class _AudioEventHandler(FileSystemEventHandler):
    def on_any_event(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        for raw in (getattr(event, "src_path", ""), getattr(event, "dest_path", "")):
            if raw and Path(str(raw)).suffix.lower() in SUPPORTED_EXTENSIONS:
                _schedule_scan()
                return


def _schedule_scan() -> None:
    global _timer
    with _lock:
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(DEBOUNCE_SECONDS, _run_scan)
        _timer.daemon = True
        _timer.start()


def _run_scan() -> None:
    if scan_manager.running:
        _schedule_scan()  # try again once the current scan finishes
        return
    logger.info("Watched folder changed - starting incremental scan")
    scan_manager.start(full=False)


def start_watchers() -> None:
    """Watch every enabled source folder. Safe to call again to refresh."""
    global _observer
    stop_watchers()
    try:
        with SessionLocal() as db:
            paths = list(db.scalars(select(Source.path).where(Source.enabled.is_(True))))
    except Exception:
        # Table may not exist yet on a fresh install before migrations
        logger.debug("Could not list sources for watching", exc_info=True)
        return
    observer = Observer()
    handler = _AudioEventHandler()
    watched = 0
    for path in paths:
        if Path(path).is_dir():
            try:
                observer.schedule(handler, path, recursive=True)
                watched += 1
            except OSError as exc:
                logger.warning("Cannot watch %s: %s", path, exc)
    if watched == 0:
        return
    observer.daemon = True
    observer.start()
    _observer = observer
    logger.info("Watching %d source folder(s) for changes", watched)


def stop_watchers() -> None:
    global _observer, _timer
    with _lock:
        if _timer is not None:
            _timer.cancel()
            _timer = None
    if _observer is not None:
        _observer.stop()
        _observer = None
