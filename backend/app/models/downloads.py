from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.library import Source


class DownloadWatch(TimestampMixin, Base):
    """An artist/album/playlist watched for automatic download via spotdl."""

    __tablename__ = "download_watches"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    query: Mapped[str] = mapped_column(String(1024))  # Spotify URL or search text
    source_id: Mapped[int] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), index=True
    )
    enabled: Mapped[bool] = mapped_column(default=True)
    last_run_at: Mapped[datetime | None]
    last_status: Mapped[str | None] = mapped_column(String(20))  # "ok" | "error"
    last_error: Mapped[str | None] = mapped_column(Text)

    source: Mapped["Source"] = relationship()
