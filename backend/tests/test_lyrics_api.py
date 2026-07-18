from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def fake_fetcher(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    state = SimpleNamespace(calls=0, result=("La la la", "[00:01.00] La la la"))

    def fetch(_track):
        state.calls += 1
        return state.result

    monkeypatch.setattr("app.services.lyrics.fetch_from_lrclib", fetch)
    return state


def lyrics_url(track_id: int, refresh: bool = False) -> str:
    return f"/api/v1/tracks/{track_id}/lyrics{'?refresh=true' if refresh else ''}"


def test_lyrics_require_auth(client: TestClient, seeded_library: SimpleNamespace) -> None:
    assert client.get(lyrics_url(seeded_library.tracks[0].id)).status_code == 401


def test_lyrics_fetched_and_cached(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_fetcher: SimpleNamespace,
) -> None:
    track = seeded_library.tracks[0]

    first = client.get(lyrics_url(track.id), headers=user_headers)
    assert first.status_code == 200
    body = first.json()
    assert body["content"] == "La la la"
    assert body["source"] == "lrclib"
    assert fake_fetcher.calls == 1

    # Second request must come from the cache
    second = client.get(lyrics_url(track.id), headers=user_headers)
    assert second.json()["content"] == "La la la"
    assert fake_fetcher.calls == 1


def test_lyrics_not_found_is_cached_too(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_fetcher: SimpleNamespace,
) -> None:
    fake_fetcher.result = None
    track = seeded_library.tracks[0]

    first = client.get(lyrics_url(track.id), headers=user_headers)
    assert first.status_code == 200
    assert first.json()["content"] is None
    assert first.json()["source"] is None

    client.get(lyrics_url(track.id), headers=user_headers)
    assert fake_fetcher.calls == 1  # no repeated remote lookups


def test_lyrics_refresh_refetches(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_fetcher: SimpleNamespace,
) -> None:
    track = seeded_library.tracks[0]
    client.get(lyrics_url(track.id), headers=user_headers)

    fake_fetcher.result = ("New lyrics", None)
    refreshed = client.get(lyrics_url(track.id, refresh=True), headers=user_headers)
    assert refreshed.json()["content"] == "New lyrics"
    assert fake_fetcher.calls == 2


def test_embedded_lyrics_take_priority(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    fake_fetcher: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.lyrics.read_embedded_lyrics", lambda _path: "From the file"
    )
    track = seeded_library.tracks[0]

    response = client.get(lyrics_url(track.id), headers=user_headers)
    assert response.json()["content"] == "From the file"
    assert response.json()["source"] == "file"
    assert fake_fetcher.calls == 0


def test_lyrics_unknown_track_404(client: TestClient, user_headers: dict[str, str]) -> None:
    assert client.get(lyrics_url(999), headers=user_headers).status_code == 404
