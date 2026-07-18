"""Tests for smart playlists, autoplay radio and scrobbling settings."""

from types import SimpleNamespace

from fastapi.testclient import TestClient


def test_radio_returns_similar_tracks(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    seed = seeded_library.tracks[0]  # Rock, Alpha Band
    response = client.get(f"/api/v1/tracks/{seed.id}/radio", headers=user_headers)
    assert response.status_code == 200
    titles = {item["title"] for item in response.json()}
    assert seed.title not in titles  # seed excluded
    assert titles  # something similar found


def test_radio_excludes_requested_ids(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    seed = seeded_library.tracks[0]
    exclude = ",".join(str(track.id) for track in seeded_library.tracks)
    response = client.get(
        f"/api/v1/tracks/{seed.id}/radio?exclude={exclude}", headers=user_headers
    )
    assert response.status_code == 200
    assert response.json() == []


def test_smart_playlist_crud_and_resolution(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    payload = {
        "name": "Rock only",
        "match": "all",
        "rules": [{"field": "genre", "op": "is", "value": "Rock"}],
        "sort": "title",
        "max_tracks": 50,
    }
    created = client.post("/api/v1/smart-playlists", json=payload, headers=user_headers)
    assert created.status_code == 201
    playlist_id = created.json()["id"]

    listed = client.get("/api/v1/smart-playlists", headers=user_headers)
    assert [item["name"] for item in listed.json()] == ["Rock only"]

    tracks = client.get(
        f"/api/v1/smart-playlists/{playlist_id}/tracks", headers=user_headers
    )
    assert tracks.status_code == 200
    titles = [item["title"] for item in tracks.json()]
    assert titles == ["Mountain Song", "Ocean Song"]

    updated = client.put(
        f"/api/v1/smart-playlists/{playlist_id}",
        json={**payload, "rules": [{"field": "artist", "op": "contains", "value": "beta"}]},
        headers=user_headers,
    )
    assert updated.status_code == 200
    tracks = client.get(
        f"/api/v1/smart-playlists/{playlist_id}/tracks", headers=user_headers
    )
    assert [item["title"] for item in tracks.json()] == ["River Jam"]

    deleted = client.delete(
        f"/api/v1/smart-playlists/{playlist_id}", headers=user_headers
    )
    assert deleted.status_code == 204


def test_smart_playlist_rejects_bad_rule(client: TestClient, user_headers: dict) -> None:
    response = client.post(
        "/api/v1/smart-playlists",
        json={"name": "Bad", "rules": [{"field": "nope", "op": "is", "value": "x"}]},
        headers=user_headers,
    )
    assert response.status_code == 400


def test_smart_playlist_liked_rule(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    liked = seeded_library.tracks[2]
    assert (
        client.put(f"/api/v1/favorites/{liked.id}", headers=user_headers).status_code
        in (200, 204)
    )
    created = client.post(
        "/api/v1/smart-playlists",
        json={"name": "Liked", "rules": [{"field": "liked", "op": "is", "value": True}]},
        headers=user_headers,
    )
    playlist_id = created.json()["id"]
    tracks = client.get(
        f"/api/v1/smart-playlists/{playlist_id}/tracks", headers=user_headers
    )
    assert [item["title"] for item in tracks.json()] == ["River Jam"]


def test_smart_playlists_are_per_user(
    client: TestClient,
    user_headers: dict,
    admin_headers: dict,
) -> None:
    created = client.post(
        "/api/v1/smart-playlists", json={"name": "Mine", "rules": []}, headers=user_headers
    )
    playlist_id = created.json()["id"]
    other = client.get(f"/api/v1/smart-playlists/{playlist_id}", headers=admin_headers)
    assert other.status_code == 404


def test_scrobble_settings_roundtrip(client: TestClient, user_headers: dict) -> None:
    initial = client.get("/api/v1/scrobbling", headers=user_headers)
    assert initial.status_code == 200
    assert initial.json() == {
        "listenbrainz_token": None,
        "lastfm_connected": False,
        "lastfm_username": None,
    }

    updated = client.put(
        "/api/v1/scrobbling/listenbrainz", json={"token": "lb-token"}, headers=user_headers
    )
    assert updated.json()["listenbrainz_token"] == "lb-token"

    cleared = client.put(
        "/api/v1/scrobbling/listenbrainz", json={"token": ""}, headers=user_headers
    )
    assert cleared.json()["listenbrainz_token"] is None
