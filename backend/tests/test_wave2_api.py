"""Tests for track ratings and shared playlists."""

import hashlib
from types import SimpleNamespace

from fastapi.testclient import TestClient


def test_rating_roundtrip(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    assert (
        client.put(
            f"/api/v1/ratings/{track.id}", json={"rating": 4}, headers=user_headers
        ).status_code
        == 204
    )
    listed = client.get("/api/v1/ratings", headers=user_headers).json()
    assert listed == [{"track_id": track.id, "rating": 4}]

    # Update and remove
    client.put(f"/api/v1/ratings/{track.id}", json={"rating": 5}, headers=user_headers)
    assert client.get("/api/v1/ratings", headers=user_headers).json()[0]["rating"] == 5
    client.put(f"/api/v1/ratings/{track.id}", json={"rating": 0}, headers=user_headers)
    assert client.get("/api/v1/ratings", headers=user_headers).json() == []


def test_smart_playlist_rating_rule(
    client: TestClient, user_headers: dict, seeded_library: SimpleNamespace
) -> None:
    rated = seeded_library.tracks[1]
    client.put(f"/api/v1/ratings/{rated.id}", json={"rating": 5}, headers=user_headers)
    created = client.post(
        "/api/v1/smart-playlists",
        json={"name": "Top", "rules": [{"field": "rating", "op": "gte", "value": 4}]},
        headers=user_headers,
    )
    tracks = client.get(
        f"/api/v1/smart-playlists/{created.json()['id']}/tracks", headers=user_headers
    ).json()
    assert [item["title"] for item in tracks] == ["Mountain Song"]


def test_shared_playlist_visibility(
    client: TestClient,
    user_headers: dict,
    admin_headers: dict,
    seeded_library: SimpleNamespace,
) -> None:
    track = seeded_library.tracks[0]
    created = client.post(
        "/api/v1/playlists", json={"name": "Mixtape"}, headers=user_headers
    ).json()
    playlist_id = created["id"]
    client.post(
        f"/api/v1/playlists/{playlist_id}/tracks",
        json={"track_id": track.id},
        headers=user_headers,
    )

    # Private: invisible to others
    assert (
        client.get(f"/api/v1/playlists/{playlist_id}", headers=admin_headers).status_code
        == 404
    )
    assert client.get("/api/v1/playlists/shared", headers=admin_headers).json() == []

    # Make it public
    updated = client.patch(
        f"/api/v1/playlists/{playlist_id}", json={"is_public": True}, headers=user_headers
    )
    assert updated.json()["is_public"] is True

    shared = client.get("/api/v1/playlists/shared", headers=admin_headers).json()
    assert [item["name"] for item in shared] == ["Mixtape"]
    assert shared[0]["owner_username"] == "regular"

    detail = client.get(f"/api/v1/playlists/{playlist_id}", headers=admin_headers)
    assert detail.status_code == 200
    assert [item["track"]["title"] for item in detail.json()["items"]] == ["Ocean Song"]

    # Still read-only for non-owners
    assert (
        client.patch(
            f"/api/v1/playlists/{playlist_id}", json={"name": "Hacked"}, headers=admin_headers
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/v1/playlists/{playlist_id}", headers=admin_headers).status_code
        == 404
    )


def test_subsonic_set_rating(
    client: TestClient, db_session, seeded_library: SimpleNamespace
) -> None:
    from app.services import users as users_service

    user = users_service.create(db_session, username="rater", password="pw")
    user.subsonic_token = "secret"
    db_session.commit()
    salt = "s1"
    token = hashlib.md5(f"secret{salt}".encode()).hexdigest()  # noqa: S324
    params = {"u": "rater", "t": token, "s": salt, "f": "json"}
    track = seeded_library.tracks[2]
    response = client.get(
        "/rest/setRating", params={**params, "id": f"tr-{track.id}", "rating": "3"}
    )
    assert response.json()["subsonic-response"]["status"] == "ok"
