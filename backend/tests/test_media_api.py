from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.covers import resolve_album_cover


def test_stream_full_file(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    response = client.get(f"/api/v1/tracks/{track.id}/stream", headers=user_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == Path(track.file_path).read_bytes()


def test_stream_supports_range_requests(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    response = client.get(
        f"/api/v1/tracks/{track.id}/stream",
        headers={**user_headers, "Range": "bytes=0-3"},
    )
    assert response.status_code == 206
    assert len(response.content) == 4
    assert response.content == Path(track.file_path).read_bytes()[:4]
    assert response.headers["content-range"].startswith("bytes 0-3/")


def test_stream_accepts_query_token(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    token = user_headers["Authorization"].removeprefix("Bearer ")
    track = seeded_library.tracks[0]
    response = client.get(f"/api/v1/tracks/{track.id}/stream?token={token}")
    assert response.status_code == 200


def test_stream_requires_auth(
    client: TestClient, seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    assert client.get(f"/api/v1/tracks/{track.id}/stream").status_code == 401


def test_stream_missing_file_returns_404(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    db_session: Session,
) -> None:
    track = seeded_library.tracks[0]
    Path(track.file_path).unlink()
    response = client.get(f"/api/v1/tracks/{track.id}/stream", headers=user_headers)
    assert response.status_code == 404


def test_album_cover_from_folder_image(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    db_session: Session,
) -> None:
    cover = seeded_library.root / "cover.jpg"
    cover.write_bytes(b"jpeg-image-data")
    seeded_library.album_one.cover_path = str(cover)
    db_session.commit()

    response = client.get(
        f"/api/v1/albums/{seeded_library.album_one.id}/cover", headers=user_headers
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content == b"jpeg-image-data"


def test_album_without_cover_returns_404(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    response = client.get(
        f"/api/v1/albums/{seeded_library.album_two.id}/cover", headers=user_headers
    )
    assert response.status_code == 404


def test_embedded_cover_extracted_and_cached(
    db_session: Session, seeded_library: SimpleNamespace, tmp_path: Path
) -> None:
    album = seeded_library.album_one
    track = seeded_library.tracks[0]
    track.has_embedded_cover = True
    db_session.commit()
    covers_dir = tmp_path / "covers-cache"

    calls: list[Path] = []

    def fake_extract(path: Path) -> tuple[bytes, str]:
        calls.append(path)
        return b"png-image-data", "image/png"

    first = resolve_album_cover(db_session, album, covers_dir=covers_dir, extract=fake_extract)
    assert first is not None
    assert first.suffix == ".png"
    assert first.read_bytes() == b"png-image-data"
    assert calls == [Path(track.file_path)]

    # Second resolution must hit the cache, not the extractor
    second = resolve_album_cover(db_session, album, covers_dir=covers_dir, extract=fake_extract)
    assert second == first
    assert len(calls) == 1
