from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.user import User


class SmartPlaylist(TimestampMixin, Base):
    """A rule-based playlist: its tracks are resolved at read time from
    JSON-encoded rules (see services.smart_playlists for the rule schema)."""

    __tablename__ = "smart_playlists"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    match: Mapped[str] = mapped_column(String(3), default="all")  # "all" | "any"
    rules: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of rules
    sort: Mapped[str] = mapped_column(String(20), default="title")
    max_tracks: Mapped[int] = mapped_column(default=100)

    owner: Mapped[User] = relationship()
