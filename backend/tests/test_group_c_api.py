from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.services.playlist_files import parse_playlist_paths

PLAYLISTS_URL = "/api/v1/playlists"


def test_artist_info_fetched_and_cached(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def fake_fetch(name: str):
        calls.append(name)
        return f"{name} is a great band.", "https://en.wikipedia.org/wiki/X"

    monkeypatch.setattr("app.services.artist_info.fetch_wikipedia_summary", fake_fetch)
    url = f"/api/v1/artists/{seeded_library.alpha.id}/info"

    first = client.get(url, headers=user_headers)
    assert first.status_code == 200
    assert first.json()["bio"] == "Alpha Band is a great band."
    assert first.json()["source"] == "wikipedia"

    client.get(url, headers=user_headers)
    assert calls == ["Alpha Band"]  # cached

    client.get(f"{url}?refresh=true", headers=user_headers)
    assert calls == ["Alpha Band", "Alpha Band"]


def test_artist_info_miss_is_cached(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def fake_fetch(name: str):
        calls.append(name)
        return None

    monkeypatch.setattr("app.services.artist_info.fetch_wikipedia_summary", fake_fetch)
    url = f"/api/v1/artists/{seeded_library.beta.id}/info"
    assert client.get(url, headers=user_headers).json()["bio"] is None
    client.get(url, headers=user_headers)
    assert len(calls) == 1


def test_parse_playlist_paths_m3u() -> None:
    content = "#EXTM3U\n#EXTINF:100,A - B\n/music/a.mp3\n\n/music/b.mp3\n"
    assert parse_playlist_paths(content) == ["/music/a.mp3", "/music/b.mp3"]


def test_parse_playlist_paths_xspf() -> None:
    content = (
        '<?xml version="1.0"?><playlist><trackList>'
        "<track><location>file:///music/a.mp3</location></track>"
        "<track><location>/music/b%20c.mp3</location></track>"
        "</trackList></playlist>"
    )
    assert parse_playlist_paths(content) == ["/music/a.mp3", "/music/b c.mp3"]


def test_playlist_import_and_export(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    tracks = seeded_library.tracks
    content = "\n".join(
        ["#EXTM3U", tracks[0].file_path, "C:/nonexistent/file.mp3", tracks[2].file_path]
    )

    response = client.post(
        f"{PLAYLISTS_URL}/import",
        files={"file": ("roadtrip.m3u", content.encode(), "audio/x-mpegurl")},
        headers=user_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["playlist"]["name"] == "roadtrip"
    assert body["matched"] == 2
    assert body["total"] == 3

    playlist_id = body["playlist"]["id"]
    detail = client.get(f"{PLAYLISTS_URL}/{playlist_id}", headers=user_headers).json()
    assert [item["track"]["title"] for item in detail["items"]] == [
        tracks[0].title,
        tracks[2].title,
    ]

    exported = client.get(f"{PLAYLISTS_URL}/{playlist_id}/export", headers=user_headers)
    assert exported.status_code == 200
    assert exported.text.startswith("#EXTM3U")
    assert tracks[0].file_path in exported.text
    assert "Ocean Song" in exported.text


def test_playlist_import_matches_by_filename(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    # Different folder, same file name -> still matched
    content = "/somewhere/else/a1.mp3\n"
    response = client.post(
        f"{PLAYLISTS_URL}/import",
        files={"file": ("byname.m3u", content.encode(), "audio/x-mpegurl")},
        headers=user_headers,
    )
    assert response.status_code == 201
    assert response.json()["matched"] == 1
