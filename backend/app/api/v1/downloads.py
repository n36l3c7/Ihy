from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AdminUserDep, DbDep
from app.models.downloads import DownloadWatch
from app.models.library import Source
from app.schemas.downloads import (
    DownloadLogRead,
    DownloadStatusRead,
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
