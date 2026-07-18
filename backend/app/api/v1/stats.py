from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import extract, func, select

from app.api.deps import CurrentUserDep, DbDep
from app.models.interactions import PlayHistory
from app.models.library import Album, Artist, Genre, Track, track_artists, track_genres
from app.schemas.stats import StatsRead
from app.services import stats as stats_service

router = APIRouter()


@router.get("", response_model=StatsRead)
def read_stats(
    db: DbDep,
    user: CurrentUserDep,
    days: Annotated[int | None, Query(ge=1, le=3650)] = None,
) -> dict:
    """The requesting user's listening statistics (all time or last N days)."""
    return stats_service.overview(db, user, days)


class WrappedItem(BaseModel):
    id: int
    name: str
    plays: int


class WrappedRead(BaseModel):
    year: int
    total_plays: int
    total_minutes: int
    distinct_tracks: int
    distinct_artists: int
    top_artists: list[WrappedItem]
    top_tracks: list[WrappedItem]
    top_albums: list[WrappedItem]
    top_genres: list[WrappedItem]
    busiest_month: str | None
    available_years: list[int]


@router.get("/wrapped", response_model=WrappedRead)
def wrapped(
    db: DbDep,
    user: CurrentUserDep,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
) -> WrappedRead:
    """A year-in-review of the user's listening."""
    years = sorted(
        {
            int(value)
            for value in db.scalars(
                select(extract("year", PlayHistory.played_at)).where(
                    PlayHistory.user_id == user.id
                )
            )
            if value is not None
        }
    )
    target = year or (years[-1] if years else datetime.now().year)
    in_year = (
        PlayHistory.user_id == user.id,
        extract("year", PlayHistory.played_at) == target,
    )

    def top(entity, name_column, join_steps, limit=5) -> list[WrappedItem]:
        stmt = select(entity.id, name_column, func.count(PlayHistory.id).label("plays"))
        for target_table, condition in join_steps:
            stmt = stmt.join(target_table, condition)
        stmt = (
            stmt.where(*in_year)
            .group_by(entity.id)
            .order_by(func.count(PlayHistory.id).desc())
            .limit(limit)
        )
        return [
            WrappedItem(id=row[0], name=row[1], plays=row[2]) for row in db.execute(stmt)
        ]

    total_plays = (
        db.scalar(select(func.count(PlayHistory.id)).where(*in_year)) or 0
    )
    total_seconds = (
        db.scalar(
            select(func.coalesce(func.sum(Track.duration), 0.0))
            .select_from(PlayHistory)
            .join(Track, Track.id == PlayHistory.track_id)
            .where(*in_year)
        )
        or 0.0
    )
    distinct_tracks = (
        db.scalar(
            select(func.count(func.distinct(PlayHistory.track_id))).where(*in_year)
        )
        or 0
    )
    distinct_artists = (
        db.scalar(
            select(func.count(func.distinct(track_artists.c.artist_id)))
            .select_from(PlayHistory)
            .join(track_artists, track_artists.c.track_id == PlayHistory.track_id)
            .where(*in_year)
        )
        or 0
    )
    month_row = db.execute(
        select(
            extract("month", PlayHistory.played_at).label("month"),
            func.count(PlayHistory.id).label("plays"),
        )
        .where(*in_year)
        .group_by("month")
        .order_by(func.count(PlayHistory.id).desc())
        .limit(1)
    ).first()
    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    busiest = month_names[int(month_row[0]) - 1] if month_row else None

    return WrappedRead(
        year=target,
        total_plays=total_plays,
        total_minutes=int(total_seconds // 60),
        distinct_tracks=distinct_tracks,
        distinct_artists=distinct_artists,
        top_artists=top(
            Artist,
            Artist.name,
            [
                (track_artists, track_artists.c.artist_id == Artist.id),
                (PlayHistory, PlayHistory.track_id == track_artists.c.track_id),
            ],
        ),
        top_tracks=top(
            Track, Track.title, [(PlayHistory, PlayHistory.track_id == Track.id)]
        ),
        top_albums=top(
            Album,
            Album.title,
            [
                (Track, Track.album_id == Album.id),
                (PlayHistory, PlayHistory.track_id == Track.id),
            ],
        ),
        top_genres=top(
            Genre,
            Genre.name,
            [
                (track_genres, track_genres.c.genre_id == Genre.id),
                (PlayHistory, PlayHistory.track_id == track_genres.c.track_id),
            ],
        ),
        busiest_month=busiest,
        available_years=years,
    )
