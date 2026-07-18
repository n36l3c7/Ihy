from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import UserRole
from app.services import users as users_service

USERS_URL = "/api/v1/users"


def test_list_users_requires_admin(client: TestClient, user_headers: dict[str, str]) -> None:
    assert client.get(USERS_URL, headers=user_headers).status_code == 403


def test_list_users_requires_auth(client: TestClient) -> None:
    assert client.get(USERS_URL).status_code == 401


def test_admin_creates_and_lists_users(client: TestClient, admin_headers: dict[str, str]) -> None:
    created = client.post(
        USERS_URL,
        json={
            "username": "newuser",
            "password": "new-password",
            "email": "new@example.com",
            "first_name": "New",
            "last_name": "User",
        },
        headers=admin_headers,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["username"] == "newuser"
    assert body["role"] == "user"
    assert body["first_name"] == "New"
    assert body["last_name"] == "User"

    listed = client.get(USERS_URL, headers=admin_headers)
    assert listed.status_code == 200
    assert [u["username"] for u in listed.json()] == ["admin", "newuser"]


def test_create_duplicate_username_conflicts(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = client.post(
        USERS_URL,
        json={"username": "admin", "password": "whatever-password"},
        headers=admin_headers,
    )
    assert response.status_code == 409


def test_read_missing_user_returns_404(client: TestClient, admin_headers: dict[str, str]) -> None:
    assert client.get(f"{USERS_URL}/999", headers=admin_headers).status_code == 404


def test_admin_updates_user(
    client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    target = users_service.create(db_session, username="target", password="target-password")

    response = client.patch(
        f"{USERS_URL}/{target.id}",
        json={"role": "admin", "email": "target@example.com", "first_name": "Tar"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    assert response.json()["email"] == "target@example.com"
    assert response.json()["first_name"] == "Tar"


def test_update_password_allows_new_login(
    client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    make_auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    target = users_service.create(db_session, username="target", password="old-password")

    response = client.patch(
        f"{USERS_URL}/{target.id}", json={"password": "brand-new-password"}, headers=admin_headers
    )
    assert response.status_code == 200
    assert make_auth_headers("target", "brand-new-password")


def test_cannot_demote_last_admin(client: TestClient, admin_headers: dict[str, str]) -> None:
    admin_id = client.get("/api/v1/auth/me", headers=admin_headers).json()["id"]
    response = client.patch(
        f"{USERS_URL}/{admin_id}", json={"role": "user"}, headers=admin_headers
    )
    assert response.status_code == 400


def test_cannot_deactivate_last_admin(client: TestClient, admin_headers: dict[str, str]) -> None:
    admin_id = client.get("/api/v1/auth/me", headers=admin_headers).json()["id"]
    response = client.patch(
        f"{USERS_URL}/{admin_id}", json={"is_active": False}, headers=admin_headers
    )
    assert response.status_code == 400


def test_demote_allowed_with_two_admins(
    client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    second = users_service.create(
        db_session, username="admin2", password="admin2-password", role=UserRole.ADMIN
    )
    response = client.patch(
        f"{USERS_URL}/{second.id}", json={"role": "user"}, headers=admin_headers
    )
    assert response.status_code == 200
    assert response.json()["role"] == "user"


def test_admin_deletes_user(
    client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    target = users_service.create(db_session, username="target", password="target-password")
    assert client.delete(f"{USERS_URL}/{target.id}", headers=admin_headers).status_code == 204
    assert client.get(f"{USERS_URL}/{target.id}", headers=admin_headers).status_code == 404


def test_admin_cannot_delete_self(client: TestClient, admin_headers: dict[str, str]) -> None:
    admin_id = client.get("/api/v1/auth/me", headers=admin_headers).json()["id"]
    assert client.delete(f"{USERS_URL}/{admin_id}", headers=admin_headers).status_code == 400
