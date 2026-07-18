from pydantic import BaseModel, Field


class TrackTagsUpdate(BaseModel):
    """Tag fields to write. Omitted fields are untouched; null clears the tag."""

    title: str | None = Field(default=None, max_length=255)
    artists: list[str] | None = None
    album: str | None = Field(default=None, max_length=255)
    album_artist: str | None = Field(default=None, max_length=255)
    genres: list[str] | None = None
    year: int | None = Field(default=None, ge=0, le=9999)
    date: str | None = Field(default=None, max_length=20)  # raw date, overrides year
    track_number: int | None = Field(default=None, ge=0, le=999)
    disc_number: int | None = Field(default=None, ge=0, le=999)
    composer: str | None = Field(default=None, max_length=255)
    comment: str | None = Field(default=None, max_length=1000)
    copyright: str | None = Field(default=None, max_length=255)
    isrc: str | None = Field(default=None, max_length=50)
    bpm: str | None = Field(default=None, max_length=10)
    conductor: str | None = Field(default=None, max_length=255)
    language: str | None = Field(default=None, max_length=50)
    publisher: str | None = Field(default=None, max_length=255)
    lyricist: str | None = Field(default=None, max_length=255)
    website: str | None = Field(default=None, max_length=500)


class TrackFileTags(BaseModel):
    """Raw tag values as stored in the audio file."""

    artists: list[str] = []
    genres: list[str] = []
    title: str | None = None
    album: str | None = None
    album_artist: str | None = None
    date: str | None = None
    track_number: str | None = None
    disc_number: str | None = None
    composer: str | None = None
    comment: str | None = None
    copyright: str | None = None
    isrc: str | None = None
    bpm: str | None = None
    conductor: str | None = None
    language: str | None = None
    publisher: str | None = None
    lyricist: str | None = None
    website: str | None = None


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
