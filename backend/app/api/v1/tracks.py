from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.api.deps import AdminUserDep, CurrentUserDep, DbDep, MediaUserDep
from app.schemas.common import Page
from app.schemas.library import TrackRead
from app.schemas.tags import BatchTagsRequest, BatchTagsResult, TrackTagsUpdate
from app.services import catalog, tag_editor
from app.services.catalog import TrackSort
from app.services.tag_editor import FileMissingError, UnsupportedFormatError

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


@router.post("/tags/batch", response_model=BatchTagsResult)
def batch_edit_tags(payload: BatchTagsRequest, db: DbDep, _admin: AdminUserDep) -> BatchTagsResult:
    """Apply the same tag changes to many tracks. Errors are reported per file."""
    changes = payload.changes.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided"
        )
    tracks: list = []
    errors: list[str] = []
    for track_id in payload.track_ids:
        track = catalog.get_track(db, track_id)
        if track is None:
            errors.append(f"Track {track_id} not found")
        else:
            tracks.append(track)
    updated, tag_errors = tag_editor.batch_update_tags(db, tracks, changes)
    return BatchTagsResult(updated=updated, errors=errors + tag_errors)


@router.patch("/{track_id}/tags", response_model=TrackRead)
def edit_track_tags(
    track_id: int, payload: TrackTagsUpdate, db: DbDep, _admin: AdminUserDep
):
    """Write tags to the audio file, then sync the library record from disk."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided"
        )
    try:
        return tag_editor.update_track_tags(db, track, changes)
    except FileMissingError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except UnsupportedFormatError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None


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
