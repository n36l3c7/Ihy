from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.models.interactions import TrackRating
from app.services import catalog

router = APIRouter()


class RatingRead(BaseModel):
    track_id: int
    rating: int


class RatingUpdate(BaseModel):
    rating: int = Field(ge=0, le=5)  # 0 removes the rating


@router.get("", response_model=list[RatingRead])
def list_ratings(db: DbDep, user: CurrentUserDep) -> list[RatingRead]:
    rows = db.execute(
        select(TrackRating.track_id, TrackRating.rating).where(
            TrackRating.user_id == user.id
        )
    ).all()
    return [RatingRead(track_id=track_id, rating=rating) for track_id, rating in rows]


@router.put("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def set_rating(track_id: int, payload: RatingUpdate, db: DbDep, user: CurrentUserDep) -> None:
    if catalog.get_track(db, track_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    existing = db.get(TrackRating, (user.id, track_id))
    if payload.rating == 0:
        if existing is not None:
            db.delete(existing)
    elif existing is not None:
        existing.rating = payload.rating
    else:
        db.add(TrackRating(user_id=user.id, track_id=track_id, rating=payload.rating))
    db.commit()
