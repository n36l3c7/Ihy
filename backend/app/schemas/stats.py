from pydantic import BaseModel

from app.schemas.library import TrackRead


class TopTrack(BaseModel):
    track: TrackRead
    plays: int


class TopArtist(BaseModel):
    id: int
    name: str
    plays: int


class TopAlbum(BaseModel):
    id: int
    title: str
    plays: int


class DayActivity(BaseModel):
    day: str
    plays: int


class StatsRead(BaseModel):
    total_plays: int
    distinct_tracks: int
    total_seconds: float
    top_tracks: list[TopTrack]
    top_artists: list[TopArtist]
    top_albums: list[TopAlbum]
    plays_by_day: list[DayActivity]
