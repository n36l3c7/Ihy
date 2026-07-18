from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class RadioStation(TimestampMixin, Base):
    """An internet radio stream, shared by all users (admin-managed)."""

    __tablename__ = "radio_stations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    stream_url: Mapped[str] = mapped_column(String(1000))
    homepage_url: Mapped[str | None] = mapped_column(String(1000))
