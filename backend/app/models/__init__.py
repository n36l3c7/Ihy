"""All ORM models. Importing this package registers every model on Base.metadata,
which Alembic autogenerate and Base.metadata.create_all rely on."""

from app.db.base import Base
from app.models.interactions import Favorite, PlayHistory
from app.models.library import Album, Artist, Genre, Source, Track, track_genres
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User, UserRole

__all__ = [
    "Album",
    "Artist",
    "Base",
    "Favorite",
    "Genre",
    "PlayHistory",
    "Playlist",
    "PlaylistItem",
    "Source",
    "Track",
    "User",
    "UserRole",
    "track_genres",
]
