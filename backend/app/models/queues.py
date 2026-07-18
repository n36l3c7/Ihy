from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.library import Track


class SavedQueue(TimestampMixin, Base):
    """A named playback queue saved by a user, remembering the position
    (track index and seconds) where playback stopped."""

    __tablename__ = "saved_queues"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    current_index: Mapped[int] = mapped_column(default=0)
    current_seconds: Mapped[float] = mapped_column(default=0.0)

    items: Mapped[list["SavedQueueItem"]] = relationship(
        back_populates="queue",
        cascade="all, delete-orphan",
        order_by="SavedQueueItem.position",
    )


class SavedQueueItem(Base):
    __tablename__ = "saved_queue_items"
    __table_args__ = (Index("ix_saved_queue_items_queue_position", "queue_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    queue_id: Mapped[int] = mapped_column(ForeignKey("saved_queues.id", ondelete="CASCADE"))
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    position: Mapped[int]

    queue: Mapped["SavedQueue"] = relationship(back_populates="items")
    track: Mapped["Track"] = relationship()
