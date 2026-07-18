"""Tests for daily mixes and the Spotify playlist matcher."""

from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.spotify_import import match_entries


def test_daily_mixes_returned(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    response = client.get("/api/v1/mixes/daily", headers=user_headers)
    assert response.status_code == 200
    mixes = response.json()
    assert len(mixes) >= 1
    genres = {mix["genre"] for mix in mixes}
    assert genres <= {"Rock", "Jazz"}
    for mix in mixes:
        assert mix["tracks"], "every mix carries tracks"


def test_daily_mixes_stable_within_day(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    first = client.get("/api/v1/mixes/daily", headers=user_headers).json()
    second = client.get("/api/v1/mixes/daily", headers=user_headers).json()
    assert [[t["id"] for t in mix["tracks"]] for mix in first] == [
        [t["id"] for t in mix["tracks"]] for mix in second
    ]


def test_match_entries_by_title_and_artist(
    db_session: Session, seeded_library: SimpleNamespace
) -> None:
    entries = [
        {"name": "Ocean Song", "artists": ["Alpha Band"]},
        {"name": "ocean song", "artists": ["Somebody Else"]},  # title-only fallback
        {"name": "Not In Library", "artists": ["Nobody"]},
    ]
    matched = match_entries(db_session, entries)
    assert matched[0] is not None and matched[0].title == "Ocean Song"
    assert matched[1] is not None and matched[1].title == "Ocean Song"
    assert matched[2] is None


def test_spotify_import_rejects_non_spotify_url(
    client: TestClient, user_headers: dict, monkeypatch
) -> None:
    from app.api.v1 import downloads as downloads_api

    monkeypatch.setattr(downloads_api.downloads_service, "spotdl_available", lambda: True)
    response = client.post(
        "/api/v1/downloads/spotify-playlist",
        json={"url": "https://example.com/playlist/123"},
        headers=user_headers,
    )
    assert response.status_code == 400
