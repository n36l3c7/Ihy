from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUserDep, DbDep
from app.models.interactions import Bookmark
from app.models.library import Track
from app.schemas.bookmarks import BookmarkCreate, BookmarkRead
from app.services import catalog

router = APIRouter()


@router.get("", response_model=list[BookmarkRead])
def list_bookmarks(db: DbDep, user: CurrentUserDep) -> list[Bookmark]:
    return list(
        db.scalars(
            select(Bookmark)
            .where(Bookmark.user_id == user.id)
            .order_by(Bookmark.created_at.desc())
            .options(
                selectinload(Bookmark.track).options(
                    selectinload(Track.artists),
                    selectinload(Track.album),
                    selectinload(Track.genres),
                )
            )
        )
    )


@router.post("", response_model=BookmarkRead, status_code=status.HTTP_201_CREATED)
def create_bookmark(payload: BookmarkCreate, db: DbDep, user: CurrentUserDep) -> Bookmark:
    track = catalog.get_track(db, payload.track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    bookmark = Bookmark(
        user_id=user.id, track_id=track.id, seconds=payload.seconds, note=payload.note
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark


@router.delete("/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bookmark(bookmark_id: int, db: DbDep, user: CurrentUserDep) -> None:
    bookmark = db.get(Bookmark, bookmark_id)
    if bookmark is None or bookmark.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bookmark not found")
    db.delete(bookmark)
    db.commit()
