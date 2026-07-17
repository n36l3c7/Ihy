from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import UserRole
from app.services import users as users_service


def login(client: TestClient, username: str, password: str):
    return client.post("/api/v1/auth/login", data={"username": username, "password": password})


def test_setup_flow(client: TestClient) -> None:
    assert client.get("/api/v1/auth/setup").json() == {"needs_setup": True}

    response = client.post(
        "/api/v1/auth/setup", json={"username": "admin", "password": "a-strong-password"}
    )
    assert response.status_code == 201
    assert response.json()["role"] == "admin"

    assert client.get("/api/v1/auth/setup").json() == {"needs_setup": False}

    second = client.post(
        "/api/v1/auth/setup", json={"username": "intruder", "password": "another-password"}
    )
    assert second.status_code == 409


def test_login_and_me(client: TestClient, db_session: Session) -> None:
    users_service.create(db_session, username="sam", password="secret-password")

    response = login(client, "sam", "secret-password")
    assert response.status_code == 200
    tokens = response.json()
    assert tokens["token_type"] == "bearer"

    me = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["username"] == "sam"
    assert me.json()["role"] == "user"


def test_login_wrong_password(client: TestClient, db_session: Session) -> None:
    users_service.create(db_session, username="sam", password="secret-password")
    assert login(client, "sam", "wrong-password").status_code == 401


def test_login_unknown_user(client: TestClient) -> None:
    assert login(client, "ghost", "whatever-password").status_code == 401


def test_login_inactive_user(client: TestClient, db_session: Session) -> None:
    user = users_service.create(db_session, username="sam", password="secret-password")
    users_service.update(db_session, user, {"is_active": False})
    assert login(client, "sam", "secret-password").status_code == 401


def test_me_requires_token(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_rejects_garbage_token(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401


def test_refresh_returns_new_valid_pair(client: TestClient, db_session: Session) -> None:
    users_service.create(db_session, username="sam", password="secret-password")
    tokens = login(client, "sam", "secret-password").json()

    response = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 200
    new_tokens = response.json()

    me = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {new_tokens['access_token']}"}
    )
    assert me.status_code == 200


def test_refresh_rejects_access_token(client: TestClient, db_session: Session) -> None:
    users_service.create(db_session, username="sam", password="secret-password")
    tokens = login(client, "sam", "secret-password").json()

    response = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]}
    )
    assert response.status_code == 401


def test_access_token_rejected_as_refresh_and_vice_versa(
    client: TestClient, db_session: Session
) -> None:
    users_service.create(db_session, username="sam", password="secret-password")
    tokens = login(client, "sam", "secret-password").json()

    me = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert me.status_code == 401


def test_setup_creates_admin_role(client: TestClient, db_session: Session) -> None:
    client.post("/api/v1/auth/setup", json={"username": "admin", "password": "a-strong-password"})
    user = users_service.get_by_username(db_session, "admin")
    assert user is not None
    assert user.role == UserRole.ADMIN
