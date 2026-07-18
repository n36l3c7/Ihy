from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import AdminUserDep, CurrentUserDep, DbDep
from app.models.downloads import DownloadFix, DownloadWatch
from app.models.library import Source
from app.schemas.downloads import (
    DownloadLogRead,
    DownloadStatusRead,
    FixRead,
    FixUpdate,
    SpotifyArtistRead,
    SpotifyResolveRead,
    WatchCreate,
    WatchRead,
    WatchUpdate,
)
from app.services import app_settings
from app.services import downloads as downloads_service
from app.services import spotify as spotify_service
from app.services.spotify import SpotifyError
from app.services.spotify_import import spotify_import_manager

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


@router.post(
    "/watches/{watch_id}/run",
    response_model=DownloadStatusRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_single_watch(watch_id: int, db: DbDep, admin: AdminUserDep) -> DownloadStatusRead:
    """Check only this watch, right now."""
    _get_watch_or_404(db, watch_id)
    if not downloads_service.spotdl_available():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="spotdl is not installed on the server",
        )
    if not downloads_service.download_manager.start(watch_ids=[watch_id]):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A download check is already running"
        )
    return download_status(admin)


@router.get("/fixes", response_model=list[FixRead])
def list_fixes(db: DbDep, _admin: AdminUserDep) -> list[FixRead]:
    """Failed songs recorded during checks, pairable with a YouTube URL."""
    fixes = db.scalars(
        select(DownloadFix)
        .options(selectinload(DownloadFix.watch))
        .order_by(DownloadFix.created_at.desc())
    )
    result = []
    for fix in fixes:
        data = FixRead.model_validate(fix)
        data.watch_name = fix.watch.name if fix.watch else None
        result.append(data)
    return result


@router.patch("/fixes/{fix_id}", response_model=FixRead)
def update_fix(fix_id: int, payload: FixUpdate, db: DbDep, _admin: AdminUserDep) -> FixRead:
    fix = db.get(DownloadFix, fix_id)
    if fix is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fix not found")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(fix, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(fix)
    data = FixRead.model_validate(fix)
    data.watch_name = fix.watch.name if fix.watch else None
    return data


@router.delete("/fixes/{fix_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fix(fix_id: int, db: DbDep, _admin: AdminUserDep) -> None:
    fix = db.get(DownloadFix, fix_id)
    if fix is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fix not found")
    db.delete(fix)
    db.commit()


@router.get("/spotify/search", response_model=list[SpotifyArtistRead])
def spotify_search(
    db: DbDep,
    _admin: AdminUserDep,
    q: Annotated[str, Query(min_length=2, max_length=200)],
) -> list[dict]:
    """Search artists on Spotify. Requires Spotify API credentials
    (Settings -> SpotDL) from developer.spotify.com."""
    options = app_settings.get_spotdl_options(db)
    if not options.get("client_id") or not options.get("client_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Spotify credentials are not configured (Settings -> SpotDL)",
        )
    try:
        return spotify_service.search_artists(options["client_id"], options["client_secret"], q)
    except SpotifyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from None


@router.get("/spotify/resolve", response_model=SpotifyResolveRead)
def spotify_resolve(
    _admin: AdminUserDep,
    url: Annotated[str, Query(min_length=10, max_length=500)],
) -> SpotifyResolveRead:
    """Resolve the display name of a pasted Spotify URL from its public page.
    Works without API credentials."""
    if not url.startswith("https://open.spotify.com/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not an open.spotify.com URL",
        )
    name = spotify_service.resolve_title(url)
    if name is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Could not resolve the page"
        )
    return SpotifyResolveRead(name=name)


@router.get("/log", response_model=DownloadLogRead)
def download_log(_admin: AdminUserDep) -> DownloadLogRead:
    """CLI output of the current/last watch check."""
    return DownloadLogRead(lines=downloads_service.download_manager.log_lines)


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


class SpotifyPlaylistImportRequest(BaseModel):
    url: str = Field(min_length=10, max_length=500)
    name: str | None = Field(default=None, max_length=100)
    source_id: int | None = None


class SpotifyPlaylistImportStatus(BaseModel):
    available: bool
    running: bool
    state: str
    error: str | None
    total: int
    matched: int
    playlist_id: int | None
    playlist_name: str | None
    log: list[str]


def _import_status() -> SpotifyPlaylistImportStatus:
    manager = spotify_import_manager
    return SpotifyPlaylistImportStatus(
        available=downloads_service.spotdl_available(),
        running=manager.running,
        state=manager.state,
        error=manager.error,
        total=manager.total,
        matched=manager.matched,
        playlist_id=manager.playlist_id,
        playlist_name=manager.playlist_name,
        log=manager.log_lines[-30:],
    )


@router.get("/spotify-playlist", response_model=SpotifyPlaylistImportStatus)
def spotify_playlist_status(_user: CurrentUserDep) -> SpotifyPlaylistImportStatus:
    return _import_status()


@router.post(
    "/spotify-playlist",
    response_model=SpotifyPlaylistImportStatus,
    status_code=status.HTTP_202_ACCEPTED,
)
def import_spotify_playlist(
    payload: SpotifyPlaylistImportRequest, user: CurrentUserDep
) -> SpotifyPlaylistImportStatus:
    """Download a Spotify playlist with spotdl and build the matching
    Ihy playlist for the requesting user."""
    if not downloads_service.spotdl_available():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="spotdl is not installed on the server",
        )
    if "spotify.com" not in payload.url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Not a Spotify URL"
        )
    if not spotify_import_manager.start(
        user.id, payload.url.strip(), payload.name, payload.source_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="An import is already running"
        )
    return _import_status()
