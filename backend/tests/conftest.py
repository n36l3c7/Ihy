from collections.abc import Callable, Generator
from pathlib import Path
from types import SimpleNamespace

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
from app.models.library import Album, Artist, Genre, Source, Track
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


@pytest.fixture
def seeded_library(db_session: Session, tmp_path: Path) -> SimpleNamespace:
    """A small library: two artists, two albums, two genres, three real files."""
    source = Source(name="lib", path=str(tmp_path))
    alpha = Artist(name="Alpha Band")
    beta = Artist(name="Beta Ensemble")
    rock = Genre(name="Rock")
    jazz = Genre(name="Jazz")
    album_one = Album(title="First Album", artist=alpha, year=2020)
    album_two = Album(title="Second Album", artist=beta, year=2021)

    def make_track(
        title: str, filename: str, artist: Artist, album: Album, genre: Genre, number: int
    ) -> Track:
        path = tmp_path / filename
        path.write_bytes(f"audio-bytes-{title}".encode())
        track = Track(
            source=source,
            file_path=str(path),
            file_size=path.stat().st_size,
            file_mtime=0.0,
            format="mp3",
            duration=100.0,
            bitrate=320000,
            sample_rate=44100,
            title=title,
            artist=artist,
            album=album,
            track_number=number,
        )
        track.genres.append(genre)
        return track

    tracks = [
        make_track("Ocean Song", "a1.mp3", alpha, album_one, rock, 1),
        make_track("Mountain Song", "a2.mp3", alpha, album_one, rock, 2),
        make_track("River Jam", "b1.mp3", beta, album_two, jazz, 1),
    ]
    db_session.add_all(tracks)
    db_session.commit()
    return SimpleNamespace(
        source=source,
        alpha=alpha,
        beta=beta,
        rock=rock,
        jazz=jazz,
        album_one=album_one,
        album_two=album_two,
        tracks=tracks,
        root=tmp_path,
    )
