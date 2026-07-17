from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    path: str = Field(min_length=1, max_length=1024)


class SourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    path: str | None = Field(default=None, min_length=1, max_length=1024)
    enabled: bool | None = None


class SourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    path: str
    enabled: bool
    last_scanned_at: datetime | None
    created_at: datetime
    track_count: int = 0
