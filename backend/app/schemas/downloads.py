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
    # Providers (space separated, e.g. "youtube-music youtube")
    audio_providers: str = Field(default="", max_length=200)
    lyrics_providers: str = Field(default="", max_length=200)
    # Output
    output_template: str = Field(default="", max_length=300)
    # "album" avoids duplicates when a song exists both as single and album track
    album_type: Literal["album", "single", "compilation"] | None = None
    overwrite: Literal["skip", "metadata", "force"] | None = None
    restrict: Literal["strict", "ascii"] | None = None
    max_filename_length: int | None = Field(default=None, ge=10, le=255)
    # Behavior toggles
    sponsor_block: bool = False
    playlist_numbering: bool = False
    generate_lrc: bool = False
    print_errors: bool = True
    scan_for_songs: bool = False
    fetch_albums: bool = False
    # Network / advanced
    proxy: str = Field(default="", max_length=300)
    cookie_file: str = Field(default="", max_length=500)
    yt_dlp_args: str = Field(default="", max_length=500)


class SpotifyResolveRead(BaseModel):
    name: str


class FixRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    watch_id: int
    song: str
    spotify_url: str | None
    youtube_url: str | None
    error: str | None
    created_at: datetime
    watch_name: str | None = None


class FixUpdate(BaseModel):
    spotify_url: str | None = Field(default=None, max_length=500)
    youtube_url: str | None = Field(default=None, max_length=500)


class SpotifyArtistRead(BaseModel):
    id: str
    name: str
    url: str
    image: str | None = None
    followers: int | None = None


class DownloadLogRead(BaseModel):
    lines: list[str]
