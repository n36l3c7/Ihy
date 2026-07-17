from collections.abc import Callable, Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # registers all models on Base.metadata
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models.user import UserRole
from app.services import users as users_service


@pytest.fixture
def db_engine() -> Generator[Engine, None, None]:
    """An isolated in-memory SQLite engine with the full schema."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Generator[Session, None, None]:
    with Session(db_engine) as session:
        yield session


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """A test client whose requests run against the in-memory database."""
    application = create_app()

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    application.dependency_overrides[get_db] = override_get_db
    with TestClient(application) as test_client:
        yield test_client


@pytest.fixture
def make_auth_headers(client: TestClient) -> Callable[[str, str], dict[str, str]]:
    def _make(username: str, password: str) -> dict[str, str]:
        response = client.post(
            "/api/v1/auth/login", data={"username": username, "password": password}
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return _make


@pytest.fixture
def admin_headers(
    db_session: Session, make_auth_headers: Callable[[str, str], dict[str, str]]
) -> dict[str, str]:
    users_service.create(
        db_session, username="admin", password="admin-password", role=UserRole.ADMIN
    )
    return make_auth_headers("admin", "admin-password")


@pytest.fixture
def user_headers(
    db_session: Session, make_auth_headers: Callable[[str, str], dict[str, str]]
) -> dict[str, str]:
    users_service.create(db_session, username="regular", password="user-password")
    return make_auth_headers("regular", "user-password")
