import logging
import os
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete, exists, select
from sqlalchemy.orm import Session

from app.models.library import Album, Artist, Genre, Source, Track, track_artists, track_genres
from app.services import app_settings
from app.services.artist_images import invalidate_artist_image_cache
from app.services.covers import invalidate_album_cover_cache
from app.services.tag_reader import SUPPORTED_EXTENSIONS, AudioFileInfo, read_audio_file

logger = logging.getLogger(__name__)

COVER_FILENAMES = {"cover.jpg", "cover.jpeg", "cover.png", "folder.jpg", "folder.png", "front.jpg"}
COMMIT_BATCH_SIZE = 200

TagReader = Callable[[Path], AudioFileInfo | None]


@dataclass
class ScanResult:
    added: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    errors: int = 0


class _EntityCache:
    """Get-or-create cache for artists, albums and genres within a single scan."""

    def __init__(self, db: Session):
        self.db = db
        self.artists: dict[str, Artist] = {}
        self.albums: dict[tuple[str, int | None], Album] = {}
        self.genres: dict[str, Genre] = {}

    def artist(self, name: str | None) -> Artist | None:
        if name is None or not name.strip():
            return None
        key = name.strip()
        if key not in self.artists:
            found = self.db.scalar(select(Artist).where(Artist.name == key))
            if found is None:
                found = Artist(name=key)
                self.db.add(found)
                self.db.flush()
                # New artist may reuse the id of a deleted one
                invalidate_artist_image_cache(found.id)
            self.artists[key] = found
        return self.artists[key]

    def album(
        self, title: str | None, artist: Artist | None, year: int | None, directory: Path
    ) -> Album | None:
        if title is None or not title.strip():
            return None
        artist_id = artist.id if artist is not None else None
        key = (title.strip(), artist_id)
        if key not in self.albums:
            stmt = select(Album).where(Album.title == key[0])
            stmt = (
                stmt.where(Album.artist_id == artist_id)
                if artist_id is not None
                else stmt.where(Album.artist_id.is_(None))
            )
            found = self.db.scalar(stmt)
            if found is None:
                found = Album(
                    title=key[0], artist_id=artist_id, year=year, cover_path=_find_cover(directory)
                )
                self.db.add(found)
                self.db.flush()
                # A brand-new album may reuse the id of a deleted one;
                # drop any stale cached cover for that id
                invalidate_album_cover_cache(found.id)
            self.albums[key] = found
        return self.albums[key]

    def genre(self, name: str) -> Genre | None:
        key = name.strip()
        if not key:
            return None
        if key not in self.genres:
            found = self.db.scalar(select(Genre).where(Genre.name == key))
            if found is None:
                found = Genre(name=key)
                self.db.add(found)
                self.db.flush()
            self.genres[key] = found
        return self.genres[key]


def _find_cover(directory: Path) -> str | None:
    try:
        for entry in directory.iterdir():
            if entry.is_file() and entry.name.lower() in COVER_FILENAMES:
                return str(entry)
    except OSError:
        return None
    return None


def split_tag_values(values: list[str], separators: list[str]) -> list[str]:
    """Split raw tag values on every configured separator, deduplicated in order.

    Example: ["ACDC/Kiss"] with separators ["/"] -> ["ACDC", "Kiss"].
    """
    parts = list(values)
    for separator in separators:
        parts = [piece for part in parts for piece in part.split(separator)]
    result: list[str] = []
    seen: set[str] = set()
    for part in parts:
        cleaned = part.strip()
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            result.append(cleaned)
    return result


def scan_library(
    db: Session,
    read_tags: TagReader = read_audio_file,
    separators: list[str] | None = None,
    full: bool = False,
) -> ScanResult:
    """Scan every enabled source, then prune entities left without tracks.

    With full=True, unchanged files are re-read too — required after
    changing metadata separators, which alter how existing tags are split.
    """
    if separators is None:
        separators = app_settings.get_metadata_separators(db)
    result = ScanResult()
    sources = list(db.scalars(select(Source).where(Source.enabled.is_(True))))
    for source in sources:
        _scan_source(db, source, read_tags, result, separators, full)
    _prune_orphans(db)
    db.commit()
    return result


