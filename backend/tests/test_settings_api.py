from fastapi.testclient import TestClient

SETTINGS_URL = "/api/v1/settings/library"


def test_settings_require_admin(client: TestClient, user_headers: dict[str, str]) -> None:
    assert client.get(SETTINGS_URL, headers=user_headers).status_code == 403
    assert client.get(SETTINGS_URL).status_code == 401


def test_default_separators(client: TestClient, admin_headers: dict[str, str]) -> None:
    body = client.get(SETTINGS_URL, headers=admin_headers).json()
    assert body == {"metadata_separators": ["/", ";"]}


def test_update_separators(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.put(
        SETTINGS_URL, json={"metadata_separators": [";", " feat. "]}, headers=admin_headers
    )
    assert response.status_code == 200
    assert response.json() == {"metadata_separators": [";", " feat. "]}

    # Persisted across reads
    body = client.get(SETTINGS_URL, headers=admin_headers).json()
    assert body == {"metadata_separators": [";", " feat. "]}


def test_empty_separator_rejected(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.put(
        SETTINGS_URL, json={"metadata_separators": [""]}, headers=admin_headers
    )
    assert response.status_code == 422


def test_empty_list_allowed(client: TestClient, admin_headers: dict[str, str]) -> None:
    """No separators = never split tags."""
    response = client.put(SETTINGS_URL, json={"metadata_separators": []}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json() == {"metadata_separators": []}
