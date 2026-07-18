from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ArtistInfo(Base):
    """Cached artist biography. A row with null bio means "lookup
    attempted, nothing found" — prevents repeated API calls."""

    __tablename__ = "artist_info"

    artist_id: Mapped[int] = mapped_column(
        ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True
    )
    bio: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str | None] = mapped_column(String(20))  # "wikipedia"
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())
