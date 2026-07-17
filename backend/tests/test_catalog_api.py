from types import SimpleNamespace

from fastapi.testclient import TestClient

TRACKS_URL = "/api/v1/tracks"
ARTISTS_URL = "/api/v1/artists"
ALBUMS_URL = "/api/v1/albums"
GENRES_URL = "/api/v1/genres"


def test_catalog_requires_auth(client: TestClient) -> None:
    for url in (TRACKS_URL, ARTISTS_URL, ALBUMS_URL, GENRES_URL):
        assert client.get(url).status_code == 401


def test_list_tracks_sorted_and_paginated(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    body = client.get(TRACKS_URL, headers=user_headers).json()
    assert body["total"] == 3
    assert [t["title"] for t in body["items"]] == ["Mountain Song", "Ocean Song", "River Jam"]

    page = client.get(f"{TRACKS_URL}?limit=2&offset=2", headers=user_headers).json()
    assert page["total"] == 3
    assert [t["title"] for t in page["items"]] == ["River Jam"]


def test_search_tracks_by_title_and_artist(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    by_title = client.get(f"{TRACKS_URL}?q=ocean", headers=user_headers).json()
    assert [t["title"] for t in by_title["items"]] == ["Ocean Song"]

    by_artist = client.get(f"{TRACKS_URL}?q=beta", headers=user_headers).json()
    assert [t["title"] for t in by_artist["items"]] == ["River Jam"]


def test_filter_tracks(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    lib = seeded_library
    by_artist = client.get(f"{TRACKS_URL}?artist_id={lib.alpha.id}", headers=user_headers).json()
    assert by_artist["total"] == 2

    by_album = client.get(f"{TRACKS_URL}?album_id={lib.album_two.id}", headers=user_headers).json()
    assert [t["title"] for t in by_album["items"]] == ["River Jam"]

    by_genre = client.get(f"{TRACKS_URL}?genre_id={lib.jazz.id}", headers=user_headers).json()
    assert [t["title"] for t in by_genre["items"]] == ["River Jam"]


def test_track_detail_includes_relations(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    body = client.get(f"{TRACKS_URL}/{track.id}", headers=user_headers).json()
    assert body["title"] == "Ocean Song"
    assert [a["name"] for a in body["artists"]] == ["Alpha Band"]
    assert body["album"]["title"] == "First Album"
    assert [g["name"] for g in body["genres"]] == ["Rock"]


def test_track_sort_recent(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    body = client.get(f"{TRACKS_URL}?sort=recent", headers=user_headers).json()
    assert body["total"] == 3


def test_list_artists_with_counts(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    body = client.get(ARTISTS_URL, headers=user_headers).json()
    assert body["total"] == 2
    alpha = body["items"][0]
    assert alpha["name"] == "Alpha Band"
    assert alpha["album_count"] == 1
    assert alpha["track_count"] == 2

    filtered = client.get(f"{ARTISTS_URL}?q=beta", headers=user_headers).json()
    assert [a["name"] for a in filtered["items"]] == ["Beta Ensemble"]


def test_artist_detail_with_albums(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    body = client.get(
        f"{ARTISTS_URL}/{seeded_library.alpha.id}", headers=user_headers
    ).json()
    assert body["name"] == "Alpha Band"
    assert body["track_count"] == 2
    assert [a["title"] for a in body["albums"]] == ["First Album"]
    assert body["albums"][0]["track_count"] == 2


def test_list_albums(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    body = client.get(ALBUMS_URL, headers=user_headers).json()
    assert body["total"] == 2
    first = body["items"][0]
    assert first["title"] == "First Album"
    assert first["artist"]["name"] == "Alpha Band"
    assert first["track_count"] == 2

    filtered = client.get(
        f"{ALBUMS_URL}?artist_id={seeded_library.beta.id}", headers=user_headers
    ).json()
    assert [a["title"] for a in filtered["items"]] == ["Second Album"]


def test_album_detail_with_ordered_tracks(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    body = client.get(
        f"{ALBUMS_URL}/{seeded_library.album_one.id}", headers=user_headers
    ).json()
    assert body["title"] == "First Album"
    assert body["track_count"] == 2
    assert [t["title"] for t in body["tracks"]] == ["Ocean Song", "Mountain Song"]


def test_list_genres_with_counts(
    client: TestClient, user_headers: dict[str, str], seeded_library: SimpleNamespace
) -> None:
    body = client.get(GENRES_URL, headers=user_headers).json()
    assert [(g["name"], g["track_count"]) for g in body] == [("Jazz", 1), ("Rock", 2)]


def test_missing_entities_return_404(client: TestClient, user_headers: dict[str, str]) -> None:
    assert client.get(f"{TRACKS_URL}/999", headers=user_headers).status_code == 404
    assert client.get(f"{ARTISTS_URL}/999", headers=user_headers).status_code == 404
    assert client.get(f"{ALBUMS_URL}/999", headers=user_headers).status_code == 404
