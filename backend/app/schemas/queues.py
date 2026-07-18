from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.library import TrackRead


class QueueSave(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    track_ids: list[int] = Field(min_length=1, max_length=1000)
    current_index: int = Field(default=0, ge=0)
    current_seconds: float = Field(default=0.0, ge=0)


class QueueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    track_ids: list[int] | None = Field(default=None, min_length=1, max_length=1000)
    current_index: int | None = Field(default=None, ge=0)
    current_seconds: float | None = Field(default=None, ge=0)


class QueueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    current_index: int
    updated_at: datetime
    track_count: int = 0


class QueueDetail(BaseModel):
    id: int
    name: str
    current_index: int
    current_seconds: float
    tracks: list[TrackRead]
