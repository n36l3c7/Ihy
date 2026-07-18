from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.interactions import PlayHistory
from app.models.library import Album, Artist, Track, track_artists
from app.models.user import User


def overview(db: Session, user: User, days: int | None = None) -> dict:
    """Aggregated listening statistics for one user."""
    filters = [PlayHistory.user_id == user.id]
    if days is not None:
        since = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)
        filters.append(PlayHistory.played_at >= since)

    total_plays = (
        db.scalar(select(func.count()).select_from(PlayHistory).where(*filters)) or 0
    )
    distinct_tracks = (
        db.scalar(
            select(func.count(func.distinct(PlayHistory.track_id)))
            .select_from(PlayHistory)
            .where(*filters)
        )
        or 0
    )
    total_seconds = (
        db.scalar(
            select(func.coalesce(func.sum(Track.duration), 0.0))
            .select_from(PlayHistory)
            .join(Track, Track.id == PlayHistory.track_id)
            .where(*filters)
        )
        or 0.0
    )

    top_tracks_rows = db.execute(
        select(Track, func.count().label("plays"))
        .join(PlayHistory, PlayHistory.track_id == Track.id)
        .where(*filters)
        .group_by(Track.id)
        .order_by(func.count().desc(), Track.title)
        .limit(10)
        .options(
            selectinload(Track.artists),
            selectinload(Track.album),
            selectinload(Track.genres),
        )
    ).all()

    top_artists_rows = db.execute(
        select(Artist.id, Artist.name, func.count().label("plays"))
        .select_from(PlayHistory)
        .join(Track, Track.id == PlayHistory.track_id)
        .join(track_artists, track_artists.c.track_id == Track.id)
        .join(Artist, Artist.id == track_artists.c.artist_id)
        .where(*filters)
        .group_by(Artist.id)
        .order_by(func.count().desc(), Artist.name)
        .limit(10)
    ).all()

    top_albums_rows = db.execute(
        select(Album.id, Album.title, func.count().label("plays"))
        .select_from(PlayHistory)
        .join(Track, Track.id == PlayHistory.track_id)
        .join(Album, Album.id == Track.album_id)
        .where(*filters)
        .group_by(Album.id)
        .order_by(func.count().desc(), Album.title)
        .limit(10)
    ).all()

    # Daily activity always covers the last 30 days
    chart_since = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=30)
    day_expr = func.date(PlayHistory.played_at)
    plays_by_day_rows = db.execute(
        select(day_expr.label("day"), func.count())
        .where(PlayHistory.user_id == user.id, PlayHistory.played_at >= chart_since)
        .group_by(day_expr)
        .order_by(day_expr)
    ).all()

    return {
        "total_plays": total_plays,
        "distinct_tracks": distinct_tracks,
        "total_seconds": float(total_seconds),
        "top_tracks": [{"track": track, "plays": plays} for track, plays in top_tracks_rows],
        "top_artists": [
            {"id": artist_id, "name": name, "plays": plays}
            for artist_id, name, plays in top_artists_rows
        ],
        "top_albums": [
            {"id": album_id, "title": title, "plays": plays}
            for album_id, title, plays in top_albums_rows
        ],
        "plays_by_day": [
            {"day": str(day), "plays": plays} for day, plays in plays_by_day_rows
        ],
    }
