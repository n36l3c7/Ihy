from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUserDep, DbDep, MediaUserDep
from app.models.library import Album
from app.schemas.common import Page
from app.schemas.library import AlbumDetail, AlbumRead
from app.services import catalog, covers

router = APIRouter()


def _album_read(album: Album, track_count: int) -> AlbumRead:
    data = AlbumRead.model_validate(album)
    data.track_count = track_count
    return data


@router.get("", response_model=Page[AlbumRead])
def list_albums(
    db: DbDep,
    _user: CurrentUserDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    artist_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    rows, total = catalog.list_albums(db, q=q, artist_id=artist_id, limit=limit, offset=offset)
    return {
        "items": [_album_read(album, count) for album, count in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{album_id}", response_model=AlbumDetail)
def read_album(album_id: int, db: DbDep, _user: CurrentUserDep) -> AlbumDetail:
    album = catalog.get_album(db, album_id)
    if album is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    detail = AlbumDetail.model_validate(album)
    detail.track_count = len(album.tracks)
    return detail


@router.get("/{album_id}/cover")
def album_cover(album_id: int, db: DbDep, _user: MediaUserDep) -> FileResponse:
    album = catalog.get_album(db, album_id)
    if album is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    cover = covers.resolve_album_cover(db, album)
    if cover is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No cover available")
    media_type = "image/png" if cover.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(cover, media_type=media_type)
