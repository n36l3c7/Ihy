from pydantic import BaseModel, ConfigDict


class ArtistBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class AlbumBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str


class GenreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class GenreWithCount(GenreRead):
    track_count: int = 0


class TrackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    duration: float
    format: str
    bitrate: int | None
    sample_rate: int | None
    track_number: int | None
    disc_number: int | None
    year: int | None
    artist: ArtistBrief | None
    album: AlbumBrief | None
    genres: list[GenreRead]


class AlbumRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    year: int | None
    artist: ArtistBrief | None
    track_count: int = 0


class AlbumDetail(AlbumRead):
    tracks: list[TrackRead] = []


class ArtistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    album_count: int = 0
    track_count: int = 0


class ArtistDetail(ArtistRead):
    albums: list[AlbumRead] = []
