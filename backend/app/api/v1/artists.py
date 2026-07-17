from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUserDep, DbDep
from app.models.library import Album, Artist
from app.schemas.common import Page
from app.schemas.library import AlbumRead, ArtistDetail, ArtistRead
from app.services import catalog

router = APIRouter()


def _artist_read(artist: Artist, album_count: int, track_count: int) -> ArtistRead:
    data = ArtistRead.model_validate(artist)
    data.album_count = album_count
    data.track_count = track_count
    return data


def _album_read(album: Album, track_count: int) -> AlbumRead:
    data = AlbumRead.model_validate(album)
    data.track_count = track_count
    return data


@router.get("", response_model=Page[ArtistRead])
def list_artists(
    db: DbDep,
    _user: CurrentUserDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    rows, total = catalog.list_artists(db, q=q, limit=limit, offset=offset)
    return {
        "items": [_artist_read(artist, albums, tracks) for artist, albums, tracks in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{artist_id}", response_model=ArtistDetail)
def read_artist(artist_id: int, db: DbDep, _user: CurrentUserDep) -> ArtistDetail:
    artist = catalog.get_artist(db, artist_id)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    albums, _total = catalog.list_albums(db, artist_id=artist_id, limit=None)
    track_count = sum(count for _album, count in albums)
    detail = ArtistDetail.model_validate(artist)
    detail.album_count = len(albums)
    detail.track_count = track_count
    detail.albums = [_album_read(album, count) for album, count in albums]
    return detail
