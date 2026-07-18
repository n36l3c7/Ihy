"""Tests for the Subsonic-compatible API under /rest."""

import hashlib
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.services import users as users_service


@pytest.fixture
def subsonic_user(db_session: Session) -> User:
    user = users_service.create(db_session, username="subuser", password="web-password")
    user.subsonic_token = "sub-secret"
    db_session.commit()
    return user


def token_params(user: User) -> dict[str, str]:
    salt = "abc123"
    token = hashlib.md5(f"{user.subsonic_token}{salt}".encode()).hexdigest()  # noqa: S324
    return {"u": user.username, "t": token, "s": salt, "f": "json", "v": "1.16.1", "c": "test"}


def body(response) -> dict:
    payload = response.json()["subsonic-response"]
    return payload


def test_ping_with_token_auth(client: TestClient, subsonic_user: User) -> None:
    response = client.get("/rest/ping", params=token_params(subsonic_user))
    assert response.status_code == 200
    assert body(response)["status"] == "ok"
    assert body(response)["openSubsonic"] is True


def test_ping_with_plain_password(client: TestClient, subsonic_user: User) -> None:
    params = {"u": "subuser", "p": "sub-secret", "f": "json"}
    assert body(client.get("/rest/ping", params=params))["status"] == "ok"


def test_ping_rejects_wrong_token(client: TestClient, subsonic_user: User) -> None:
    params = {"u": "subuser", "t": "bad", "s": "abc", "f": "json"}
    payload = body(client.get("/rest/ping", params=params))
    assert payload["status"] == "failed"
    assert payload["error"]["code"] == 40


def test_ping_rejects_real_password(client: TestClient, subsonic_user: User) -> None:
    """The account password must never work for Subsonic clients."""
    params = {"u": "subuser", "p": "web-password", "f": "json"}
    assert body(client.get("/rest/ping", params=params))["status"] == "failed"


def test_ping_xml_envelope(client: TestClient, subsonic_user: User) -> None:
    params = {k: v for k, v in token_params(subsonic_user).items() if k != "f"}
    response = client.get("/rest/ping.view", params=params)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/xml")
    assert 'status="ok"' in response.text


def test_get_artists_and_album_flow(
    client: TestClient, subsonic_user: User, seeded_library: SimpleNamespace
) -> None:
    params = token_params(subsonic_user)
    artists = body(client.get("/rest/getArtists", params=params))["artists"]["index"]
    names = [artist["name"] for group in artists for artist in group["artist"]]
    assert "Alpha Band" in names and "Beta Ensemble" in names

    artist_id = next(
        artist["id"]
        for group in artists
        for artist in group["artist"]
        if artist["name"] == "Alpha Band"
    )
    artist = body(client.get("/rest/getArtist", params={**params, "id": artist_id}))["artist"]
    assert artist["album"][0]["name"] == "First Album"

    album = body(
        client.get("/rest/getAlbum", params={**params, "id": artist["album"][0]["id"]})
    )["album"]
    assert [song["title"] for song in album["song"]] == ["Ocean Song", "Mountain Song"]
    assert album["song"][0]["id"].startswith("tr-")


def test_search3(
    client: TestClient, subsonic_user: User, seeded_library: SimpleNamespace
) -> None:
    params = {**token_params(subsonic_user), "query": "River"}
    result = body(client.get("/rest/search3", params=params))["searchResult3"]
    assert [song["title"] for song in result["song"]] == ["River Jam"]


def test_stream_serves_file(
    client: TestClient, subsonic_user: User, seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    params = {**token_params(subsonic_user), "id": f"tr-{track.id}", "format": "raw"}
    response = client.get("/rest/stream", params=params)
    assert response.status_code == 200
    assert response.content.startswith(b"audio-bytes-")


def test_star_and_getstarred(
    client: TestClient, subsonic_user: User, seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[1]
    params = token_params(subsonic_user)
    assert body(client.get("/rest/star", params={**params, "id": f"tr-{track.id}"}))[
        "status"
    ] == "ok"
    starred = body(client.get("/rest/getStarred2", params=params))["starred2"]
    assert [song["title"] for song in starred["song"]] == ["Mountain Song"]


def test_scrobble_records_history(
    client: TestClient, subsonic_user: User, seeded_library: SimpleNamespace
) -> None:
    track = seeded_library.tracks[0]
    params = {**token_params(subsonic_user), "id": f"tr-{track.id}", "submission": "true"}
    assert body(client.get("/rest/scrobble", params=params))["status"] == "ok"


def test_playlist_roundtrip(
    client: TestClient, subsonic_user: User, seeded_library: SimpleNamespace
) -> None:
    params = token_params(subsonic_user)
    track = seeded_library.tracks[0]
    created = body(
        client.get(
            "/rest/createPlaylist",
            params={**params, "name": "From app", "songId": f"tr-{track.id}"},
        )
    )["playlist"]
    assert created["songCount"] == 1

    listed = body(client.get("/rest/getPlaylists", params=params))["playlists"]["playlist"]
    assert [playlist["name"] for playlist in listed] == ["From app"]

    detail = body(
        client.get("/rest/getPlaylist", params={**params, "id": created["id"]})
    )["playlist"]
    assert [entry["title"] for entry in detail["entry"]] == ["Ocean Song"]
