import threading
import time
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.api.v1 import library as library_module
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Source, Track, UserRole
from app.services import users as users_service
from app.services.scan_manager import ScanManager
from tests.utils import FakeReader, make_info, write_audio_file

SCAN_URL = "/api/v1/library/scan"


@pytest.fixture
def scan_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[tuple[TestClient, sessionmaker, FakeReader, Path], None, None]:
    """A file-backed database so the scan worker thread gets its own connection."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    reader = FakeReader()
    manager = ScanManager(session_factory, reader)
    monkeypatch.setattr(library_module, "scan_manager", manager)

    application = create_app()

    def override_get_db() -> Generator:
        with session_factory() as session:
            yield session

    application.dependency_overrides[get_db] = override_get_db

    music_dir = tmp_path / "music"
    music_dir.mkdir()
    with TestClient(application) as client:
        yield client, session_factory, reader, music_dir
    engine.dispose()


def _admin_headers(client: TestClient, session_factory: sessionmaker) -> dict[str, str]:
    with session_factory() as db:
        users_service.create(
            db, username="admin", password="admin-password", role=UserRole.ADMIN
        )
    response = client.post(
        "/api/v1/auth/login", data={"username": "admin", "password": "admin-password"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _wait_for_scan(client: TestClient, headers: dict[str, str], timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = client.get(SCAN_URL, headers=headers).json()
        if not status["running"] and status["finished_at"] is not None:
            return status
        time.sleep(0.05)
    raise AssertionError("Scan did not finish in time")


def test_scan_endpoint_full_cycle(scan_env) -> None:
    client, session_factory, reader, music_dir = scan_env
    headers = _admin_headers(client, session_factory)

    idle = client.get(SCAN_URL, headers=headers).json()
    assert idle["running"] is False
    assert idle["last_result"] is None

    song = write_audio_file(music_dir, "song.mp3")
    reader.add(song, make_info(title="Live Song"))
    with session_factory() as db:
        db.add(Source(name="lib", path=str(music_dir)))
        db.commit()

    response = client.post(SCAN_URL, headers=headers)
    assert response.status_code == 202

    status = _wait_for_scan(client, headers)
    assert status["error"] is None
    assert status["last_result"]["added"] == 1

    with session_factory() as db:
        track = db.scalar(select(Track))
        assert track is not None
        assert track.title == "Live Song"


def test_scan_requires_admin(scan_env) -> None:
    client, session_factory, _reader, _music_dir = scan_env
    with session_factory() as db:
        users_service.create(db, username="regular", password="user-password")
    response = client.post(
        "/api/v1/auth/login", data={"username": "regular", "password": "user-password"}
    )
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}

    assert client.get(SCAN_URL, headers=headers).status_code == 403
    assert client.post(SCAN_URL, headers=headers).status_code == 403


def test_manager_rejects_concurrent_scans(tmp_path: Path) -> None:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    music_dir = tmp_path / "music"
    music_dir.mkdir()
    song = write_audio_file(music_dir, "song.mp3")
    with session_factory() as db:
        db.add(Source(name="lib", path=str(music_dir)))
        db.commit()

    entered = threading.Event()
    release = threading.Event()

    def blocking_reader(path: Path):
        entered.set()
        release.wait(timeout=5)
        return make_info()

    manager = ScanManager(session_factory, blocking_reader)
    assert manager.start() is True
    assert entered.wait(timeout=5), "scan thread never started reading"
    assert manager.start() is False  # a scan is already running
    release.set()

    deadline = time.monotonic() + 5
    while manager.running and time.monotonic() < deadline:
        time.sleep(0.02)
    assert manager.running is False
    assert manager.error is None
    assert manager.last_result.added == 1
    assert song.exists()
    engine.dispose()
