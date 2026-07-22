"""Tests for the "never played" filter and the recommended tracks endpoint."""

from types import SimpleNamespace

from fastapi.testclient import TestClient


def test_never_played_excludes_recorded_history(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    played = seeded_library.tracks[0]
    client.post("/api/v1/history", json={"track_id": played.id}, headers=user_headers)

    response = client.get("/api/v1/tracks?never_played=true", headers=user_headers)
    assert response.status_code == 200
    data = response.json()
    titles = {item["title"] for item in data["items"]}
    assert played.title not in titles
    assert data["total"] == len(seeded_library.tracks) - 1


def test_never_played_off_returns_everything(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    response = client.get("/api/v1/tracks", headers=user_headers)
    assert response.json()["total"] == len(seeded_library.tracks)


def test_never_played_is_per_user(
    client: TestClient,
    user_headers: dict,
    admin_headers: dict,
    seeded_library: SimpleNamespace,
) -> None:
    played = seeded_library.tracks[0]
    client.post("/api/v1/history", json={"track_id": played.id}, headers=user_headers)

    # The admin never played anything: nothing is excluded for them
    response = client.get("/api/v1/tracks?never_played=true", headers=admin_headers)
    assert response.json()["total"] == len(seeded_library.tracks)


def test_recommended_tracks_returned(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    response = client.get("/api/v1/mixes/recommended", headers=user_headers)
    assert response.status_code == 200
    tracks = response.json()
    assert len(tracks) > 0
    assert len(tracks) <= len(seeded_library.tracks)
