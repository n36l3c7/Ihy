"""Daily mixes: genre-based playlists regenerated every day per user.

Deterministic for a given (user, day): reloading the page keeps the same
mixes until midnight. Each mix blends familiar tracks (already played by
the user) with unheard ones from the same genre.
"""

import random
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.interactions import PlayHistory
from app.models.library import Genre, Track, track_genres
from app.models.user import User

MIX_COUNT = 3
MIX_SIZE = 25


def _top_genres(db: Session, user: User, limit: int) -> list[Genre]:
    """Genres the user listens to most; library-wide genres as fallback."""
    listened = db.execute(
        select(Genre, func.count(PlayHistory.id).label("plays"))
        .join(track_genres, track_genres.c.genre_id == Genre.id)
        .join(PlayHistory, PlayHistory.track_id == track_genres.c.track_id)
        .where(PlayHistory.user_id == user.id)
        .group_by(Genre.id)
        .order_by(func.count(PlayHistory.id).desc())
        .limit(limit)
    ).all()
    genres = [genre for genre, _plays in listened]
    if len(genres) < limit:
        filler = db.execute(
            select(Genre, func.count(track_genres.c.track_id))
            .join(track_genres, track_genres.c.genre_id == Genre.id)
            .group_by(Genre.id)
            .order_by(func.count(track_genres.c.track_id).desc())
        ).all()
        for genre, _count in filler:
            if genre not in genres:
                genres.append(genre)
            if len(genres) >= limit:
                break
    return genres


def get_daily_mixes(
    db: Session, user: User, *, count: int = MIX_COUNT, size: int = MIX_SIZE
) -> list[dict]:
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    rng = random.Random(f"{user.id}:{today}")

    played_ids = set(
        db.scalars(select(PlayHistory.track_id).where(PlayHistory.user_id == user.id))
    )
    mixes: list[dict] = []
    for index, genre in enumerate(_top_genres(db, user, count), start=1):
        tracks = list(
            db.scalars(
                select(Track)
                .where(Track.genres.any(Genre.id == genre.id))
                .options(
                    selectinload(Track.artists),
                    selectinload(Track.album),
                    selectinload(Track.genres),
                )
            )
        )
        if not tracks:
            continue
        familiar = [track for track in tracks if track.id in played_ids]
        fresh = [track for track in tracks if track.id not in played_ids]
        rng.shuffle(familiar)
        rng.shuffle(fresh)
        # Roughly 60% familiar, 40% discovery, topped up from whichever remains
        picked = familiar[: int(size * 0.6)] + fresh[: size - int(size * 0.6)]
        remaining = [track for track in familiar + fresh if track not in picked]
        picked += remaining[: size - len(picked)]
        rng.shuffle(picked)
        mixes.append(
            {
                "name": f"Daily Mix {index}",
                "genre": genre.name,
                "tracks": picked[:size],
            }
        )
    return mixes
