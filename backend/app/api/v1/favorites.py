from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUserDep, DbDep
from app.schemas.common import Page
from app.schemas.library import TrackRead
from app.services import catalog, user_library

router = APIRouter()


@router.get("/ids", response_model=list[int])
def favorite_track_ids(db: DbDep, user: CurrentUserDep) -> list[int]:
    """All favorite track ids, for cheap client-side membership checks."""
    return user_library.favorite_ids(db, user)


@router.get("", response_model=Page[TrackRead])
def list_favorites(
    db: DbDep,
    user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    items, total = user_library.list_favorite_tracks(db, user, limit=limit, offset=offset)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.put("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_favorite(track_id: int, db: DbDep, user: CurrentUserDep) -> None:
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    user_library.add_favorite(db, user, track)


@router.delete("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(track_id: int, db: DbDep, user: CurrentUserDep) -> None:
    user_library.remove_favorite(db, user, track_id)
