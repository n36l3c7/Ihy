from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ScrobbleConfig(TimestampMixin, Base):
    """Per-user scrobbling credentials for ListenBrainz and Last.fm.

    The Last.fm password is never stored: it is exchanged once for a
    session key via auth.getMobileSession.
    """

    __tablename__ = "scrobble_configs"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    listenbrainz_token: Mapped[str | None] = mapped_column(String(100))
    lastfm_api_key: Mapped[str | None] = mapped_column(String(64))
    lastfm_api_secret: Mapped[str | None] = mapped_column(String(64))
    lastfm_session_key: Mapped[str | None] = mapped_column(String(64))
    lastfm_username: Mapped[str | None] = mapped_column(String(100))
