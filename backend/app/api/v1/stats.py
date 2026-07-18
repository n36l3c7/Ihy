from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUserDep, DbDep
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
