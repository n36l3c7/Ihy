import io
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.services.artist_images import (
    invalidate_artist_image_cache,
    resolve_artist_image,
    save_artist_image,
)


def make_png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), "blue").save(buffer, "PNG")
    return buffer.getvalue()


def test_resolve_fetches_and_caches(seeded_library: SimpleNamespace, tmp_path: Path) -> None:
    images_dir = tmp_path / "artist-images"
    calls: list[str] = []

    def fetcher(name: str) -> bytes:
        calls.append(name)
        return make_png()

    first = resolve_artist_image(seeded_library.alpha, images_dir=images_dir, fetcher=fetcher)
    assert first is not None
    assert first.suffix == ".png"
    assert calls == ["Alpha Band"]

    # Second call: served from cache, no refetch
    second = resolve_artist_image(seeded_library.alpha, images_dir=images_dir, fetcher=fetcher)
    assert second == first
    assert calls == ["Alpha Band"]


def test_resolve_miss_is_cached(seeded_library: SimpleNamespace, tmp_path: Path) -> None:
    images_dir = tmp_path / "artist-images"
    calls: list[str] = []

    def fetcher(name: str) -> None:
        calls.append(name)
        return None

    artist = seeded_library.alpha
    assert resolve_artist_image(artist, images_dir=images_dir, fetcher=fetcher) is None
    assert resolve_artist_image(artist, images_dir=images_dir, fetcher=fetcher) is None
    assert len(calls) == 1  # miss marker prevents repeated lookups


def test_manual_upload_overrides_miss(
    seeded_library: SimpleNamespace, tmp_path: Path
) -> None:
    images_dir = tmp_path / "artist-images"
    resolve_artist_image(seeded_library.alpha, images_dir=images_dir, fetcher=lambda _n: None)

    saved = save_artist_image(seeded_library.alpha, make_png(), images_dir=images_dir)
    assert saved.exists()
    resolved = resolve_artist_image(
        seeded_library.alpha, images_dir=images_dir, fetcher=lambda _n: None
    )
    assert resolved == saved

    invalidate_artist_image_cache(seeded_library.alpha.id, images_dir=images_dir)
    assert not saved.exists()


def test_artist_image_endpoint(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_file = tmp_path / "img.jpg"
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), "red").save(buffer, "JPEG")
    image_file.write_bytes(buffer.getvalue())

    monkeypatch.setattr(
        "app.api.v1.artists.artist_images",
        SimpleNamespace(resolve_artist_image=lambda artist: image_file),
    )
    response = client.get(
        f"/api/v1/artists/{seeded_library.alpha.id}/image", headers=user_headers
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"


def test_artist_image_upload_requires_admin(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    response = client.put(
        f"/api/v1/artists/{seeded_library.alpha.id}/image",
        files={"file": ("img.png", make_png(), "image/png")},
        headers=user_headers,
    )
    assert response.status_code == 403
