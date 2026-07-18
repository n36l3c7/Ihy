from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services import users as users_service

FAVORITES_URL = "/api/v1/favorites"
PLAYLISTS_URL = "/api/v1/playlists"
HISTORY_URL = "/api/v1/history"


def test_user_library_requires_auth(client: TestClient) -> None:
    for url in (FAVORITES_URL, PLAYLISTS_URL, HISTORY_URL):
        assert client.get(url).status_code == 401


# --- Favorites ---


def test_favorite_add_list_remove(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]

    assert client.put(f"{FAVORITES_URL}/{track.id}", headers=user_headers).status_code == 204
    assert client.get(f"{FAVORITES_URL}/ids", headers=user_headers).json() == [track.id]

    listed = client.get(FAVORITES_URL, headers=user_headers).json()
    assert listed["total"] == 1
    assert listed["items"][0]["title"] == track.title

    assert client.delete(f"{FAVORITES_URL}/{track.id}", headers=user_headers).status_code == 204
    assert client.get(f"{FAVORITES_URL}/ids", headers=user_headers).json() == []


def test_favorite_add_is_idempotent(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    assert client.put(f"{FAVORITES_URL}/{track.id}", headers=user_headers).status_code == 204
    assert client.put(f"{FAVORITES_URL}/{track.id}", headers=user_headers).status_code == 204
    assert client.get(f"{FAVORITES_URL}/ids", headers=user_headers).json() == [track.id]


def test_favorite_remove_is_idempotent(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    assert client.delete(f"{FAVORITES_URL}/{track.id}", headers=user_headers).status_code == 204


def test_favorite_unknown_track_404(client: TestClient, user_headers: dict[str, str]) -> None:
    assert client.put(f"{FAVORITES_URL}/999", headers=user_headers).status_code == 404


def test_favorites_are_per_user(
    client: TestClient,
    user_headers: dict[str, str],
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
) -> None:
    track = seeded_library.tracks[0]
    client.put(f"{FAVORITES_URL}/{track.id}", headers=user_headers)
    assert client.get(f"{FAVORITES_URL}/ids", headers=admin_headers).json() == []


# --- Playlists ---


def test_playlist_full_lifecycle(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    created = client.post(PLAYLISTS_URL, json={"name": "Roadtrip"}, headers=user_headers)
    assert created.status_code == 201
    playlist_id = created.json()["id"]

    listed = client.get(PLAYLISTS_URL, headers=user_headers).json()
    assert [(p["name"], p["track_count"]) for p in listed] == [("Roadtrip", 0)]

    first, second = seeded_library.tracks[0], seeded_library.tracks[1]
    added_one = client.post(
        f"{PLAYLISTS_URL}/{playlist_id}/tracks", json={"track_id": first.id}, headers=user_headers
    )
    assert added_one.status_code == 201
    assert added_one.json()["position"] == 1
    added_two = client.post(
        f"{PLAYLISTS_URL}/{playlist_id}/tracks", json={"track_id": second.id}, headers=user_headers
    )
    assert added_two.json()["position"] == 2

    detail = client.get(f"{PLAYLISTS_URL}/{playlist_id}", headers=user_headers).json()
    assert detail["track_count"] == 2
    assert [item["track"]["title"] for item in detail["items"]] == [first.title, second.title]

    renamed = client.patch(
        f"{PLAYLISTS_URL}/{playlist_id}", json={"name": "Vacation"}, headers=user_headers
    )
    assert renamed.json()["name"] == "Vacation"

    item_id = detail["items"][0]["id"]
    assert (
        client.delete(
            f"{PLAYLISTS_URL}/{playlist_id}/tracks/{item_id}", headers=user_headers
        ).status_code
        == 204
    )
    detail = client.get(f"{PLAYLISTS_URL}/{playlist_id}", headers=user_headers).json()
    assert [item["track"]["title"] for item in detail["items"]] == [second.title]

    assert client.delete(f"{PLAYLISTS_URL}/{playlist_id}", headers=user_headers).status_code == 204
    assert client.get(PLAYLISTS_URL, headers=user_headers).json() == []


def test_playlist_allows_duplicate_tracks(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    playlist_id = client.post(
        PLAYLISTS_URL, json={"name": "Loop"}, headers=user_headers
    ).json()["id"]
    track = seeded_library.tracks[0]
    for _ in range(2):
        client.post(
            f"{PLAYLISTS_URL}/{playlist_id}/tracks",
            json={"track_id": track.id},
            headers=user_headers,
        )
    detail = client.get(f"{PLAYLISTS_URL}/{playlist_id}", headers=user_headers).json()
    assert detail["track_count"] == 2


def test_playlist_of_other_user_is_hidden(
    client: TestClient, user_headers: dict[str, str], admin_headers: dict[str, str]
) -> None:
    playlist_id = client.post(
        PLAYLISTS_URL, json={"name": "Private"}, headers=user_headers
    ).json()["id"]

    assert client.get(f"{PLAYLISTS_URL}/{playlist_id}", headers=admin_headers).status_code == 404
    assert (
        client.delete(f"{PLAYLISTS_URL}/{playlist_id}", headers=admin_headers).status_code == 404
    )
    assert client.get(PLAYLISTS_URL, headers=admin_headers).json() == []


def test_playlist_add_unknown_track_404(
    client: TestClient, user_headers: dict[str, str]
) -> None:
    playlist_id = client.post(
        PLAYLISTS_URL, json={"name": "Empty"}, headers=user_headers
    ).json()["id"]
    response = client.post(
        f"{PLAYLISTS_URL}/{playlist_id}/tracks", json={"track_id": 999}, headers=user_headers
    )
    assert response.status_code == 404


def test_playlist_reorder(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    playlist_id = client.post(
        PLAYLISTS_URL, json={"name": "Ordered"}, headers=user_headers
    ).json()["id"]
    for track in seeded_library.tracks:
        client.post(
            f"{PLAYLISTS_URL}/{playlist_id}/tracks",
            json={"track_id": track.id},
            headers=user_headers,
        )
    detail = client.get(f"{PLAYLISTS_URL}/{playlist_id}", headers=user_headers).json()
    item_ids = [item["id"] for item in detail["items"]]

    reversed_ids = list(reversed(item_ids))
    response = client.put(
        f"{PLAYLISTS_URL}/{playlist_id}/order",
        json={"item_ids": reversed_ids},
        headers=user_headers,
    )
    assert response.status_code == 204

    detail = client.get(f"{PLAYLISTS_URL}/{playlist_id}", headers=user_headers).json()
    assert [item["id"] for item in detail["items"]] == reversed_ids
    assert [item["position"] for item in detail["items"]] == [1, 2, 3]


def test_playlist_reorder_with_wrong_ids(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    playlist_id = client.post(
        PLAYLISTS_URL, json={"name": "Strict"}, headers=user_headers
    ).json()["id"]
    client.post(
        f"{PLAYLISTS_URL}/{playlist_id}/tracks",
        json={"track_id": seeded_library.tracks[0].id},
        headers=user_headers,
    )

    response = client.put(
        f"{PLAYLISTS_URL}/{playlist_id}/order",
        json={"item_ids": [999]},
        headers=user_headers,
    )
    assert response.status_code == 400


# --- Play history ---


def test_history_record_and_list(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    first, second = seeded_library.tracks[0], seeded_library.tracks[1]
    assert (
        client.post(HISTORY_URL, json={"track_id": first.id}, headers=user_headers).status_code
        == 204
    )
    assert (
        client.post(HISTORY_URL, json={"track_id": second.id}, headers=user_headers).status_code
        == 204
    )

    body = client.get(HISTORY_URL, headers=user_headers).json()
    assert body["total"] == 2
    # Most recent first
    assert [entry["track"]["title"] for entry in body["items"]] == [second.title, first.title]


def test_history_is_per_user(
    client: TestClient,
    user_headers: dict[str, str],
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
) -> None:
    client.post(
        HISTORY_URL, json={"track_id": seeded_library.tracks[0].id}, headers=user_headers
    )
    assert client.get(HISTORY_URL, headers=admin_headers).json()["total"] == 0


def test_history_unknown_track_404(
    client: TestClient, user_headers: dict[str, str], db_session: Session
) -> None:
    users_service.get_by_username(db_session, "regular")
    assert (
        client.post(HISTORY_URL, json={"track_id": 999}, headers=user_headers).status_code == 404
    )
