import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.library import Album, Artist, Track
from app.services.covers import invalidate_album_cover_cache
from app.services.scanner import _prune_orphans

logger = logging.getLogger(__name__)


def _delete_tracks(db: Session, tracks: list[Track]) -> tuple[int, list[str]]:
    """Delete tracks from disk and from the library. Files that cannot be
    removed are reported but do not block the library cleanup."""
    deleted_files = 0
    errors: list[str] = []
    album_ids = {track.album_id for track in tracks if track.album_id is not None}
    for track in tracks:
        path = Path(track.file_path)
        try:
            if path.is_file():
                path.unlink()
                deleted_files += 1
        except OSError as exc:
            errors.append(f"{track.file_path}: {exc}")
        db.delete(track)
    db.commit()
    _prune_orphans(db)
    db.commit()
    for album_id in album_ids:
        invalidate_album_cover_cache(album_id)
    return deleted_files, errors


def delete_track(db: Session, track: Track) -> tuple[int, list[str]]:
    return _delete_tracks(db, [track])


def delete_album(db: Session, album: Album) -> tuple[int, list[str]]:
    # Snapshot before deleting: pruning removes the album row and detaches it
    album_id = album.id
    tracks = list(album.tracks)
    deleted, errors = _delete_tracks(db, tracks)
    invalidate_album_cover_cache(album_id)
    return deleted, errors


def delete_artist(db: Session, artist: Artist) -> tuple[int, list[str]]:
    """Delete every track credited to the artist (collaborations included)."""
    return _delete_tracks(db, list(artist.tracks))
