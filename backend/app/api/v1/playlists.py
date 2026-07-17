from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserDep, DbDep
from app.models.playlist import Playlist
from app.models.user import User
from app.schemas.playlist import (
    PlaylistCreate,
    PlaylistDetail,
    PlaylistItemCreate,
    PlaylistItemRead,
    PlaylistRead,
    PlaylistUpdate,
)
from app.services import catalog, user_library

router = APIRouter()


def _get_playlist_or_404(db: Session, user: User, playlist_id: int) -> Playlist:
    playlist = user_library.get_playlist(db, user, playlist_id)
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


@router.post("", response_model=PlaylistRead, status_code=status.HTTP_201_CREATED)
def create_playlist(payload: PlaylistCreate, db: DbDep, user: CurrentUserDep) -> PlaylistRead:
    playlist = user_library.create_playlist(
        db, user, name=payload.name, description=payload.description
    )
    return _to_read(playlist, 0)


@router.get("/{playlist_id}", response_model=PlaylistDetail)
def read_playlist(playlist_id: int, db: DbDep, user: CurrentUserDep) -> PlaylistDetail:
    playlist = _get_playlist_or_404(db, user, playlist_id)
    detail = PlaylistDetail.model_validate(playlist)
    detail.track_count = len(playlist.items)
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


@router.delete("/{playlist_id}/tracks/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_track(playlist_id: int, item_id: int, db: DbDep, user: CurrentUserDep) -> None:
    playlist = _get_playlist_or_404(db, user, playlist_id)
    if not user_library.remove_playlist_item(db, playlist, item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
