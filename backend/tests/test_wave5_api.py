"""Tests for autotag suggestions, radio stations and the Wrapped recap."""

from types import SimpleNamespace

from fastapi.testclient import TestClient


def test_autotag_suggestions(
    client: TestClient,
    admin_headers: dict,
    seeded_library: SimpleNamespace,
    monkeypatch,
) -> None:
    from app.api.v1 import tracks as tracks_api

    def fake_search(title: str, artist: str | None, limit: int = 5) -> list[dict]:
        assert title == "Ocean Song"
        assert artist == "Alpha Band"
        return [
            {
                "title": "Ocean Song (Remastered)",
                "artists": ["Alpha Band"],
                "album": "First Album (Deluxe)",
                "year": 2021,
                "score": 98,
                "release_id": "rel-1",
                "cover_url": "https://coverartarchive.org/release/rel-1/front-500",
            }
        ]

    monkeypatch.setattr(tracks_api.musicbrainz, "search_recordings", fake_search)
    track = seeded_library.tracks[0]
    response = client.get(f"/api/v1/tracks/{track.id}/autotag", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()[0]["album"] == "First Album (Deluxe)"


def test_radio_stations_crud(client: TestClient, admin_headers: dict, user_headers: dict) -> None:
    created = client.post(
        "/api/v1/radio-stations",
        json={"name": "Nile FM", "stream_url": "https://radio.example/stream.mp3"},
        headers=admin_headers,
    )
    assert created.status_code == 201
    station_id = created.json()["id"]

    # Regular users can list, not create
    listed = client.get("/api/v1/radio-stations", headers=user_headers)
    assert [station["name"] for station in listed.json()] == ["Nile FM"]
    forbidden = client.post(
        "/api/v1/radio-stations",
        json={"name": "X", "stream_url": "https://x.example/s"},
        headers=user_headers,
    )
    assert forbidden.status_code == 403

    assert (
        client.delete(f"/api/v1/radio-stations/{station_id}", headers=admin_headers).status_code
        == 204
    )


def test_wrapped_recap(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    for track in (seeded_library.tracks[0], seeded_library.tracks[0], seeded_library.tracks[2]):
        client.post("/api/v1/history", json={"track_id": track.id}, headers=user_headers)

    response = client.get("/api/v1/stats/wrapped", headers=user_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total_plays"] == 3
    assert data["distinct_tracks"] == 2
    assert data["top_tracks"][0]["name"] == "Ocean Song"
    assert data["top_tracks"][0]["plays"] == 2
    assert data["top_genres"][0]["name"] == "Rock"
    assert data["busiest_month"] is not None
    assert data["available_years"] == [data["year"]]
