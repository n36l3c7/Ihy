from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import AdminUserDep, DbDep
from app.schemas.backup import BackupImportRequest, BackupImportResult
from app.schemas.downloads import DownloadSettings, SpotdlOptions
from app.schemas.settings import LibrarySettings
from app.services import app_settings, backup
from app.workers.scheduler import reschedule_download_job

router = APIRouter()


@router.get("/library", response_model=LibrarySettings)
def get_library_settings(db: DbDep, _admin: AdminUserDep) -> LibrarySettings:
    return LibrarySettings(metadata_separators=app_settings.get_metadata_separators(db))


@router.put("/library", response_model=LibrarySettings)
def update_library_settings(
    payload: LibrarySettings, db: DbDep, _admin: AdminUserDep
) -> LibrarySettings:
    """Update library settings. Separator changes apply on the next scan."""
    app_settings.set_metadata_separators(db, payload.metadata_separators)
    return LibrarySettings(metadata_separators=app_settings.get_metadata_separators(db))


@router.get("/downloads", response_model=DownloadSettings)
def get_download_settings(db: DbDep, _admin: AdminUserDep) -> DownloadSettings:
    return DownloadSettings(
        check_interval_hours=app_settings.get_download_interval_hours(db),
        cron=app_settings.get_download_cron(db),
    )


@router.put("/downloads", response_model=DownloadSettings)
def update_download_settings(
    payload: DownloadSettings, db: DbDep, _admin: AdminUserDep
) -> DownloadSettings:
    cron = payload.cron.strip()
    if cron:
        from apscheduler.triggers.cron import CronTrigger

        try:
            CronTrigger.from_crontab(cron)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid cron expression: {exc}",
            ) from None
    app_settings.set_download_interval_hours(db, payload.check_interval_hours)
    app_settings.set_download_cron(db, cron)
    reschedule_download_job()
    return DownloadSettings(
        check_interval_hours=app_settings.get_download_interval_hours(db),
        cron=app_settings.get_download_cron(db),
    )


@router.get("/spotdl", response_model=SpotdlOptions)
def get_spotdl_options(db: DbDep, _admin: AdminUserDep) -> SpotdlOptions:
    return SpotdlOptions(**app_settings.get_spotdl_options(db))


@router.put("/spotdl", response_model=SpotdlOptions)
def update_spotdl_options(
    payload: SpotdlOptions, db: DbDep, _admin: AdminUserDep
) -> SpotdlOptions:
    app_settings.set_spotdl_options(db, payload.model_dump())
    return SpotdlOptions(**app_settings.get_spotdl_options(db))


@router.get("/backup")
def export_backup(
    db: DbDep,
    _admin: AdminUserDep,
    sections: Annotated[str, Query(description="Comma separated section names")],
) -> dict:
    """Export selected configuration sections as a JSON document."""
    requested = [section.strip() for section in sections.split(",") if section.strip()]
    invalid = [section for section in requested if section not in backup.SECTIONS]
    if not requested or invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Valid sections: {', '.join(backup.SECTIONS)}",
        )
    return backup.export_backup(db, requested)


@router.post("/backup", response_model=BackupImportResult)
def import_backup(
    payload: BackupImportRequest, db: DbDep, _admin: AdminUserDep
) -> BackupImportResult:
    """Merge a previously exported backup. Matching is done on natural keys
    (path, username, name); nothing is deleted."""
    if payload.data.get("app") != "ihy":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Not an Ihy backup file"
        )
    invalid = [section for section in payload.sections if section not in backup.SECTIONS]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown sections: {', '.join(invalid)}",
        )
    return BackupImportResult(sections=backup.import_backup(db, payload.data, payload.sections))
