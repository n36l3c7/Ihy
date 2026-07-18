from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.library import Album, Artist, Track
from app.services.covers import invalidate_album_cover_cache

TRACKS_URL = "/api/v1/tracks"
ALBUMS_URL = "/api/v1/albums"
ARTISTS_URL = "/api/v1/artists"


def test_delete_requires_admin(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    assert (
        client.delete(
            f"{TRACKS_URL}/{seeded_library.tracks[0].id}", headers=user_headers
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"{ALBUMS_URL}/{seeded_library.album_one.id}", headers=user_headers
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"{ARTISTS_URL}/{seeded_library.alpha.id}", headers=user_headers
        ).status_code
        == 403
    )


def test_delete_track_removes_file_and_row(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    db_session: Session,
) -> None:
    track = seeded_library.tracks[0]
    file_path = Path(track.file_path)
    assert file_path.exists()

    response = client.delete(f"{TRACKS_URL}/{track.id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json() == {"deleted_files": 1, "errors": []}
    assert not file_path.exists()
    db_session.expire_all()
    assert db_session.get(Track, track.id) is None
    # Album still has the second track
    assert db_session.get(Album, seeded_library.album_one.id) is not None


def test_delete_album_removes_all_tracks_and_prunes(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    db_session: Session,
) -> None:
    album_id = seeded_library.album_one.id
    alpha_id = seeded_library.alpha.id
    paths = [Path(track.file_path) for track in seeded_library.album_one.tracks]

    response = client.delete(f"{ALBUMS_URL}/{album_id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["deleted_files"] == 2
    assert all(not path.exists() for path in paths)
    db_session.expire_all()
    assert db_session.get(Album, album_id) is None
    # Alpha Band had only this album -> pruned as well
    assert db_session.get(Artist, alpha_id) is None


def test_delete_artist_removes_credited_tracks(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    db_session: Session,
) -> None:
    artist_id = seeded_library.beta.id

    response = client.delete(f"{ARTISTS_URL}/{artist_id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["deleted_files"] == 1
    db_session.expire_all()
    assert db_session.get(Artist, artist_id) is None
    remaining = [t.title for t in db_session.scalars(select(Track))]
    assert sorted(remaining) == ["Mountain Song", "Ocean Song"]


def test_delete_missing_entities_404(client: TestClient, admin_headers: dict[str, str]) -> None:
    assert client.delete(f"{TRACKS_URL}/999", headers=admin_headers).status_code == 404
    assert client.delete(f"{ALBUMS_URL}/999", headers=admin_headers).status_code == 404
    assert client.delete(f"{ARTISTS_URL}/999", headers=admin_headers).status_code == 404


def test_invalidate_album_cover_cache(tmp_path: Path) -> None:
    covers_dir = tmp_path / "covers"
    covers_dir.mkdir()
    stale = covers_dir / "album_7.jpg"
    stale.write_bytes(b"old image")

    invalidate_album_cover_cache(7, covers_dir=covers_dir)
    assert not stale.exists()
    # Idempotent on missing files
    invalidate_album_cover_cache(7, covers_dir=covers_dir)
