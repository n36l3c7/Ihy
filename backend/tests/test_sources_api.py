from pathlib import Path

from fastapi.testclient import TestClient

SOURCES_URL = "/api/v1/sources"


def test_sources_require_admin(client: TestClient, user_headers: dict[str, str]) -> None:
    assert client.get(SOURCES_URL, headers=user_headers).status_code == 403


def test_sources_require_auth(client: TestClient) -> None:
    assert client.get(SOURCES_URL).status_code == 401


def test_create_and_list_sources(
    client: TestClient, admin_headers: dict[str, str], tmp_path: Path
) -> None:
    response = client.post(
        SOURCES_URL, json={"name": "Main library", "path": str(tmp_path)}, headers=admin_headers
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Main library"
    assert body["path"] == str(tmp_path.resolve())
    assert body["enabled"] is True
    assert body["track_count"] == 0
    assert body["last_scanned_at"] is None

    listed = client.get(SOURCES_URL, headers=admin_headers)
    assert listed.status_code == 200
    assert [s["name"] for s in listed.json()] == ["Main library"]


def test_create_source_with_missing_path(
    client: TestClient, admin_headers: dict[str, str], tmp_path: Path
) -> None:
    response = client.post(
        SOURCES_URL,
        json={"name": "Broken", "path": str(tmp_path / "does-not-exist")},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_create_duplicate_path_conflicts(
    client: TestClient, admin_headers: dict[str, str], tmp_path: Path
) -> None:
    client.post(SOURCES_URL, json={"name": "First", "path": str(tmp_path)}, headers=admin_headers)
    response = client.post(
        SOURCES_URL, json={"name": "Second", "path": str(tmp_path)}, headers=admin_headers
    )
    assert response.status_code == 409


def test_update_source(client: TestClient, admin_headers: dict[str, str], tmp_path: Path) -> None:
    created = client.post(
        SOURCES_URL, json={"name": "Library", "path": str(tmp_path)}, headers=admin_headers
    ).json()

    response = client.patch(
        f"{SOURCES_URL}/{created['id']}",
        json={"name": "Renamed", "enabled": False},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert response.json()["enabled"] is False


def test_delete_source(client: TestClient, admin_headers: dict[str, str], tmp_path: Path) -> None:
    created = client.post(
        SOURCES_URL, json={"name": "Library", "path": str(tmp_path)}, headers=admin_headers
    ).json()

    assert (
        client.delete(f"{SOURCES_URL}/{created['id']}", headers=admin_headers).status_code == 204
    )
    assert client.get(SOURCES_URL, headers=admin_headers).json() == []


def test_read_missing_source_returns_404(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    assert client.get(f"{SOURCES_URL}/999", headers=admin_headers).status_code == 404
