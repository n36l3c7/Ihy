from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import AdminUserDep, CurrentUserDep, DbDep
from app.models.library import Source
from app.schemas.library import TrackRead
from app.schemas.scan import ScanResultRead, ScanStatusRead
from app.services import browse as browse_service
from app.services import library_health
from app.services.browse import InvalidBrowsePathError
from app.services.loudness import ffmpeg_available, loudness_analyzer
from app.services.scan_manager import scan_manager

router = APIRouter()


class BrowseSourceRead(BaseModel):
    id: int
    name: str


class BrowseRead(BaseModel):
    sources: list[BrowseSourceRead] = []
    path: str = ""
    folders: list[str] = []
    tracks: list[TrackRead] = []


@router.get("/browse", response_model=BrowseRead)
def browse_library(
    db: DbDep,
    _user: CurrentUserDep,
    source_id: int | None = None,
    path: Annotated[str, Query(max_length=1024)] = "",
) -> BrowseRead:
    """Browse the library by folder. Without source_id, lists the sources."""
    if source_id is None:
        sources = db.scalars(select(Source).where(Source.enabled.is_(True)).order_by(Source.name))
        return BrowseRead(
            sources=[BrowseSourceRead(id=source.id, name=source.name) for source in sources]
        )
    source = db.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    try:
        folders, tracks = browse_service.browse_folder(db, source, path)
    except InvalidBrowsePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    return BrowseRead(path=path, folders=folders, tracks=tracks)


def _current_status() -> ScanStatusRead:
    last_result = scan_manager.last_result
    return ScanStatusRead(
        running=scan_manager.running,
        started_at=scan_manager.started_at,
        finished_at=scan_manager.finished_at,
        error=scan_manager.error,
        last_result=ScanResultRead(**asdict(last_result)) if last_result is not None else None,
    )


@router.get("/scan", response_model=ScanStatusRead)
def scan_status(_admin: AdminUserDep) -> ScanStatusRead:
    return _current_status()


@router.post("/scan", response_model=ScanStatusRead, status_code=status.HTTP_202_ACCEPTED)
def start_scan(_admin: AdminUserDep, full: bool = False) -> ScanStatusRead:
    """Start a scan. With full=true, unchanged files are re-read too
    (needed after changing metadata separators)."""
    if not scan_manager.start(full=full):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A scan is already running"
        )
    return _current_status()


class LoudnessStatusRead(BaseModel):
    running: bool
    done: int
    total: int
    failed: int
    error: str | None
    ffmpeg_available: bool


def _loudness_status() -> LoudnessStatusRead:
    return LoudnessStatusRead(
        running=loudness_analyzer.running,
        done=loudness_analyzer.done,
        total=loudness_analyzer.total,
        failed=loudness_analyzer.failed,
        error=loudness_analyzer.error,
        ffmpeg_available=ffmpeg_available(),
    )


@router.get("/loudness", response_model=LoudnessStatusRead)
def loudness_status(_admin: AdminUserDep) -> LoudnessStatusRead:
    return _loudness_status()


@router.post("/loudness", response_model=LoudnessStatusRead, status_code=status.HTTP_202_ACCEPTED)
def start_loudness_analysis(_admin: AdminUserDep) -> LoudnessStatusRead:
    """Measure ReplayGain (via ffmpeg EBU R128) for tracks that lack it."""
    if not loudness_analyzer.start():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="An analysis is already running"
        )
    return _loudness_status()


@router.get("/duplicates", response_model=list[list[TrackRead]])
def list_duplicates(db: DbDep, _admin: AdminUserDep) -> list[list]:
    """Groups of tracks with identical title and artists, best copy first."""
    return library_health.find_duplicates(db)


class SourceOfflineRead(BaseModel):
    id: int
    name: str
    path: str


class BrokenFilesRead(BaseModel):
    broken: list[TrackRead]
    offline_sources: list[SourceOfflineRead]


@router.get("/broken", response_model=BrokenFilesRead)
def list_broken(db: DbDep, _admin: AdminUserDep) -> BrokenFilesRead:
    """Tracks whose audio file is missing from disk (unreachable sources
    are listed separately, their tracks are not flagged)."""
    broken, offline = library_health.find_broken(db)
    return BrokenFilesRead(
        broken=broken,
        offline_sources=[
            SourceOfflineRead(id=source.id, name=source.name, path=source.path)
            for source in offline
        ],
    )


class BrokenCleanupResult(BaseModel):
    removed: int


@router.post("/broken/cleanup", response_model=BrokenCleanupResult)
def cleanup_broken(db: DbDep, _admin: AdminUserDep) -> BrokenCleanupResult:
    """Delete the library entries of missing files."""
    return BrokenCleanupResult(removed=library_health.cleanup_broken(db))