def _scan_source(
    db: Session,
    source: Source,
    read_tags: TagReader,
    result: ScanResult,
    separators: list[str],
    full: bool,
) -> None:
    root = Path(source.path)
    if not root.is_dir():
        # An unavailable path (e.g. unmounted remote share) must not wipe
        # its tracks from the library; skip it entirely.
        logger.warning("Source path unavailable, skipping: %s", source.path)
        return

    cache = _EntityCache(db)
    existing = {
        track.file_path: track
        for track in db.scalars(select(Track).where(Track.source_id == source.id))
    }
    seen: set[str] = set()
    pending = 0

    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        file_path = str(path)
        seen.add(file_path)
        try:
            stat = path.stat()
        except OSError:
            result.errors += 1
            continue

        track = existing.get(file_path)
        if (
            not full
            and track is not None
            and track.file_mtime == stat.st_mtime
            and track.file_size == stat.st_size
        ):
            result.unchanged += 1
            continue

        info = read_tags(path)
        if info is None:
            logger.warning("Unreadable audio file: %s", file_path)
            result.errors += 1
            continue

        if track is None:
            track = Track(source_id=source.id, file_path=file_path)
            db.add(track)
            result.added += 1
        else:
            result.updated += 1
        _apply_info(cache, track, info, stat, path, separators)

        pending += 1
        if pending % COMMIT_BATCH_SIZE == 0:
            db.commit()

    for file_path, track in existing.items():
        if file_path not in seen:
            db.delete(track)
            result.removed += 1

    source.last_scanned_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()


def _apply_info(
    cache: _EntityCache,
    track: Track,
    info: AudioFileInfo,
    stat: os.stat_result,
    path: Path,
    separators: list[str],
) -> None:
    # Scalar fields first: entity lookups below may flush the session,
    # and a new track must already satisfy its NOT NULL constraints.
    track.file_size = stat.st_size
    track.file_mtime = stat.st_mtime
    track.format = info.format
    track.duration = info.duration
    track.bitrate = info.bitrate
    track.sample_rate = info.sample_rate
    track.title = info.title or path.stem
    track.track_number = info.track_number
    track.disc_number = info.disc_number
    track.year = info.year
    track.has_embedded_cover = info.has_embedded_cover
    if info.replay_gain is not None:
        track.replay_gain = info.replay_gain

    artist_names = split_tag_values(info.artists, separators)
    artists = [a for a in (cache.artist(name) for name in artist_names) if a is not None]
    album_artist_names = split_tag_values(info.album_artists, separators)
    album_artist = (
        cache.artist(album_artist_names[0])
        if album_artist_names
        else (artists[0] if artists else None)
    )
    track.artists = artists
    track.album = cache.album(info.album, album_artist, info.year, path.parent)
    genre_names = split_tag_values(info.genres, separators)
    track.genres = [
        genre for genre in (cache.genre(name) for name in genre_names) if genre is not None
    ]


def _prune_orphans(db: Session) -> None:
    """Delete albums, artists and genres that no longer have any tracks."""
    orphan_album_ids = list(
        db.scalars(select(Album.id).where(~exists().where(Track.album_id == Album.id)))
    )
    for album_id in orphan_album_ids:
        invalidate_album_cover_cache(album_id)
    db.execute(delete(Album).where(~exists().where(Track.album_id == Album.id)))
    orphan_artist_ids = list(
        db.scalars(
            select(Artist.id).where(
                ~exists().where(track_artists.c.artist_id == Artist.id),
                ~exists().where(Album.artist_id == Artist.id),
            )
        )
    )
    for artist_id in orphan_artist_ids:
        invalidate_artist_image_cache(artist_id)
    db.execute(
        delete(Artist).where(
            ~exists().where(track_artists.c.artist_id == Artist.id),
            ~exists().where(Album.artist_id == Artist.id),
        )
    )
    db.execute(delete(Genre).where(~exists().where(track_genres.c.genre_id == Genre.id)))
