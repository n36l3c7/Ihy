from pydantic import BaseModel, Field


class TrackTagsUpdate(BaseModel):
    """Tag fields to write. Omitted fields are untouched; null clears the tag."""

    title: str | None = Field(default=None, max_length=255)
    artists: list[str] | None = None
    album: str | None = Field(default=None, max_length=255)
    album_artist: str | None = Field(default=None, max_length=255)
    genres: list[str] | None = None
    year: int | None = Field(default=None, ge=0, le=9999)
    track_number: int | None = Field(default=None, ge=0, le=999)
    disc_number: int | None = Field(default=None, ge=0, le=999)


class BatchTagChanges(BaseModel):
    """Fields that make sense applied to many tracks at once."""

    artists: list[str] | None = None
    album: str | None = Field(default=None, max_length=255)
    album_artist: str | None = Field(default=None, max_length=255)
    genres: list[str] | None = None
    year: int | None = Field(default=None, ge=0, le=9999)


class BatchTagsRequest(BaseModel):
    track_ids: list[int] = Field(min_length=1, max_length=1000)
    changes: BatchTagChanges


class BatchTagsResult(BaseModel):
    updated: int
    errors: list[str]
