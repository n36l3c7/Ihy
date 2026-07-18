from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.library import Track
from app.models.queues import SavedQueue, SavedQueueItem
from app.models.user import User

MAX_QUEUES_PER_USER = 20


class QueueLimitError(Exception):
    def __init__(self) -> None:
        super().__init__(f"You can keep at most {MAX_QUEUES_PER_USER} saved queues")


def list_for_user(db: Session, user: User) -> list[tuple[SavedQueue, int]]:
    counts = dict(
        db.execute(
            select(SavedQueueItem.queue_id, func.count())
            .join(SavedQueue, SavedQueue.id == SavedQueueItem.queue_id)
            .where(SavedQueue.user_id == user.id)
            .group_by(SavedQueueItem.queue_id)
        ).all()
    )
    queues = db.scalars(
        select(SavedQueue).where(SavedQueue.user_id == user.id).order_by(SavedQueue.name)
    )
    return [(queue, counts.get(queue.id, 0)) for queue in queues]


def get_for_user(db: Session, user: User, queue_id: int) -> SavedQueue | None:
    return db.scalar(
        select(SavedQueue)
        .where(SavedQueue.id == queue_id, SavedQueue.user_id == user.id)
        .options(
            selectinload(SavedQueue.items).options(
                selectinload(SavedQueueItem.track).options(
                    selectinload(Track.artists),
                    selectinload(Track.album),
                    selectinload(Track.genres),
                )
            )
        )
    )


def _existing_tracks_in_order(db: Session, track_ids: list[int]) -> list[int]:
    """Keep only ids of tracks that still exist, preserving the given order."""
    existing = set(db.scalars(select(Track.id).where(Track.id.in_(set(track_ids)))))
    return [track_id for track_id in track_ids if track_id in existing]


def _replace_items(db: Session, queue: SavedQueue, track_ids: list[int]) -> None:
    for item in list(queue.items):
        db.delete(item)
    db.flush()
    for position, track_id in enumerate(_existing_tracks_in_order(db, track_ids), start=1):
        db.add(SavedQueueItem(queue_id=queue.id, track_id=track_id, position=position))


def create(
    db: Session,
    user: User,
    *,
    name: str,
    track_ids: list[int],
    current_index: int = 0,
    current_seconds: float = 0.0,
) -> SavedQueue:
    count = (
        db.scalar(
            select(func.count()).select_from(SavedQueue).where(SavedQueue.user_id == user.id)
        )
        or 0
    )
    if count >= MAX_QUEUES_PER_USER:
        raise QueueLimitError()
    queue = SavedQueue(
        user_id=user.id,
        name=name,
        current_index=current_index,
        current_seconds=current_seconds,
    )
    db.add(queue)
    db.flush()
    _replace_items(db, queue, track_ids)
    db.commit()
    db.refresh(queue)
    return queue


def update(db: Session, queue: SavedQueue, changes: dict) -> SavedQueue:
    if changes.get("name") is not None:
        queue.name = changes["name"]
    if changes.get("current_index") is not None:
        queue.current_index = changes["current_index"]
    if changes.get("current_seconds") is not None:
        queue.current_seconds = changes["current_seconds"]
    if changes.get("track_ids") is not None:
        _replace_items(db, queue, changes["track_ids"])
    db.commit()
    db.refresh(queue)
    return queue


def delete(db: Session, queue: SavedQueue) -> None:
    db.delete(queue)
    db.commit()
