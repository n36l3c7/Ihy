from fastapi import APIRouter

from app.api.deps import AdminUserDep, DbDep
from app.schemas.settings import LibrarySettings
from app.services import app_settings

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
