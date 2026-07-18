import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.db.session import SessionLocal
from app.services import app_settings
from app.services.downloads import download_manager

logger = logging.getLogger(__name__)

_DOWNLOAD_JOB_ID = "spotdl-watch-check"
_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler()
    _scheduler.start()
    reschedule_download_job()


def reschedule_download_job() -> None:
    """(Re)apply the configured download check interval. 0 hours disables the job."""
    if _scheduler is None:
        return
    with SessionLocal() as db:
        hours = app_settings.get_download_interval_hours(db)
    existing = _scheduler.get_job(_DOWNLOAD_JOB_ID)
    if existing is not None:
        existing.remove()
    if hours > 0:
        _scheduler.add_job(
            download_manager.start, "interval", hours=hours, id=_DOWNLOAD_JOB_ID
        )
        logger.info("Download watch check scheduled every %d hours", hours)
    else:
        logger.info("Download watch check disabled")


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
