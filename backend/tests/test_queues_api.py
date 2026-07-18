from types import SimpleNamespace

from fastapi.testclient import TestClient

QUEUES_URL = "/api/v1/queues"


def test_queues_require_auth(client: TestClient) -> None:
    assert client.get(QUEUES_URL).status_code == 401


def test_queue_lifecycle(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track_ids = [track.id for track in seeded_library.tracks]

    created = client.post(
        QUEUES_URL,
        json={
            "name": "Evening",
            "track_ids": track_ids,
            "current_index": 1,
            "current_seconds": 42.5,
        },
        headers=user_headers,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Evening"
    assert body["current_index"] == 1
    assert body["current_seconds"] == 42.5
    assert [track["id"] for track in body["tracks"]] == track_ids

    listed = client.get(QUEUES_URL, headers=user_headers).json()
    assert [(queue["name"], queue["track_count"]) for queue in listed] == [("Evening", 3)]

    updated = client.put(
        f"{QUEUES_URL}/{body['id']}",
        json={
            "track_ids": list(reversed(track_ids)),
            "current_index": 0,
            "current_seconds": 0,
        },
        headers=user_headers,
    )
    assert updated.status_code == 200
    assert [track["id"] for track in updated.json()["tracks"]] == list(reversed(track_ids))

    assert (
        client.delete(f"{QUEUES_URL}/{body['id']}", headers=user_headers).status_code == 204
    )
    assert client.get(QUEUES_URL, headers=user_headers).json() == []


def test_queue_is_per_user(
    client: TestClient,
    user_headers: dict[str, str],
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
) -> None:
    queue_id = client.post(
        QUEUES_URL,
        json={"name": "Mine", "track_ids": [seeded_library.tracks[0].id]},
        headers=user_headers,
    ).json()["id"]

    assert client.get(f"{QUEUES_URL}/{queue_id}", headers=admin_headers).status_code == 404
    assert client.get(QUEUES_URL, headers=admin_headers).json() == []


def test_queue_skips_missing_tracks(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    response = client.post(
        QUEUES_URL,
        json={"name": "Sparse", "track_ids": [seeded_library.tracks[0].id, 9999]},
        headers=user_headers,
    )
    assert response.status_code == 201
    assert [track["id"] for track in response.json()["tracks"]] == [
        seeded_library.tracks[0].id
    ]


def test_queue_limit(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    payload = {"track_ids": [seeded_library.tracks[0].id]}
    for index in range(20):
        response = client.post(
            QUEUES_URL, json={"name": f"Q{index}", **payload}, headers=user_headers
        )
        assert response.status_code == 201
    over_limit = client.post(
        QUEUES_URL, json={"name": "Q20", **payload}, headers=user_headers
    )
    assert over_limit.status_code == 400
