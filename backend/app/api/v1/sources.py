from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import AdminUserDep, DbDep
from app.core.config import get_settings
from app.models.library import Source
from app.schemas.source import SourceCreate, SourceRead, SourceUpdate
from app.services import sources as sources_service
from app.services.sources import DuplicateSourcePathError, InvalidSourcePathError
from app.workers import watcher

router = APIRouter()


def _to_read(source: Source, count: int) -> SourceRead:
    data = SourceRead.model_validate(source)
    data.track_count = count
    return data


def _get_source_or_404(db: Session, source_id: int) -> Source:
    source = sources_service.get(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    return source


@router.get("", response_model=list[SourceRead])
def list_sources(db: DbDep, _admin: AdminUserDep) -> list[SourceRead]:
    return [_to_read(source, count) for source, count in sources_service.list_with_counts(db)]


@router.post("", response_model=SourceRead, status_code=status.HTTP_201_CREATED)
def create_source(payload: SourceCreate, db: DbDep, _admin: AdminUserDep) -> SourceRead:
    try:
        source = sources_service.create(db, name=payload.name, path=payload.path)
    except InvalidSourcePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    except DuplicateSourcePathError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    if get_settings().enable_scheduler and get_settings().watch_folders:
        watcher.start_watchers()  # refresh the watched folder set
    return _to_read(source, 0)


@router.get("/{source_id}", response_model=SourceRead)
def read_source(source_id: int, db: DbDep, _admin: AdminUserDep) -> SourceRead:
    source = _get_source_or_404(db, source_id)
    return _to_read(source, sources_service.track_count(db, source))


@router.patch("/{source_id}", response_model=SourceRead)
def update_source(
    source_id: int, payload: SourceUpdate, db: DbDep, _admin: AdminUserDep
) -> SourceRead:
    source = _get_source_or_404(db, source_id)
    try:
        source = sources_service.update(db, source, payload.model_dump(exclude_unset=True))
    except InvalidSourcePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    except DuplicateSourcePathError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    return _to_read(source, sources_service.track_count(db, source))


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(source_id: int, db: DbDep, _admin: AdminUserDep) -> None:
    """Delete a source and its tracks from the library. Files on disk are untouched."""
    source = _get_source_or_404(db, source_id)
    sources_service.delete(db, source)
    if get_settings().enable_scheduler and get_settings().watch_folders:
        watcher.start_watchers()
