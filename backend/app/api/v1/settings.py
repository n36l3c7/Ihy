from fastapi import APIRouter

from app.api.deps import AdminUserDep, DbDep
from app.schemas.downloads import DownloadSettings, SpotdlOptions
from app.schemas.settings import LibrarySettings
from app.services import app_settings
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
    return DownloadSettings(check_interval_hours=app_settings.get_download_interval_hours(db))


@router.put("/downloads", response_model=DownloadSettings)
def update_download_settings(
    payload: DownloadSettings, db: DbDep, _admin: AdminUserDep
) -> DownloadSettings:
    app_settings.set_download_interval_hours(db, payload.check_interval_hours)
    reschedule_download_job()
    return DownloadSettings(check_interval_hours=app_settings.get_download_interval_hours(db))


@router.get("/spotdl", response_model=SpotdlOptions)
def get_spotdl_options(db: DbDep, _admin: AdminUserDep) -> SpotdlOptions:
    return SpotdlOptions(**app_settings.get_spotdl_options(db))


@router.put("/spotdl", response_model=SpotdlOptions)
def update_spotdl_options(
    payload: SpotdlOptions, db: DbDep, _admin: AdminUserDep
) -> SpotdlOptions:
    app_settings.set_spotdl_options(db, payload.model_dump())
    return SpotdlOptions(**app_settings.get_spotdl_options(db))
