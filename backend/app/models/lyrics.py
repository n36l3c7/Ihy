from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Lyrics(Base):
    """Cached lyrics for a track. A row with null content means
    "lookup attempted, nothing found" — prevents repeated API calls."""

    __tablename__ = "lyrics"

    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True
    )
    content: Mapped[str | None] = mapped_column(Text)
    synced_content: Mapped[str | None] = mapped_column(Text)  # LRC format, for future use
    source: Mapped[str | None] = mapped_column(String(20))  # "file" | "lrclib"
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())
