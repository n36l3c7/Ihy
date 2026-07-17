from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.library import TrackRead


class PlayCreate(BaseModel):
    track_id: int


class PlayHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    played_at: datetime
    track: TrackRead
