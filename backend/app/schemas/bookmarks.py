from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.library import TrackRead


class BookmarkCreate(BaseModel):
    track_id: int
    seconds: float = Field(ge=0)
    note: str | None = Field(default=None, max_length=255)


class BookmarkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    seconds: float
    note: str | None
    created_at: datetime
    track: TrackRead
