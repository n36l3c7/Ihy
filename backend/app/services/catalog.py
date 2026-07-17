from typing import Literal

from sqlalchemy import Select, distinct, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.library import Album, Artist, Genre, Track, track_genres

TrackSort = Literal["title", "recent"]


def _apply_track_filters(
    stmt: Select,
    q: str | None,
    artist_id: int | None,
    album_id: int | None,
    genre_id: int | None,
) -> Select:
    if q:
        pattern = f"%{q}%"
        stmt = (
            stmt.outerjoin(Artist, Track.artist_id == Artist.id)
            .outerjoin(Album, Track.album_id == Album.id)
            .where(
                or_(
                    Track.title.ilike(pattern),
                    Artist.name.ilike(pattern),
                    Album.title.ilike(pattern),
                )
            )
        )
    if artist_id is not None:
        stmt = stmt.where(Track.artist_id == artist_id)
    if album_id is not None:
        stmt = stmt.where(Track.album_id == album_id)
    if genre_id is not None:
        stmt = stmt.where(Track.genres.any(Genre.id == genre_id))
    return stmt


def list_tracks(
    db: Session,
    *,
    q: str | None = None,
    artist_id: int | None = None,
    album_id: int | None = None,
    genre_id: int | None = None,
    sort: TrackSort = "title",
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Track], int]:
    base = _apply_track_filters(select(Track), q, artist_id, album_id, genre_id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    order = Track.created_at.desc() if sort == "recent" else Track.title
    stmt = (
        base.options(
            selectinload(Track.artist),
            selectinload(Track.album),
            selectinload(Track.genres),
        )
        .order_by(order, Track.id)
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt)), total


def get_track(db: Session, track_id: int) -> Track | None:
    return db.scalar(
        select(Track)
        .where(Track.id == track_id)
        .options(
            selectinload(Track.artist),
            selectinload(Track.album),
            selectinload(Track.genres),
        )
    )


def list_artists(
    db: Session, *, q: str | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[tuple[Artist, int, int]], int]:
    """Artists with album and track counts."""
    base = select(Artist)
    if q:
        base = base.where(Artist.name.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    stmt = (
        select(Artist, func.count(distinct(Album.id)), func.count(distinct(Track.id)))
        .outerjoin(Album, Album.artist_id == Artist.id)
        .outerjoin(Track, Track.artist_id == Artist.id)
        .group_by(Artist.id)
        .order_by(Artist.name)
        .limit(limit)
        .offset(offset)
    )
    if q:
        stmt = stmt.where(Artist.name.ilike(f"%{q}%"))
    rows = db.execute(stmt).all()
    return [(artist, album_count, track_count) for artist, album_count, track_count in rows], total


def get_artist(db: Session, artist_id: int) -> Artist | None:
    return db.get(Artist, artist_id)


def list_albums(
    db: Session,
    *,
    q: str | None = None,
    artist_id: int | None = None,
    limit: int | None = 50,
    offset: int = 0,
) -> tuple[list[tuple[Album, int]], int]:
    """Albums with their track counts."""
    base = select(Album)
    if q:
        base = base.where(Album.title.ilike(f"%{q}%"))
    if artist_id is not None:
        base = base.where(Album.artist_id == artist_id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    stmt = (
        select(Album, func.count(Track.id))
        .outerjoin(Track, Track.album_id == Album.id)
        .options(selectinload(Album.artist))
        .group_by(Album.id)
        .order_by(Album.title)
        .offset(offset)
    )
    if q:
        stmt = stmt.where(Album.title.ilike(f"%{q}%"))
    if artist_id is not None:
        stmt = stmt.where(Album.artist_id == artist_id)
    if limit is not None:
        stmt = stmt.limit(limit)
    rows = db.execute(stmt).all()
    return [(album, track_count) for album, track_count in rows], total


def get_album(db: Session, album_id: int) -> Album | None:
    return db.scalar(
        select(Album)
        .where(Album.id == album_id)
        .options(
            selectinload(Album.artist),
            selectinload(Album.tracks).options(
                selectinload(Track.artist),
                selectinload(Track.album),
                selectinload(Track.genres),
            ),
        )
    )


def list_genres(db: Session) -> list[tuple[Genre, int]]:
    stmt = (
        select(Genre, func.count(track_genres.c.track_id))
        .outerjoin(track_genres, track_genres.c.genre_id == Genre.id)
        .group_by(Genre.id)
        .order_by(Genre.name)
    )
    return [(genre, track_count) for genre, track_count in db.execute(stmt).all()]
