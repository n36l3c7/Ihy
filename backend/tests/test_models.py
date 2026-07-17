import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Album,
    Artist,
    Favorite,
    Genre,
    Playlist,
    PlaylistItem,
    Source,
    Track,
    User,
    UserRole,
)


def make_track(source: Source, path: str, title: str, **kwargs) -> Track:
    return Track(
        source=source,
        file_path=path,
        file_size=1024,
        file_mtime=0.0,
        format="mp3",
        duration=180.0,
        title=title,
        **kwargs,
    )


def test_track_with_full_relations(db_session: Session) -> None:
    source = Source(name="Main library", path="/music")
    artist = Artist(name="Radiohead")
    album = Album(title="OK Computer", artist=artist, year=1997)
    genre = Genre(name="Alternative Rock")
    track = make_track(source, "/music/ok/karma_police.mp3", "Karma Police")
    track.artist = artist
    track.album = album
    track.genres.append(genre)

    db_session.add(track)
    db_session.commit()

    saved = db_session.get(Track, track.id)
    assert saved is not None
    assert saved.artist.name == "Radiohead"
    assert saved.album.title == "OK Computer"
    assert saved.album.artist is artist
    assert [g.name for g in saved.genres] == ["Alternative Rock"]
    assert saved.source.path == "/music"
    assert saved.created_at is not None


def test_username_must_be_unique(db_session: Session) -> None:
    db_session.add(User(username="sam", password_hash="x"))
    db_session.commit()
    db_session.add(User(username="sam", password_hash="y"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_user_defaults(db_session: Session) -> None:
    user = User(username="sam", password_hash="x")
    db_session.add(user)
    db_session.commit()
    assert user.role == UserRole.USER
    assert user.is_active is True


def test_playlist_items_ordered_by_position(db_session: Session) -> None:
    user = User(username="sam", password_hash="x")
    source = Source(name="lib", path="/music")
    first = make_track(source, "/music/a.mp3", "A")
    second = make_track(source, "/music/b.mp3", "B")
    playlist = Playlist(owner=user, name="Roadtrip")
    # Insert out of order on purpose: the relationship must sort by position.
    playlist.items.append(PlaylistItem(track=second, position=2))
    playlist.items.append(PlaylistItem(track=first, position=1))

    db_session.add(playlist)
    db_session.commit()
    db_session.expire_all()

    titles = [item.track.title for item in playlist.items]
    assert titles == ["A", "B"]


def test_duplicate_favorite_rejected(db_session: Session) -> None:
    user = User(username="sam", password_hash="x")
    source = Source(name="lib", path="/music")
    track = make_track(source, "/music/a.mp3", "A")
    db_session.add_all([user, track])
    db_session.commit()

    db_session.add(Favorite(user_id=user.id, track_id=track.id))
    db_session.commit()
    db_session.add(Favorite(user_id=user.id, track_id=track.id))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_deleting_user_cascades_personal_data(db_session: Session) -> None:
    user = User(username="sam", password_hash="x")
    source = Source(name="lib", path="/music")
    track = make_track(source, "/music/a.mp3", "A")
    playlist = Playlist(owner=user, name="Mine")
    playlist.items.append(PlaylistItem(track=track, position=1))
    db_session.add_all([playlist, track])
    db_session.commit()
    db_session.add(Favorite(user_id=user.id, track_id=track.id))
    db_session.commit()

    db_session.delete(user)
    db_session.commit()

    assert db_session.query(Playlist).count() == 0
    assert db_session.query(PlaylistItem).count() == 0
    assert db_session.query(Favorite).count() == 0
    # The shared library is untouched
    assert db_session.query(Track).count() == 1


def test_deleting_source_cascades_tracks(db_session: Session) -> None:
    source = Source(name="lib", path="/music")
    db_session.add(make_track(source, "/music/a.mp3", "A"))
    db_session.commit()

    db_session.delete(source)
    db_session.commit()

    assert db_session.query(Track).count() == 0
