import io
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.library import Album, Genre
from app.services.tag_editor import InvalidImageError, save_album_cover
from tests.utils import make_info

TRACKS_URL = "/api/v1/tracks"


@pytest.fixture
def fake_tag_io(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """Record tag writes and serve configurable re-reads, no real audio needed."""
    state = SimpleNamespace(writes=[], reads={})

    def fake_write(path: Path, changes: dict) -> None:
        state.writes.append((str(path), changes))

    def fake_read(path: Path):
        return state.reads.get(str(path))

    monkeypatch.setattr("app.services.tag_editor.write_tags_to_file", fake_write)
    monkeypatch.setattr("app.services.tag_reader.read_audio_file", fake_read)
    return state


def make_png(color: str = "red") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), color).save(buffer, "PNG")
    return buffer.getvalue()


def test_tag_editing_requires_admin(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    response = client.patch(
        f"{TRACKS_URL}/{track.id}/tags", json={"title": "X"}, headers=user_headers
    )
    assert response.status_code == 403
    batch = client.post(
        f"{TRACKS_URL}/tags/batch",
        json={"track_ids": [track.id], "changes": {"year": 2000}},
        headers=user_headers,
    )
    assert batch.status_code == 403


def test_edit_single_track_title(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_tag_io: SimpleNamespace,
    db_session: Session,
) -> None:
    track = seeded_library.tracks[0]
    fake_tag_io.reads[track.file_path] = make_info(
        title="Renamed Song", artists=["Alpha Band"], album="First Album"
    )

    response = client.patch(
        f"{TRACKS_URL}/{track.id}/tags", json={"title": "Renamed Song"}, headers=admin_headers
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Renamed Song"
    assert fake_tag_io.writes == [(track.file_path, {"title": "Renamed Song"})]
    db_session.expire_all()
    assert db_session.get(type(track), track.id).title == "Renamed Song"


def test_edit_artists_applies_separator_split(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_tag_io: SimpleNamespace,
) -> None:
    track = seeded_library.tracks[0]
    fake_tag_io.reads[track.file_path] = make_info(
        title=track.title, artists=["ACDC/Kiss"], album="First Album"
    )

    response = client.patch(
        f"{TRACKS_URL}/{track.id}/tags",
        json={"artists": ["ACDC/Kiss"]},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert sorted(a["name"] for a in response.json()["artists"]) == ["ACDC", "Kiss"]


def test_clearing_album_prunes_orphan(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_tag_io: SimpleNamespace,
    db_session: Session,
) -> None:
    track = seeded_library.tracks[2]  # only track of "Second Album"
    fake_tag_io.reads[track.file_path] = make_info(
        title=track.title, artists=["Beta Ensemble"], album=None
    )

    response = client.patch(
        f"{TRACKS_URL}/{track.id}/tags", json={"album": None}, headers=admin_headers
    )

    assert response.status_code == 200
    assert response.json()["album"] is None
    db_session.expire_all()
    remaining = [a.title for a in db_session.scalars(select(Album))]
    assert remaining == ["First Album"]


def test_edit_missing_track_returns_404(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = client.patch(
        f"{TRACKS_URL}/999/tags", json={"title": "X"}, headers=admin_headers
    )
    assert response.status_code == 404


def test_edit_with_no_changes_returns_400(
    client: TestClient, admin_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    response = client.patch(f"{TRACKS_URL}/{track.id}/tags", json={}, headers=admin_headers)
    assert response.status_code == 400


def test_batch_edit_updates_all_tracks(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_tag_io: SimpleNamespace,
    db_session: Session,
) -> None:
    for track in seeded_library.tracks:
        fake_tag_io.reads[track.file_path] = make_info(
            title=track.title, genres=["Synthwave"], year=1984
        )

    response = client.post(
        f"{TRACKS_URL}/tags/batch",
        json={
            "track_ids": [t.id for t in seeded_library.tracks],
            "changes": {"genres": ["Synthwave"], "year": 1984},
        },
        headers=admin_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 3
    assert body["errors"] == []
    assert len(fake_tag_io.writes) == 3
    db_session.expire_all()
    genres = [g.name for g in db_session.scalars(select(Genre))]
    assert genres == ["Synthwave"]


def test_batch_reports_errors_without_aborting(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_tag_io: SimpleNamespace,
) -> None:
    missing = seeded_library.tracks[0]
    Path(missing.file_path).unlink()
    for track in seeded_library.tracks[1:]:
        fake_tag_io.reads[track.file_path] = make_info(title=track.title, year=1999)

    response = client.post(
        f"{TRACKS_URL}/tags/batch",
        json={
            "track_ids": [t.id for t in seeded_library.tracks] + [999],
            "changes": {"year": 1999},
        },
        headers=admin_headers,
    )

    body = response.json()
    assert body["updated"] == 2
    assert len(body["errors"]) == 2  # missing file + unknown id


def test_read_file_tags_endpoint(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    track = seeded_library.tracks[0]
    monkeypatch.setattr(
        "app.services.tag_editor.read_full_tags",
        lambda path: {
            "artists": ["Alpha Band"],
            "genres": ["Rock"],
            "title": "Ocean Song",
            "album": "First Album",
            "composer": "A. Composer",
            "comment": "great take",
            "date": "2020-03-01",
        },
    )
    response = client.get(f"{TRACKS_URL}/{track.id}/tags/file", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["composer"] == "A. Composer"
    assert body["comment"] == "great take"
    assert body["date"] == "2020-03-01"
    assert body["isrc"] is None


def test_edit_extended_fields(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_tag_io: SimpleNamespace,
) -> None:
    track = seeded_library.tracks[0]
    fake_tag_io.reads[track.file_path] = make_info(title=track.title)

    response = client.patch(
        f"{TRACKS_URL}/{track.id}/tags",
        json={"composer": "Hans Zimmer", "comment": "fixed", "bpm": "120"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert fake_tag_io.writes == [
        (track.file_path, {"composer": "Hans Zimmer", "comment": "fixed", "bpm": "120"})
    ]


def test_save_album_cover_service(
    db_session: Session, seeded_library: SimpleNamespace, tmp_path: Path
) -> None:
    album = seeded_library.album_one
    covers_dir = tmp_path / "covers-cache"

    target = save_album_cover(db_session, album, make_png(), covers_dir=covers_dir)

    assert target.exists()
    assert target.suffix == ".png"
    assert album.cover_path == str(target)

    with pytest.raises(InvalidImageError):
        save_album_cover(db_session, album, b"not-an-image", covers_dir=covers_dir)


def test_cover_upload_requires_admin(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    response = client.put(
        f"/api/v1/albums/{seeded_library.album_one.id}/cover",
        files={"file": ("cover.png", make_png(), "image/png")},
        headers=user_headers,
    )
    assert response.status_code == 403


def test_cover_upload_endpoint(
    client: TestClient,
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    db_session: Session,
) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("IHY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    try:
        album = seeded_library.album_one
        response = client.put(
            f"/api/v1/albums/{album.id}/cover",
            files={"file": ("cover.png", make_png(), "image/png")},
            headers=admin_headers,
        )
        assert response.status_code == 204
        db_session.expire_all()
        cover_path = db_session.get(Album, album.id).cover_path
        assert cover_path is not None
        assert Path(cover_path).exists()

        bad = client.put(
            f"/api/v1/albums/{album.id}/cover",
            files={"file": ("cover.txt", b"garbage", "text/plain")},
            headers=admin_headers,
        )
        assert bad.status_code == 400
    finally:
        get_settings.cache_clear()
