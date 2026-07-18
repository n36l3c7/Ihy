from types import SimpleNamespace

from fastapi.testclient import TestClient

from tests.utils import write_audio_file

STATS_URL = "/api/v1/stats"
BROWSE_URL = "/api/v1/library/browse"
BOOKMARKS_URL = "/api/v1/bookmarks"
HISTORY_URL = "/api/v1/history"
TRACKS_URL = "/api/v1/tracks"


def _record(client: TestClient, headers: dict[str, str], track_id: int, times: int) -> None:
    for _ in range(times):
        assert (
            client.post(HISTORY_URL, json={"track_id": track_id}, headers=headers).status_code
            == 204
        )


def test_stats_overview(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    _record(client, user_headers, seeded_library.tracks[0].id, 3)
    _record(client, user_headers, seeded_library.tracks[2].id, 1)

    body = client.get(STATS_URL, headers=user_headers).json()
    assert body["total_plays"] == 4
    assert body["distinct_tracks"] == 2
    assert body["total_seconds"] == 400.0  # 4 plays x 100s
    assert body["top_tracks"][0]["track"]["title"] == "Ocean Song"
    assert body["top_tracks"][0]["plays"] == 3
    assert body["top_artists"][0]["name"] == "Alpha Band"
    assert body["top_albums"][0]["title"] == "First Album"
    assert len(body["plays_by_day"]) == 1
    assert body["plays_by_day"][0]["plays"] == 4


def test_stats_are_per_user(
    client: TestClient,
    user_headers: dict[str, str],
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
) -> None:
    _record(client, user_headers, seeded_library.tracks[0].id, 2)
    body = client.get(STATS_URL, headers=admin_headers).json()
    assert body["total_plays"] == 0


def test_browse_sources_and_folders(
    client: TestClient,
    user_headers: dict[str, str],
    seeded_library: SimpleNamespace,
    db_session,
) -> None:
    # Move one track into a subfolder on disk and in the database
    sub = seeded_library.root / "Albums"
    sub.mkdir()
    moved = write_audio_file(sub, "moved.mp3")
    track = seeded_library.tracks[0]
    track.file_path = str(moved)
    db_session.commit()

    roots = client.get(BROWSE_URL, headers=user_headers).json()
    assert [source["name"] for source in roots["sources"]] == ["lib"]
    source_id = roots["sources"][0]["id"]

    top = client.get(f"{BROWSE_URL}?source_id={source_id}", headers=user_headers).json()
    assert "Albums" in top["folders"]
    top_titles = [t["title"] for t in top["tracks"]]
    assert "Mountain Song" in top_titles
    assert "Ocean Song" not in top_titles  # moved to the subfolder

    inside = client.get(
        f"{BROWSE_URL}?source_id={source_id}&path=Albums", headers=user_headers
    ).json()
    assert [t["title"] for t in inside["tracks"]] == ["Ocean Song"]

    escape = client.get(
        f"{BROWSE_URL}?source_id={source_id}&path=../..", headers=user_headers
    )
    assert escape.status_code == 400


def test_bookmarks_lifecycle(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    created = client.post(
        BOOKMARKS_URL,
        json={"track_id": track.id, "seconds": 42.5, "note": "great solo"},
        headers=user_headers,
    )
    assert created.status_code == 201
    assert created.json()["seconds"] == 42.5

    listed = client.get(BOOKMARKS_URL, headers=user_headers).json()
    assert len(listed) == 1
    assert listed[0]["track"]["title"] == track.title
    assert listed[0]["note"] == "great solo"

    bookmark_id = listed[0]["id"]
    assert (
        client.delete(f"{BOOKMARKS_URL}/{bookmark_id}", headers=user_headers).status_code
        == 204
    )
    assert client.get(BOOKMARKS_URL, headers=user_headers).json() == []


def test_bookmarks_are_per_user(
    client: TestClient,
    user_headers: dict[str, str],
    admin_headers: dict[str, str],
    seeded_library: SimpleNamespace,
) -> None:
    created = client.post(
        BOOKMARKS_URL,
        json={"track_id": seeded_library.tracks[0].id, "seconds": 1},
        headers=user_headers,
    ).json()
    assert client.get(BOOKMARKS_URL, headers=admin_headers).json() == []
    assert (
        client.delete(f"{BOOKMARKS_URL}/{created['id']}", headers=admin_headers).status_code
        == 404
    )


def test_tracks_ids_filter(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    wanted = [seeded_library.tracks[2].id, seeded_library.tracks[0].id]
    body = client.get(
        f"{TRACKS_URL}?ids={','.join(map(str, wanted))}", headers=user_headers
    ).json()
    assert body["total"] == 2
    assert sorted(track["id"] for track in body["items"]) == sorted(wanted)

    bad = client.get(f"{TRACKS_URL}?ids=1,abc", headers=user_headers)
    assert bad.status_code == 400


def test_browse_missing_source_404(client: TestClient, user_headers: dict[str, str]) -> None:
    assert (
        client.get(f"{BROWSE_URL}?source_id=999", headers=user_headers).status_code == 404
    )
