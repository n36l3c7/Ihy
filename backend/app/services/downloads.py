import logging
import re
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
from app.models.downloads import DownloadFix, DownloadWatch
from app.services import app_settings
from app.services.scan_manager import scan_manager

logger = logging.getLogger(__name__)

LOG_MAX_LINES = 500
DEFAULT_OUTPUT_TEMPLATE = "{artist}/{album}/{title}.{output-ext}"

_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")

# runner(query, output_dir, options, on_line) -> (success, output tail)
SpotdlRunner = Callable[[str, Path, dict, Callable[[str], None]], "tuple[bool, str]"]


def _spotdl_executable() -> str | None:
    """Resolve the configured spotdl command (name on PATH or absolute path)."""
    return shutil.which(get_settings().spotdl_command)


def spotdl_available() -> bool:
    return _spotdl_executable() is not None


def _clean_output_line(raw: str) -> str:
    """Progress bars rewrite lines with \\r and ANSI codes; keep the final text."""
    segment = raw.split("\r")[-1]
    return _ANSI_RE.sub("", segment).rstrip()


def _build_command(executable: str, query: str, output_dir: Path, options: dict) -> list[str]:
    template = str(options.get("output_template") or "").strip() or DEFAULT_OUTPUT_TEMPLATE
    command = [executable, "download", query, "--output", str(output_dir / template)]
    if options.get("album_type"):
        command += ["--album-type", str(options["album_type"])]
    if options.get("output_format"):
        command += ["--format", str(options["output_format"])]
    if options.get("bitrate"):
        command += ["--bitrate", str(options["bitrate"])]
    if options.get("threads"):
        command += ["--threads", str(options["threads"])]
    if options.get("audio_providers"):
        command += ["--audio", *str(options["audio_providers"]).split()]
    if options.get("lyrics_providers"):
        command += ["--lyrics", *str(options["lyrics_providers"]).split()]
    if options.get("overwrite"):
        command += ["--overwrite", str(options["overwrite"])]
    if options.get("restrict"):
        command += ["--restrict", str(options["restrict"])]
    if options.get("max_filename_length"):
        command += ["--max-filename-length", str(options["max_filename_length"])]
    for flag, key in (
        ("--sponsor-block", "sponsor_block"),
        ("--playlist-numbering", "playlist_numbering"),
        ("--generate-lrc", "generate_lrc"),
        ("--print-errors", "print_errors"),
        ("--scan-for-songs", "scan_for_songs"),
        ("--fetch-albums", "fetch_albums"),
    ):
        if options.get(key):
            command.append(flag)
    if options.get("proxy"):
        command += ["--proxy", str(options["proxy"])]
    if options.get("cookie_file"):
        command += ["--cookie-file", str(options["cookie_file"])]
    if options.get("yt_dlp_args"):
        command += ["--yt-dlp-args", str(options["yt_dlp_args"])]
    if options.get("client_id") and options.get("client_secret"):
        command += [
            "--client-id",
            str(options["client_id"]),
            "--client-secret",
            str(options["client_secret"]),
        ]
    if options.get("extra_args"):
        command += shlex.split(str(options["extra_args"]))
    return command


def run_spotdl(
    query: str, output_dir: Path, options: dict, on_line: Callable[[str], None]
) -> tuple[bool, str]:
    """Run the spotdl CLI, streaming output line by line as it happens.
    Existing files are skipped by spotdl itself."""
    executable = _spotdl_executable()
    if executable is None:
        return False, "spotdl executable not found"
    command = _build_command(executable, query, output_dir, options)
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
    except OSError as exc:
        return False, f"Failed to launch spotdl: {exc}"
    tail: deque[str] = deque(maxlen=60)
    assert process.stdout is not None
    for raw_line in process.stdout:
        line = _clean_output_line(raw_line)
        if line:
            on_line(line)
            tail.append(line)
    returncode = process.wait()
    return returncode == 0, "\n".join(tail)


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


_SPOTIFY_TRACK_RE = re.compile(r"https://open\.spotify\.com/track/[A-Za-z0-9]+")
_FAILURE_RES = [
    re.compile(r"No results found for song:\s*(?P<song>.+)"),
    re.compile(r"Failed to download[:\s]+(?P<song>.+)"),
    re.compile(r"(?:LookupError|AudioProviderError|DownloaderError)[:\s-]+(?P<song>.+)"),
]


