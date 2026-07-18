from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.library import TrackRead


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class PlaylistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class PlaylistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    track_count: int = 0


class PlaylistItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    added_at: datetime
    track: TrackRead


class PlaylistDetail(PlaylistRead):
    items: list[PlaylistItemRead] = []


class PlaylistItemCreate(BaseModel):
    track_id: int


class PlaylistOrderUpdate(BaseModel):
    """The complete list of item ids in the desired order."""

    item_ids: list[int] = Field(min_length=1)
