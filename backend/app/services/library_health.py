"""Library hygiene: duplicate detection and broken-file reporting."""

from collections import defaultdict
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.library import Source, Track
from app.services import library_editor


def _track_query():
    return select(Track).options(
        selectinload(Track.artists),
        selectinload(Track.album),
        selectinload(Track.genres),
    )


def find_duplicates(db: Session) -> list[list[Track]]:
    """Groups of tracks sharing the same normalized title and artists.

    The same song ripped twice (e.g. MP3 + FLAC, or single + album copy)
    shows up as one group; the caller decides which copies to delete.
    """
    tracks = list(db.scalars(_track_query()))
    groups: dict[tuple, list[Track]] = defaultdict(list)
    for track in tracks:
        artists = tuple(sorted(artist.name.lower() for artist in track.artists))
        key = (track.title.strip().lower(), artists)
        groups[key].append(track)
    duplicates = [group for group in groups.values() if len(group) > 1]
    duplicates.sort(key=lambda group: group[0].title.lower())
    for group in duplicates:
        # Best copy first: highest bitrate, then largest file
        group.sort(key=lambda track: (-(track.bitrate or 0), -track.file_size))
    return duplicates


def find_broken(db: Session) -> tuple[list[Track], list[Source]]:
    """Tracks whose file no longer exists on disk.

    Sources whose root folder is unreachable (e.g. an unmounted share) are
    reported separately instead of flagging all their tracks as broken.
    """
    offline_sources: list[Source] = []
    online_ids: list[int] = []
    for source in db.scalars(select(Source)):
        if Path(source.path).is_dir():
            online_ids.append(source.id)
        else:
            offline_sources.append(source)
    broken = [
        track
        for track in db.scalars(_track_query().where(Track.source_id.in_(online_ids)))
        if not Path(track.file_path).is_file()
    ]
    return broken, offline_sources


def cleanup_broken(db: Session) -> int:
    """Remove library entries for files that are gone from disk."""
    broken, _offline = find_broken(db)
    if not broken:
        return 0
    library_editor._delete_tracks(db, broken)  # files are already gone
    return len(broken)
