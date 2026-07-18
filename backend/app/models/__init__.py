"""All ORM models. Importing this package registers every model on Base.metadata,
which Alembic autogenerate and Base.metadata.create_all rely on."""

from app.db.base import Base
from app.models.app_setting import AppSetting
from app.models.artist_info import ArtistInfo
from app.models.downloads import DownloadFix, DownloadWatch
from app.models.interactions import Bookmark, Favorite, PlayHistory
from app.models.library import (
    Album,
    Artist,
    Genre,
    Source,
    Track,
    track_artists,
    track_genres,
)
from app.models.lyrics import Lyrics
from app.models.playlist import Playlist, PlaylistItem
from app.models.queues import SavedQueue, SavedQueueItem
from app.models.user import User, UserRole

__all__ = [
    "Album",
    "AppSetting",
    "Artist",
    "ArtistInfo",
    "Base",
    "Bookmark",
    "DownloadFix",
    "DownloadWatch",
    "Favorite",
    "Genre",
    "Lyrics",
    "PlayHistory",
    "Playlist",
    "PlaylistItem",
    "SavedQueue",
    "SavedQueueItem",
    "Source",
    "Track",
    "User",
    "UserRole",
    "track_artists",
    "track_genres",
]
