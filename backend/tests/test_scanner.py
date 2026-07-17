from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Album, Artist, Genre, Source, Track
from app.services.scanner import scan_library
from tests.utils import FakeReader, make_info, write_audio_file


@pytest.fixture
def source(tmp_path: Path, db_session: Session) -> Source:
    src = Source(name="test library", path=str(tmp_path))
    db_session.add(src)
    db_session.commit()
    return src


def test_initial_scan_populates_library(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    first = write_audio_file(tmp_path, "album/01 - one.mp3")
    second = write_audio_file(tmp_path, "album/02 - two.mp3")
    reader.add(first, make_info(title="One", track_number=1))
    reader.add(second, make_info(title="Two", track_number=2))

    result = scan_library(db_session, reader)

    assert result.added == 2
    assert result.errors == 0
    tracks = list(db_session.scalars(select(Track).order_by(Track.track_number)))
    assert [t.title for t in tracks] == ["One", "Two"]
    assert db_session.query(Artist).count() == 1
    assert db_session.query(Album).count() == 1
    assert db_session.query(Genre).count() == 1
    assert tracks[0].album is tracks[1].album
    assert tracks[0].album.artist.name == "Artist"
    assert [g.name for g in tracks[0].genres] == ["Rock"]
    db_session.refresh(source)
    assert source.last_scanned_at is not None


def test_title_falls_back_to_filename(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "untitled_song.mp3")
    reader.add(path, make_info(title=None, artists=[], album=None, genres=[]))

    scan_library(db_session, reader)

    track = db_session.scalar(select(Track))
    assert track.title == "untitled_song"
    assert track.artists == []
    assert track.album is None


def test_album_cover_file_detected(tmp_path: Path, db_session: Session, source: Source) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "album/song.mp3")
    (tmp_path / "album" / "cover.jpg").write_bytes(b"jpeg")
    reader.add(path, make_info())

    scan_library(db_session, reader)

    album = db_session.scalar(select(Album))
    assert album.cover_path is not None
    assert album.cover_path.endswith("cover.jpg")


def test_rescan_skips_unchanged_files(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "song.mp3")
    reader.add(path, make_info())
    scan_library(db_session, reader)

    result = scan_library(db_session, reader)

    assert result.added == 0
    assert result.unchanged == 1


def test_modified_file_is_updated(tmp_path: Path, db_session: Session, source: Source) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "song.mp3")
    reader.add(path, make_info(title="Old Title"))
    scan_library(db_session, reader)

    # Longer content changes the size, which guarantees change detection
    write_audio_file(tmp_path, "song.mp3", content=b"fake audio with new tags")
    reader.add(path, make_info(title="New Title"))
    result = scan_library(db_session, reader)

    assert result.updated == 1
    assert result.added == 0
    track = db_session.scalar(select(Track))
    assert track.title == "New Title"


def test_deleted_file_removed_and_orphans_pruned(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    keep = write_audio_file(tmp_path, "keep.mp3")
    gone = write_audio_file(tmp_path, "gone.mp3")
    reader.add(keep, make_info(title="Keep"))
    reader.add(gone, make_info(title="Gone"))
    scan_library(db_session, reader)

    gone.unlink()
    result = scan_library(db_session, reader)
    assert result.removed == 1
    # Shared album/artist/genre still referenced by the remaining track
    assert db_session.query(Album).count() == 1

    keep.unlink()
    result = scan_library(db_session, reader)
    assert result.removed == 1
    assert db_session.query(Track).count() == 0
    assert db_session.query(Album).count() == 0
    assert db_session.query(Artist).count() == 0
    assert db_session.query(Genre).count() == 0


def test_multi_artist_tag_split_on_separator(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "duet.mp3")
    reader.add(path, make_info(title="Duet", artists=["ACDC/Kiss"]))

    scan_library(db_session, reader)  # default separators include "/"

    track = db_session.scalar(select(Track))
    assert sorted(a.name for a in track.artists) == ["ACDC", "Kiss"]
    for name in ("ACDC", "Kiss"):
        artist = db_session.scalar(select(Artist).where(Artist.name == name))
        assert artist is not None
        assert [t.title for t in artist.tracks] == ["Duet"]


def test_custom_separators_respected(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "singleartist.mp3")
    reader.add(path, make_info(title="Single", artists=["AC/DC"], genres=["Rock; Pop"]))

    # With only ";" configured, "AC/DC" must remain a single artist
    scan_library(db_session, reader, separators=[";"])

    track = db_session.scalar(select(Track))
    assert [a.name for a in track.artists] == ["AC/DC"]
    assert sorted(g.name for g in track.genres) == ["Pop", "Rock"]


def test_genre_tag_split_on_separator(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "mixed.mp3")
    reader.add(path, make_info(genres=["Rock/Pop"]))

    scan_library(db_session, reader)

    track = db_session.scalar(select(Track))
    assert sorted(g.name for g in track.genres) == ["Pop", "Rock"]


def test_unreadable_file_counts_as_error(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    write_audio_file(tmp_path, "corrupted.mp3")  # not registered in the reader

    result = scan_library(db_session, reader)

    assert result.errors == 1
    assert db_session.query(Track).count() == 0


def test_disabled_source_is_not_scanned(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "song.mp3")
    reader.add(path, make_info())
    source.enabled = False
    db_session.commit()

    result = scan_library(db_session, reader)

    assert result.added == 0
    assert db_session.query(Track).count() == 0


def test_unavailable_source_path_keeps_tracks(
    tmp_path: Path, db_session: Session, source: Source
) -> None:
    reader = FakeReader()
    path = write_audio_file(tmp_path, "song.mp3")
    reader.add(path, make_info())
    scan_library(db_session, reader)
    assert db_session.query(Track).count() == 1

    # Simulate an unmounted remote share: path no longer exists
    source.path = str(tmp_path / "unmounted")
    db_session.commit()
    result = scan_library(db_session, reader)

    assert result.removed == 0
    assert db_session.query(Track).count() == 1
