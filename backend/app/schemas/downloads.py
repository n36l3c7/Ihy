from datetime import datetime

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
