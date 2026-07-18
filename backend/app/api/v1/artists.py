from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import AdminUserDep, CurrentUserDep, DbDep, MediaUserDep
from app.models.library import Album, Artist
from app.schemas.common import Page
from app.schemas.library import AlbumRead, ArtistDetail, ArtistRead, LibraryDeleteResult
from app.services import artist_images, catalog, library_editor
from app.services.tag_editor import InvalidImageError

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


@router.get("/{artist_id}/image")
def artist_image(artist_id: int, db: DbDep, _user: MediaUserDep) -> FileResponse:
    """Artist picture: manual upload first, otherwise fetched once from Deezer."""
    artist = catalog.get_artist(db, artist_id)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    image = artist_images.resolve_artist_image(artist)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No image available")
    media_type = "image/png" if image.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(image, media_type=media_type)


@router.put("/{artist_id}/image", status_code=status.HTTP_204_NO_CONTENT)
def upload_artist_image(
    artist_id: int, file: UploadFile, db: DbDep, _admin: AdminUserDep
) -> None:
    artist = catalog.get_artist(db, artist_id)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    try:
        artist_images.save_artist_image(artist, file.file.read())
    except InvalidImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None


@router.delete("/{artist_id}", response_model=LibraryDeleteResult)
def delete_artist(artist_id: int, db: DbDep, _admin: AdminUserDep) -> LibraryDeleteResult:
    """Remove every track credited to the artist (collaborations included):
    the audio files are deleted from disk."""
    artist = catalog.get_artist(db, artist_id)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    deleted, errors = library_editor.delete_artist(db, artist)
    return LibraryDeleteResult(deleted_files=deleted, errors=errors)


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
