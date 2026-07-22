from typing import Literal

from sqlalchemy import Select, distinct, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.interactions import PlayHistory
from app.models.library import Album, Artist, Genre, Track, track_artists, track_genres

TrackSort = Literal["title", "recent", "random"]


def _apply_track_filters(
    stmt: Select,
    q: str | None,
    artist_id: int | None,
    album_id: int | None,
    genre_id: int | None,
) -> Select:
    if q:
        pattern = f"%{q}%"
        stmt = stmt.outerjoin(Album, Track.album_id == Album.id).where(
            or_(
                Track.title.ilike(pattern),
                Track.artists.any(Artist.name.ilike(pattern)),
                Album.title.ilike(pattern),
            )
        )
    if artist_id is not None:
        stmt = stmt.where(Track.artists.any(Artist.id == artist_id))
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
    ids: list[int] | None = None,
    sort: TrackSort = "title",
    limit: int = 50,
    offset: int = 0,
    never_played_for_user: int | None = None,
) -> tuple[list[Track], int]:
    base = _apply_track_filters(select(Track), q, artist_id, album_id, genre_id)
    if ids is not None:
        base = base.where(Track.id.in_(ids))
    if never_played_for_user is not None:
        played = select(PlayHistory.track_id).where(
            PlayHistory.user_id == never_played_for_user
        )
        base = base.where(Track.id.notin_(played))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    if sort == "random":
        order = func.random()
    elif sort == "recent":
        order = Track.created_at.desc()
    else:
        order = Track.title
    stmt = (
        base.options(
            selectinload(Track.artists),
            selectinload(Track.album),
            selectinload(Track.genres),
        )
        .order_by(order, Track.id)
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt)), total


def radio_tracks(
    db: Session, seed: Track, *, limit: int = 20, exclude_ids: set[int] | None = None
) -> list[Track]:
    """Random tracks similar to the seed (shared genre or artist).

    Falls back to any random track when the seed has no genres/artists or
    similarity leaves too few results. Used by the autoplay radio.
    """
    excluded = set(exclude_ids or set()) | {seed.id}
    genre_ids = [genre.id for genre in seed.genres]
    artist_ids = [artist.id for artist in seed.artists]
    conditions = []
    if genre_ids:
        conditions.append(Track.genres.any(Genre.id.in_(genre_ids)))
    if artist_ids:
        conditions.append(Track.artists.any(Artist.id.in_(artist_ids)))

    def pick(stmt: Select, count: int) -> list[Track]:
        return list(
            db.scalars(
                stmt.where(Track.id.notin_(excluded))
                .options(
                    selectinload(Track.artists),
                    selectinload(Track.album),
                    selectinload(Track.genres),
                )
                .order_by(func.random())
                .limit(count)
            )
        )

    tracks: list[Track] = []
    if conditions:
        tracks = pick(select(Track).where(or_(*conditions)), limit)
    if len(tracks) < limit:
        excluded |= {track.id for track in tracks}
        tracks += pick(select(Track), limit - len(tracks))
    return tracks


def get_track(db: Session, track_id: int) -> Track | None:
    return db.scalar(
        select(Track)
        .where(Track.id == track_id)
        .options(
            selectinload(Track.artists),
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
        select(
            Artist,
            func.count(distinct(Album.id)),
            func.count(distinct(track_artists.c.track_id)),
        )
        .outerjoin(Album, Album.artist_id == Artist.id)
        .outerjoin(track_artists, track_artists.c.artist_id == Artist.id)
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


AlbumSort = Literal["title", "recent", "random"]


def list_albums(
    db: Session,
    *,
    q: str | None = None,
    artist_id: int | None = None,
    sort: AlbumSort = "title",
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

    order = (
        Album.created_at.desc()
        if sort == "recent"
        else func.random()
        if sort == "random"
        else Album.title
    )
    stmt = (
        select(Album, func.count(Track.id))
        .outerjoin(Track, Track.album_id == Album.id)
        .options(selectinload(Album.artist))
        .group_by(Album.id)
        .order_by(order)
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
                selectinload(Track.artists),
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
