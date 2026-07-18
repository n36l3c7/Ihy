from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LyricsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content: str | None
    synced_content: str | None
    source: str | None
    fetched_at: datetime
