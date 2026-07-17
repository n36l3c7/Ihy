from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUserDep, DbDep, MediaUserDep
from app.schemas.common import Page
from app.schemas.library import TrackRead
from app.services import catalog
from app.services.catalog import TrackSort

router = APIRouter()

MEDIA_TYPES = {
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
    "opus": "audio/ogg",
    "m4a": "audio/mp4",
}


@router.get("", response_model=Page[TrackRead])
def list_tracks(
    db: DbDep,
    _user: CurrentUserDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    artist_id: int | None = None,
    album_id: int | None = None,
    genre_id: int | None = None,
    sort: TrackSort = "title",
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    items, total = catalog.list_tracks(
        db,
        q=q,
        artist_id=artist_id,
        album_id=album_id,
        genre_id=genre_id,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/{track_id}", response_model=TrackRead)
def read_track(track_id: int, db: DbDep, _user: CurrentUserDep):
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    return track


@router.get("/{track_id}/stream")
def stream_track(track_id: int, db: DbDep, _user: MediaUserDep) -> FileResponse:
    """Serve the audio file directly. Range requests (seeking) are supported."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    path = Path(track.file_path)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not available"
        )
    return FileResponse(
        path, media_type=MEDIA_TYPES.get(track.format, "application/octet-stream")
    )