def parse_failures(lines: list[str]) -> list[dict]:
    """Extract failed songs from spotdl output (keep --print-errors enabled)."""
    failures: dict[str, dict] = {}
    for line in lines:
        url_match = _SPOTIFY_TRACK_RE.search(line)
        song: str | None = None
        for pattern in _FAILURE_RES:
            match = pattern.search(line)
            if match:
                song = match.group("song").strip()
                break
        if song is None and url_match and ("rror" in line or "Failed" in line):
            song = url_match.group(0)
        if song:
            key = song.lower()
            if key not in failures:
                failures[key] = {
                    "song": song[:500],
                    "spotify_url": url_match.group(0) if url_match else None,
                    "error": line.strip()[:500],
                }
    return list(failures.values())


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
        self._requested_ids: list[int] | None = None
        self.current_watch: str | None = None
        self.last_finished_at: datetime | None = None
        self._log: deque[str] = deque(maxlen=LOG_MAX_LINES)

    @property
    def log_lines(self) -> list[str]:
        return list(self._log)

    @property
    def running(self) -> bool:
        return self._running

    def start(self, watch_ids: list[int] | None = None) -> bool:
        """Start a check of all enabled watches, or only the given ones.
        Returns False when a check is already running."""
        with self._lock:
            if self._running:
                return False
            self._running = True
        self._requested_ids = watch_ids
        threading.Thread(target=self._run, name="spotdl-watch-check", daemon=True).start()
        return True

    def _run(self) -> None:
        processed = 0
        self._log.clear()
        self._log.append(f"[{_utcnow():%H:%M:%S}] Watch check started")
        try:
            with self._session_factory() as db:
                options = app_settings.get_spotdl_options(db)
                stmt = (
                    select(DownloadWatch)
                    .options(selectinload(DownloadWatch.source))
                    .order_by(DownloadWatch.id)
                )
                if self._requested_ids is not None:
                    # Explicit runs work even on disabled watches
                    stmt = stmt.where(DownloadWatch.id.in_(self._requested_ids))
                else:
                    stmt = stmt.where(DownloadWatch.enabled.is_(True))
                watches = list(db.scalars(stmt))
                scan_pending = False
                for watch in watches:
                    self.current_watch = watch.name
                    self._log.append(f"=== {watch.name} ({watch.query})")
                    watch_lines: list[str] = []

                    def on_line(line: str) -> None:
                        self._log.append(line)
                        watch_lines.append(line)  # noqa: B023

                    success, detail = self._runner(
                        watch.query, Path(watch.source.path), options, on_line
                    )
                    self._log.append(f"=== {watch.name}: {'ok' if success else 'FAILED'}")
                    watch.last_run_at = _utcnow()
                    watch.last_status = "ok" if success else "error"
                    watch.last_error = None if success else detail[-500:]
                    self._record_failures(db, watch, watch_lines)
                    db.commit()
                    self._apply_fixes(db, watch, options)
                    processed += 1
                    # Scan right away so finished downloads show up immediately
                    if self._start_scan():
                        self._log.append("Library scan started")
                    else:
                        self._log.append("Library scan busy — will retry at the end")
                        scan_pending = True
            if processed > 0 and scan_pending:
                self._start_scan()
            self._log.append(f"[{_utcnow():%H:%M:%S}] Watch check finished")
        except Exception:
            logger.exception("Download watch check failed")
            self._log.append("Watch check crashed — see server logs")
        finally:
            self.current_watch = None
            self._requested_ids = None
            self.last_finished_at = _utcnow()
            self._running = False

    def _record_failures(self, db: Session, watch: DownloadWatch, lines: list[str]) -> None:
        """Persist newly seen failed songs so the admin can pair them with
        a YouTube URL later."""
        for failure in parse_failures(lines):
            exists = db.scalar(
                select(DownloadFix).where(
                    DownloadFix.watch_id == watch.id, DownloadFix.song == failure["song"]
                )
            )
            if exists is None:
                db.add(DownloadFix(watch_id=watch.id, **failure))
                self._log.append(f"Recorded failed song for fixing: {failure['song']}")

    def _apply_fixes(self, db: Session, watch: DownloadWatch, options: dict) -> None:
        """Re-run saved spotify|youtube pairs. spotdl skips files that already
        exist, so applying them on every check is idempotent."""
        fixes = list(
            db.scalars(
                select(DownloadFix).where(
                    DownloadFix.watch_id == watch.id,
                    DownloadFix.spotify_url.is_not(None),
                    DownloadFix.youtube_url.is_not(None),
                )
            )
        )
        for fix in fixes:
            self._log.append(f"--- applying fix: {fix.song}")
            self._runner(
                f"{fix.spotify_url}|{fix.youtube_url}",
                Path(watch.source.path),
                options,
                self._log.append,
            )


download_manager = DownloadManager()
