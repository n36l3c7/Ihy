from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AdminUserDep, DbDep
from app.models.downloads import DownloadWatch
from app.models.library import Source
from app.schemas.downloads import DownloadStatusRead, WatchCreate, WatchRead, WatchUpdate
from app.services import downloads as downloads_service

router = APIRouter()


def _validate_source(db: Session, source_id: int) -> None:
    if db.get(Source, source_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Source {source_id} does not exist",
        )


def _get_watch_or_404(db: Session, watch_id: int) -> DownloadWatch:
    watch = db.get(DownloadWatch, watch_id)
    if watch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Watch not found")
    return watch


@router.get("/watches", response_model=list[WatchRead])
def list_watches(db: DbDep, _admin: AdminUserDep) -> list[DownloadWatch]:
    return list(db.scalars(select(DownloadWatch).order_by(DownloadWatch.name)))


@router.post("/watches", response_model=WatchRead, status_code=status.HTTP_201_CREATED)
def create_watch(payload: WatchCreate, db: DbDep, _admin: AdminUserDep) -> DownloadWatch:
    _validate_source(db, payload.source_id)
    watch = DownloadWatch(name=payload.name, query=payload.query, source_id=payload.source_id)
    db.add(watch)
    db.commit()
    db.refresh(watch)
    return watch


@router.patch("/watches/{watch_id}", response_model=WatchRead)
def update_watch(
    watch_id: int, payload: WatchUpdate, db: DbDep, _admin: AdminUserDep
) -> DownloadWatch:
    watch = _get_watch_or_404(db, watch_id)
    changes = payload.model_dump(exclude_unset=True)
    if "source_id" in changes:
        _validate_source(db, changes["source_id"])
    for field, value in changes.items():
        setattr(watch, field, value)
    db.commit()
    db.refresh(watch)
    return watch


@router.delete("/watches/{watch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_watch(watch_id: int, db: DbDep, _admin: AdminUserDep) -> None:
    watch = _get_watch_or_404(db, watch_id)
    db.delete(watch)
    db.commit()


@router.get("/status", response_model=DownloadStatusRead)
def download_status(_admin: AdminUserDep) -> DownloadStatusRead:
    manager = downloads_service.download_manager
    return DownloadStatusRead(
        available=downloads_service.spotdl_available(),
        running=manager.running,
        current_watch=manager.current_watch,
        last_finished_at=manager.last_finished_at,
    )


@router.post("/run", response_model=DownloadStatusRead, status_code=status.HTTP_202_ACCEPTED)
def run_downloads(_admin: AdminUserDep) -> DownloadStatusRead:
    """Check all enabled watches now."""
    if not downloads_service.spotdl_available():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="spotdl is not installed on the server",
        )
    if not downloads_service.download_manager.start():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A download check is already running"
        )
    return download_status(_admin)
