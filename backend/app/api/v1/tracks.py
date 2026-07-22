from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.deps import AdminUserDep, CurrentUserDep, DbDep, MediaUserDep
from app.schemas.common import Page
from app.schemas.library import LibraryDeleteResult, TrackRead
from app.schemas.lyrics import LyricsRead
from app.schemas.tags import BatchTagsRequest, BatchTagsResult, TrackFileTags, TrackTagsUpdate
from app.services import catalog, library_editor, musicbrainz, tag_editor, transcoder, waveforms
from app.services import lyrics as lyrics_service
from app.services.catalog import TrackSort
from app.services.tag_editor import FileMissingError, UnsupportedFormatError

router = APIRouter()

MEDIA_TYPES = {
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
    "opus": "audio/ogg",
    "m4a": "audio/mp4",
}


@router.get("", response_model=Page[TrackRead])
def list_tracks(
    db: DbDep,
    user: CurrentUserDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    artist_id: int | None = None,
    album_id: int | None = None,
    genre_id: int | None = None,
    ids: Annotated[str | None, Query(max_length=10000)] = None,
    sort: TrackSort = "title",
    never_played: bool = False,
    limit: Annotated[int, Query(ge=1, le=1000)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    id_list: list[int] | None = None
    if ids is not None:
        try:
            id_list = [int(part) for part in ids.split(",") if part.strip()]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="ids must be integers"
            ) from None
    items, total = catalog.list_tracks(
        db,
        q=q,
        artist_id=artist_id,
        album_id=album_id,
        genre_id=genre_id,
        ids=id_list,
        sort=sort,
        limit=limit,
        offset=offset,
        never_played_for_user=user.id if never_played else None,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


class AutotagSuggestion(BaseModel):
    title: str
    artists: list[str]
    album: str | None
    year: int | None
    score: int
    release_id: str | None
    cover_url: str | None


@router.get("/{track_id}/autotag", response_model=list[AutotagSuggestion])
def autotag_suggestions(track_id: int, db: DbDep, _admin: AdminUserDep) -> list[dict]:
    """MusicBrainz tag suggestions for the track's current title/artist."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    artist = track.artists[0].name if track.artists else None
    try:
        return musicbrainz.search_recordings(track.title, artist)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="MusicBrainz not reachable"
        ) from None


class CoverFromReleaseRequest(BaseModel):
    release_id: str


@router.post("/{track_id}/autotag/cover", status_code=status.HTTP_204_NO_CONTENT)
def apply_autotag_cover(
    track_id: int, payload: CoverFromReleaseRequest, db: DbDep, _admin: AdminUserDep
) -> None:
    """Set the album cover from a MusicBrainz release (Cover Art Archive)."""
    track = catalog.get_track(db, track_id)
    if track is None or track.album is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Track or album not found"
        )
    try:
        data = musicbrainz.fetch_cover(payload.release_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No cover available for this release",
        ) from None
    try:
        tag_editor.save_album_cover(db, track.album, data)
    except tag_editor.InvalidImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from None


class WaveformRead(BaseModel):
    peaks: list[float]


@router.get("/{track_id}/waveform", response_model=WaveformRead)
def track_waveform(track_id: int, db: DbDep, _user: CurrentUserDep) -> WaveformRead:
    """Normalized waveform peaks for the seekbar (cached, needs ffmpeg)."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    peaks = waveforms.get_or_create_waveform(track)
    if peaks is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Waveform unavailable"
        )
    return WaveformRead(peaks=peaks)


@router.get("/{track_id}/radio", response_model=list[TrackRead])
def track_radio(
    track_id: int,
    db: DbDep,
    _user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    exclude: Annotated[str | None, Query(max_length=10000)] = None,
) -> list:
    """Random tracks similar to this one, for autoplay when the queue ends."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    exclude_ids: set[int] = set()
    if exclude:
        try:
            exclude_ids = {int(part) for part in exclude.split(",") if part.strip()}
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="exclude must be integers"
            ) from None
    return catalog.radio_tracks(db, track, limit=limit, exclude_ids=exclude_ids)


@router.post("/tags/batch", response_model=BatchTagsResult)
def batch_edit_tags(payload: BatchTagsRequest, db: DbDep, _admin: AdminUserDep) -> BatchTagsResult:
    """Apply the same tag changes to many tracks. Errors are reported per file."""
    changes = payload.changes.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided"
        )
    tracks: list = []
    errors: list[str] = []
    for track_id in payload.track_ids:
        track = catalog.get_track(db, track_id)
        if track is None:
            errors.append(f"Track {track_id} not found")
        else:
            tracks.append(track)
    updated, tag_errors = tag_editor.batch_update_tags(db, tracks, changes)
    return BatchTagsResult(updated=updated, errors=errors + tag_errors)


@router.get("/{track_id}/tags/file", response_model=TrackFileTags)
def read_file_tags(track_id: int, db: DbDep, _admin: AdminUserDep) -> TrackFileTags:
    """All tag fields as currently stored in the audio file."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    if not Path(track.file_path).is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not available"
        )
    tags = tag_editor.read_full_tags(Path(track.file_path))
    if tags is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unreadable audio file"
        )
    return TrackFileTags(**tags)


@router.patch("/{track_id}/tags", response_model=TrackRead)
def edit_track_tags(
    track_id: int, payload: TrackTagsUpdate, db: DbDep, _admin: AdminUserDep
):
    """Write tags to the audio file, then sync the library record from disk."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided"
        )
    try:
        return tag_editor.update_track_tags(db, track, changes)
    except FileMissingError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except UnsupportedFormatError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None


@router.delete("/{track_id}", response_model=LibraryDeleteResult)
def delete_track(track_id: int, db: DbDep, _admin: AdminUserDep) -> LibraryDeleteResult:
    """Remove the track from the platform: the audio file is deleted from disk."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    deleted, errors = library_editor.delete_track(db, track)
    return LibraryDeleteResult(deleted_files=deleted, errors=errors)


@router.get("/{track_id}", response_model=TrackRead)
def read_track(track_id: int, db: DbDep, _user: CurrentUserDep):
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    return track


@router.get("/{track_id}/lyrics", response_model=LyricsRead)
def track_lyrics(
    track_id: int, db: DbDep, _user: CurrentUserDep, refresh: bool = False
):
    """Lyrics for a track: embedded tag first, then lrclib.net, cached in the database."""
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    return lyrics_service.get_or_fetch(db, track, refresh=refresh)


@router.get("/{track_id}/stream")
def stream_track(
    track_id: int,
    db: DbDep,
    _user: MediaUserDep,
    format: Annotated[str | None, Query(pattern="^(opus)$")] = None,
    bitrate: Annotated[int | None, Query(ge=32, le=320)] = None,
) -> FileResponse:
    """Serve the audio file. Range requests (seeking) are supported.

    With format=opus&bitrate=N the file is transcoded once with ffmpeg and
    served from the on-disk cache (bandwidth saver for remote listening).
    """
    track = catalog.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    if format == "opus":
        try:
            cached = transcoder.transcoded_path(track, bitrate or 128)
        except transcoder.TranscodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
            ) from None
        return FileResponse(cached, media_type="audio/ogg")
    path = Path(track.file_path)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not available"
        )
    return FileResponse(
        path, media_type=MEDIA_TYPES.get(track.format, "application/octet-stream")
    )
