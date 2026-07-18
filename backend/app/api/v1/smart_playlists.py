import json

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.models.smart_playlist import SmartPlaylist
from app.schemas.library import TrackRead
from app.services.smart_playlists import (
    VALID_SORTS,
    InvalidRuleError,
    resolve_tracks,
    validate_rules,
)

router = APIRouter()


class SmartRule(BaseModel):
    field: str = Field(max_length=30)
    op: str = Field(default="is", max_length=20)
    value: str | int | float | bool


class SmartPlaylistPayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    match: str = Field(default="all", pattern="^(all|any)$")
    rules: list[SmartRule] = []
    sort: str = "title"
    max_tracks: int = Field(default=100, ge=1, le=1000)


class SmartPlaylistRead(BaseModel):
    id: int
    name: str
    match: str
    rules: list[SmartRule]
    sort: str
    max_tracks: int


def _to_read(playlist: SmartPlaylist) -> SmartPlaylistRead:
    return SmartPlaylistRead(
        id=playlist.id,
        name=playlist.name,
        match=playlist.match,
        rules=[SmartRule(**rule) for rule in json.loads(playlist.rules)],
        sort=playlist.sort,
        max_tracks=playlist.max_tracks,
    )


def _validate(payload: SmartPlaylistPayload) -> None:
    if payload.sort not in VALID_SORTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"sort must be one of {sorted(VALID_SORTS)}",
        )
    try:
        validate_rules([rule.model_dump() for rule in payload.rules])
    except InvalidRuleError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from None


def _get_owned(db: DbDep, user: CurrentUserDep, playlist_id: int) -> SmartPlaylist:
    playlist = db.get(SmartPlaylist, playlist_id)
    if playlist is None or playlist.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Smart playlist not found"
        )
    return playlist


@router.get("", response_model=list[SmartPlaylistRead])
def list_smart_playlists(db: DbDep, user: CurrentUserDep) -> list[SmartPlaylistRead]:
    playlists = db.scalars(
        select(SmartPlaylist)
        .where(SmartPlaylist.owner_id == user.id)
        .order_by(SmartPlaylist.name)
    )
    return [_to_read(playlist) for playlist in playlists]


@router.post("", response_model=SmartPlaylistRead, status_code=status.HTTP_201_CREATED)
def create_smart_playlist(
    payload: SmartPlaylistPayload, db: DbDep, user: CurrentUserDep
) -> SmartPlaylistRead:
    _validate(payload)
    playlist = SmartPlaylist(
        owner_id=user.id,
        name=payload.name,
        match=payload.match,
        rules=json.dumps([rule.model_dump() for rule in payload.rules]),
        sort=payload.sort,
        max_tracks=payload.max_tracks,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_read(playlist)


@router.get("/{playlist_id}", response_model=SmartPlaylistRead)
def get_smart_playlist(
    playlist_id: int, db: DbDep, user: CurrentUserDep
) -> SmartPlaylistRead:
    return _to_read(_get_owned(db, user, playlist_id))


@router.put("/{playlist_id}", response_model=SmartPlaylistRead)
def update_smart_playlist(
    playlist_id: int, payload: SmartPlaylistPayload, db: DbDep, user: CurrentUserDep
) -> SmartPlaylistRead:
    _validate(payload)
    playlist = _get_owned(db, user, playlist_id)
    playlist.name = payload.name
    playlist.match = payload.match
    playlist.rules = json.dumps([rule.model_dump() for rule in payload.rules])
    playlist.sort = payload.sort
    playlist.max_tracks = payload.max_tracks
    db.commit()
    db.refresh(playlist)
    return _to_read(playlist)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_smart_playlist(playlist_id: int, db: DbDep, user: CurrentUserDep) -> None:
    playlist = _get_owned(db, user, playlist_id)
    db.delete(playlist)
    db.commit()


@router.get("/{playlist_id}/tracks", response_model=list[TrackRead])
def smart_playlist_tracks(playlist_id: int, db: DbDep, user: CurrentUserDep) -> list:
    playlist = _get_owned(db, user, playlist_id)
    try:
        return resolve_tracks(db, user, playlist)
    except InvalidRuleError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from None
