from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WatchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    query: str = Field(min_length=1, max_length=1024)
    source_id: int


class WatchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    query: str | None = Field(default=None, min_length=1, max_length=1024)
    source_id: int | None = None
    enabled: bool | None = None


class WatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    query: str
    source_id: int
    enabled: bool
    last_run_at: datetime | None
    last_status: str | None
    last_error: str | None
    created_at: datetime


class DownloadStatusRead(BaseModel):
    available: bool
    running: bool
    current_watch: str | None
    last_finished_at: datetime | None


class DownloadSettings(BaseModel):
    check_interval_hours: int = Field(ge=0, le=720)


class SpotdlOptions(BaseModel):
    output_format: Literal["mp3", "flac", "ogg", "opus", "m4a"] | None = None
    bitrate: str | None = Field(default=None, max_length=10)  # e.g. "320k" or "disable"
    threads: int | None = Field(default=None, ge=1, le=16)
    extra_args: str = Field(default="", max_length=500)
    client_id: str = Field(default="", max_length=100)
    client_secret: str = Field(default="", max_length=100)


class SpotifyArtistRead(BaseModel):
    id: str
    name: str
    url: str
    image: str | None = None
    followers: int | None = None


class DownloadLogRead(BaseModel):
    lines: list[str]
