import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

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
    """(Re)apply the configured schedule. A cron expression wins over the
    interval; 0 hours with no cron disables the job."""
    if _scheduler is None:
        return
    with SessionLocal() as db:
        hours = app_settings.get_download_interval_hours(db)
        cron = app_settings.get_download_cron(db)
    existing = _scheduler.get_job(_DOWNLOAD_JOB_ID)
    if existing is not None:
        existing.remove()
    if cron:
        try:
            trigger = CronTrigger.from_crontab(cron)
        except ValueError:
            logger.error("Invalid cron expression %r — download job disabled", cron)
            return
        _scheduler.add_job(download_manager.start, trigger, id=_DOWNLOAD_JOB_ID)
        logger.info("Download watch check scheduled with cron %r", cron)
    elif hours > 0:
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
