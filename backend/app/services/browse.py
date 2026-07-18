from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.library import Source, Track


class InvalidBrowsePathError(Exception):
    pass


def browse_folder(db: Session, source: Source, relative_path: str) -> tuple[list[str], list[Track]]:
    """Subfolders and tracks directly inside one folder of a source.
    The path is confined to the source root — traversal attempts fail."""
    base = Path(source.path).resolve()
    target = (base / relative_path).resolve() if relative_path else base
    if target != base and base not in target.parents:
        raise InvalidBrowsePathError("Path escapes the source folder")
    if not target.is_dir():
        raise InvalidBrowsePathError("Not a folder")

    try:
        folders = sorted(
            (entry.name for entry in target.iterdir() if entry.is_dir()), key=str.lower
        )
    except OSError:
        folders = []

    prefix = str(target)
    candidates = db.scalars(
        select(Track)
        .where(Track.source_id == source.id, Track.file_path.like(prefix + "%"))
        .options(
            selectinload(Track.artists),
            selectinload(Track.album),
            selectinload(Track.genres),
        )
    )
    tracks = [
        track for track in candidates if str(Path(track.file_path).parent) == prefix
    ]
    tracks.sort(key=lambda track: (track.disc_number or 0, track.track_number or 0, track.title))
    return folders, tracks
