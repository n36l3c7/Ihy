from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentUserDep, DbDep
from app.models.playlist import Playlist
from app.models.user import User
from app.schemas.playlist import (
    PlaylistCreate,
    PlaylistDetail,
    PlaylistItemCreate,
    PlaylistItemRead,
    PlaylistOrderUpdate,
    PlaylistRead,
    PlaylistUpdate,
)
from app.services import catalog, playlist_files, user_library

router = APIRouter()


def _get_playlist_or_404(db: Session, user: User, playlist_id: int) -> Playlist:
    playlist = user_library.get_playlist(db, user, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    return playlist


def _get_readable_playlist(db: Session, user: User, playlist_id: int) -> Playlist:
    """The user's own playlist, or anyone's public one (read-only access)."""
    playlist = user_library.get_playlist(db, user, playlist_id)
    if playlist is None:
        playlist = db.scalar(
            select(Playlist)
            .where(Playlist.id == playlist_id, Playlist.is_public.is_(True))
            .options(selectinload(Playlist.owner))
        )
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    return playlist


def _to_read(playlist: Playlist, track_count: int) -> PlaylistRead:
    data = PlaylistRead.model_validate(playlist)
    data.track_count = track_count
    return data


@router.get("", response_model=list[PlaylistRead])
def list_playlists(db: DbDep, user: CurrentUserDep) -> list[PlaylistRead]:
    return [_to_read(playlist, count) for playlist, count in user_library.list_playlists(db, user)]


@router.get("/shared", response_model=list[PlaylistRead])
def list_shared_playlists(db: DbDep, user: CurrentUserDep) -> list[PlaylistRead]:
    """Public playlists owned by other users (read-only)."""
    playlists = db.scalars(
        select(Playlist)
        .where(Playlist.is_public.is_(True), Playlist.owner_id != user.id)
        .options(selectinload(Playlist.owner), selectinload(Playlist.items))
        .order_by(Playlist.name)
    )
    result = []
    for playlist in playlists:
        read = _to_read(playlist, len(playlist.items))
        read.owner_username = playlist.owner.username if playlist.owner else None
        result.append(read)
    return result


@router.post("", response_model=PlaylistRead, status_code=status.HTTP_201_CREATED)
def create_playlist(payload: PlaylistCreate, db: DbDep, user: CurrentUserDep) -> PlaylistRead:
    playlist = user_library.create_playlist(
        db, user, name=payload.name, description=payload.description
    )
    return _to_read(playlist, 0)


class PlaylistImportResult(BaseModel):
    playlist: PlaylistRead
    matched: int
    total: int


@router.post(
    "/import", response_model=PlaylistImportResult, status_code=status.HTTP_201_CREATED
)
def import_playlist(
    file: UploadFile,
    db: DbDep,
    user: CurrentUserDep,
    name: str | None = Form(default=None),
) -> PlaylistImportResult:
    """Create a playlist from an uploaded M3U/M3U8/XSPF file.
    Entries are matched to library tracks by path, then by file name."""
    try:
        content = file.file.read().decode("utf-8-sig", errors="replace")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unreadable file"
        ) from None
    playlist_name = (name or Path(file.filename or "Imported playlist").stem).strip()[:100]
    playlist, matched, total = playlist_files.import_playlist(
        db, user, name=playlist_name or "Imported playlist", content=content
    )
    read = PlaylistRead.model_validate(playlist)
    read.track_count = matched
    return PlaylistImportResult(playlist=read, matched=matched, total=total)


@router.get("/{playlist_id}/export")
def export_playlist(playlist_id: int, db: DbDep, user: CurrentUserDep) -> PlainTextResponse:
    """Download the playlist as extended M3U."""
    playlist = _get_readable_playlist(db, user, playlist_id)
    return PlainTextResponse(
        playlist_files.export_m3u(playlist),
        media_type="audio/x-mpegurl",
        headers={
            "Content-Disposition": f'attachment; filename="{playlist.name}.m3u8"'
        },
    )


@router.get("/{playlist_id}", response_model=PlaylistDetail)
def read_playlist(playlist_id: int, db: DbDep, user: CurrentUserDep) -> PlaylistDetail:
    playlist = _get_readable_playlist(db, user, playlist_id)
    detail = PlaylistDetail.model_validate(playlist)
    detail.track_count = len(playlist.items)
    detail.owner_username = playlist.owner.username if playlist.owner else None
    return detail


@router.patch("/{playlist_id}", response_model=PlaylistRead)
def update_playlist(
    playlist_id: int, payload: PlaylistUpdate, db: DbDep, user: CurrentUserDep
) -> PlaylistRead:
    playlist = _get_playlist_or_404(db, user, playlist_id)
    playlist = user_library.update_playlist(db, playlist, payload.model_dump(exclude_unset=True))
    return _to_read(playlist, len(playlist.items))


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(playlist_id: int, db: DbDep, user: CurrentUserDep) -> None:
    playlist = _get_playlist_or_404(db, user, playlist_id)
    user_library.delete_playlist(db, playlist)


@router.post(
    "/{playlist_id}/tracks", response_model=PlaylistItemRead, status_code=status.HTTP_201_CREATED
)
def add_track(
    playlist_id: int, payload: PlaylistItemCreate, db: DbDep, user: CurrentUserDep
) -> PlaylistItemRead:
    playlist = _get_playlist_or_404(db, user, playlist_id)
    track = catalog.get_track(db, payload.track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    return user_library.add_playlist_item(db, playlist, track)


@router.put("/{playlist_id}/order", status_code=status.HTTP_204_NO_CONTENT)
def reorder_playlist(
    playlist_id: int, payload: PlaylistOrderUpdate, db: DbDep, user: CurrentUserDep
) -> None:
    playlist = _get_playlist_or_404(db, user, playlist_id)
    if not user_library.reorder_playlist(db, playlist, payload.item_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item ids must match the playlist contents exactly",
        )


@router.delete("/{playlist_id}/tracks/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_track(playlist_id: int, item_id: int, db: DbDep, user: CurrentUserDep) -> None:
    playlist = _get_playlist_or_404(db, user, playlist_id)
    if not user_library.remove_playlist_item(db, playlist, item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
