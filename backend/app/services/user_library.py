from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.interactions import Favorite, PlayHistory
from app.models.library import Track
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User

_TRACK_RELATIONS = (
    selectinload(Track.artists),
    selectinload(Track.album),
    selectinload(Track.genres),
)


# --- Favorites ---


def list_favorite_tracks(
    db: Session, user: User, *, limit: int = 50, offset: int = 0
) -> tuple[list[Track], int]:
    base = (
        select(Track)
        .join(Favorite, Favorite.track_id == Track.id)
        .where(Favorite.user_id == user.id)
    )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    stmt = (
        base.options(*_TRACK_RELATIONS)
        .order_by(Favorite.created_at.desc(), Track.id)
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt)), total


def favorite_ids(db: Session, user: User) -> list[int]:
    return list(db.scalars(select(Favorite.track_id).where(Favorite.user_id == user.id)))


def add_favorite(db: Session, user: User, track: Track) -> None:
    """Idempotent: adding an already-liked track is a no-op."""
    existing = db.get(Favorite, (user.id, track.id))
    if existing is None:
        db.add(Favorite(user_id=user.id, track_id=track.id))
        db.commit()


def remove_favorite(db: Session, user: User, track_id: int) -> None:
    """Idempotent: removing a non-favorite is a no-op."""
    existing = db.get(Favorite, (user.id, track_id))
    if existing is not None:
        db.delete(existing)
        db.commit()


# --- Playlists ---


def list_playlists(db: Session, user: User) -> list[tuple[Playlist, int]]:
    counts = dict(
        db.execute(
            select(PlaylistItem.playlist_id, func.count())
            .join(Playlist, Playlist.id == PlaylistItem.playlist_id)
            .where(Playlist.owner_id == user.id)
            .group_by(PlaylistItem.playlist_id)
        ).all()
    )
    playlists = db.scalars(
        select(Playlist).where(Playlist.owner_id == user.id).order_by(Playlist.name)
    )
    return [(playlist, counts.get(playlist.id, 0)) for playlist in playlists]


def get_playlist(db: Session, user: User, playlist_id: int) -> Playlist | None:
    """Return the playlist only when owned by the user (otherwise None)."""
    return db.scalar(
        select(Playlist)
        .where(Playlist.id == playlist_id, Playlist.owner_id == user.id)
        .options(
            selectinload(Playlist.items).options(
                selectinload(PlaylistItem.track).options(*_TRACK_RELATIONS)
            )
        )
    )


def create_playlist(
    db: Session, user: User, *, name: str, description: str | None = None
) -> Playlist:
    playlist = Playlist(owner_id=user.id, name=name, description=description)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist


def update_playlist(db: Session, playlist: Playlist, changes: dict[str, Any]) -> Playlist:
    if changes.get("name") is not None:
        playlist.name = changes["name"]
    if "description" in changes:
        playlist.description = changes["description"]
    db.commit()
    db.refresh(playlist)
    return playlist


def delete_playlist(db: Session, playlist: Playlist) -> None:
    db.delete(playlist)
    db.commit()


def add_playlist_item(db: Session, playlist: Playlist, track: Track) -> PlaylistItem:
    """Append the track at the end. Duplicates are allowed by design."""
    next_position = (
        db.scalar(
            select(func.coalesce(func.max(PlaylistItem.position), 0)).where(
                PlaylistItem.playlist_id == playlist.id
            )
        )
        or 0
    ) + 1
    item = PlaylistItem(playlist_id=playlist.id, track_id=track.id, position=next_position)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def reorder_playlist(db: Session, playlist: Playlist, item_ids: list[int]) -> bool:
    """Rewrite item positions to match the given order. The id list must
    contain exactly the playlist's items, otherwise nothing changes."""
    current_ids = [item.id for item in playlist.items]
    if sorted(item_ids) != sorted(current_ids) or len(item_ids) != len(current_ids):
        return False
    position_by_id = {item_id: position for position, item_id in enumerate(item_ids, start=1)}
    for item in playlist.items:
        item.position = position_by_id[item.id]
    db.commit()
    return True


def remove_playlist_item(db: Session, playlist: Playlist, item_id: int) -> bool:
    item = db.scalar(
        select(PlaylistItem).where(
            PlaylistItem.id == item_id, PlaylistItem.playlist_id == playlist.id
        )
    )
    if item is None:
        return False
    db.delete(item)
    db.commit()
    return True


# --- Play history ---


def record_play(db: Session, user: User, track: Track) -> None:
    db.add(PlayHistory(user_id=user.id, track_id=track.id))
    db.commit()


def list_history(
    db: Session, user: User, *, limit: int = 50, offset: int = 0
) -> tuple[list[PlayHistory], int]:
    base = select(PlayHistory).where(PlayHistory.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    stmt = (
        base.options(selectinload(PlayHistory.track).options(*_TRACK_RELATIONS))
        .order_by(PlayHistory.played_at.desc(), PlayHistory.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt)), total
