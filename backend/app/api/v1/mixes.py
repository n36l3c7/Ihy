from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import CurrentUserDep, DbDep
from app.schemas.library import TrackRead
from app.services import daily_mixes

router = APIRouter()


class DailyMixRead(BaseModel):
    name: str
    genre: str
    tracks: list[TrackRead]


@router.get("/daily", response_model=list[DailyMixRead])
def get_daily_mixes(db: DbDep, user: CurrentUserDep) -> list[dict]:
    """Genre-based mixes regenerated every day, stable within the day."""
    return daily_mixes.get_daily_mixes(db, user)


@router.get("/recommended", response_model=list[TrackRead])
def get_recommended(db: DbDep, user: CurrentUserDep) -> list:
    """Tracks picked from the user's favorite genres, reshuffled each call."""
    return daily_mixes.get_recommended_tracks(db, user)
