from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserDep, DbDep
from app.models.queues import SavedQueue
from app.models.user import User
from app.schemas.queues import QueueDetail, QueueRead, QueueSave, QueueUpdate
from app.services import queues as queues_service
from app.services.queues import QueueLimitError

router = APIRouter()


def _get_queue_or_404(db: Session, user: User, queue_id: int) -> SavedQueue:
    queue = queues_service.get_for_user(db, user, queue_id)
    if queue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue not found")
    return queue


def _to_read(queue: SavedQueue, track_count: int) -> QueueRead:
    data = QueueRead.model_validate(queue)
    data.track_count = track_count
    return data


def _to_detail(queue: SavedQueue) -> QueueDetail:
    return QueueDetail(
        id=queue.id,
        name=queue.name,
        current_index=queue.current_index,
        current_seconds=queue.current_seconds,
        tracks=[item.track for item in queue.items],
    )


@router.get("", response_model=list[QueueRead])
def list_queues(db: DbDep, user: CurrentUserDep) -> list[QueueRead]:
    return [_to_read(queue, count) for queue, count in queues_service.list_for_user(db, user)]


@router.post("", response_model=QueueDetail, status_code=status.HTTP_201_CREATED)
def save_queue(payload: QueueSave, db: DbDep, user: CurrentUserDep) -> QueueDetail:
    try:
        queue = queues_service.create(
            db,
            user,
            name=payload.name,
            track_ids=payload.track_ids,
            current_index=payload.current_index,
            current_seconds=payload.current_seconds,
        )
    except QueueLimitError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    return _to_detail(_get_queue_or_404(db, user, queue.id))


@router.get("/{queue_id}", response_model=QueueDetail)
def read_queue(queue_id: int, db: DbDep, user: CurrentUserDep) -> QueueDetail:
    return _to_detail(_get_queue_or_404(db, user, queue_id))


@router.put("/{queue_id}", response_model=QueueDetail)
def update_queue(
    queue_id: int, payload: QueueUpdate, db: DbDep, user: CurrentUserDep
) -> QueueDetail:
    queue = _get_queue_or_404(db, user, queue_id)
    queues_service.update(db, queue, payload.model_dump(exclude_unset=True))
    return _to_detail(_get_queue_or_404(db, user, queue_id))


@router.delete("/{queue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_queue(queue_id: int, db: DbDep, user: CurrentUserDep) -> None:
    queue = _get_queue_or_404(db, user, queue_id)
    queues_service.delete(db, queue)
