from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUserDep, DbDep
from app.schemas.common import Page
from app.schemas.history import PlayCreate, PlayHistoryRead
from app.services import catalog, user_library

router = APIRouter()


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
def record_play(payload: PlayCreate, db: DbDep, user: CurrentUserDep) -> None:
    track = catalog.get_track(db, payload.track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    user_library.record_play(db, user, track)


@router.get("", response_model=Page[PlayHistoryRead])
def list_history(
    db: DbDep,
    user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    items, total = user_library.list_history(db, user, limit=limit, offset=offset)
    return {"items": items, "total": total, "limit": limit, "offset": offset}
