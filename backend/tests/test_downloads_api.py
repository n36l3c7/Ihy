import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.downloads import DownloadWatch
from app.models.library import Source
from app.services import downloads as downloads_service
from app.services.downloads import DownloadManager

WATCHES_URL = "/api/v1/downloads/watches"
STATUS_URL = "/api/v1/downloads/status"
RUN_URL = "/api/v1/downloads/run"
SETTINGS_URL = "/api/v1/settings/downloads"


@pytest.fixture
def source(db_session, tmp_path: Path) -> Source:
    src = Source(name="lib", path=str(tmp_path))
    db_session.add(src)
    db_session.commit()
    return src


def test_downloads_require_admin(client: TestClient, user_headers: dict[str, str]) -> None:
    assert client.get(WATCHES_URL, headers=user_headers).status_code == 403
    assert client.get(STATUS_URL, headers=user_headers).status_code == 403
    assert client.post(RUN_URL, headers=user_headers).status_code == 403


def test_watch_crud(client: TestClient, admin_headers: dict[str, str], source: Source) -> None:
    created = client.post(
        WATCHES_URL,
        json={
            "name": "Daft Punk",
            "query": "https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi",
            "source_id": source.id,
        },
        headers=admin_headers,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["enabled"] is True
    assert body["last_run_at"] is None

    listed = client.get(WATCHES_URL, headers=admin_headers).json()
    assert [w["name"] for w in listed] == ["Daft Punk"]

    patched = client.patch(
        f"{WATCHES_URL}/{body['id']}", json={"enabled": False}, headers=admin_headers
    )
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False

    assert (
        client.delete(f"{WATCHES_URL}/{body['id']}", headers=admin_headers).status_code == 204
    )
    assert client.get(WATCHES_URL, headers=admin_headers).json() == []


def test_create_watch_with_unknown_source(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = client.post(
        WATCHES_URL,
        json={"name": "X", "query": "artist", "source_id": 999},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_run_rejected_when_spotdl_missing(
    client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.downloads.spotdl_available", lambda: False)
    response = client.post(RUN_URL, headers=admin_headers)
    assert response.status_code == 400

    status = client.get(STATUS_URL, headers=admin_headers).json()
    assert status["available"] is False
    assert status["running"] is False


def test_run_conflict_when_already_running(
    client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.downloads.spotdl_available", lambda: True)

    class BusyManager:
        running = True
        current_watch = "Something"
        last_finished_at = None

        def start(self) -> bool:
            return False

    monkeypatch.setattr(downloads_service, "download_manager", BusyManager())
    assert client.post(RUN_URL, headers=admin_headers).status_code == 409


def test_manager_runs_enabled_watches_and_triggers_scan(tmp_path: Path) -> None:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    music_dir = tmp_path / "music"
    music_dir.mkdir()
    with session_factory() as db:
        src = Source(name="lib", path=str(music_dir))
        db.add(src)
        db.commit()
        db.add_all(
            [
                DownloadWatch(name="Good", query="good-query", source_id=src.id),
                DownloadWatch(name="Bad", query="bad-query", source_id=src.id),
                DownloadWatch(name="Off", query="off-query", source_id=src.id, enabled=False),
            ]
        )
        db.commit()

    calls: list[tuple[str, str]] = []
    scans: list[bool] = []

    def fake_runner(query: str, output_dir: Path) -> tuple[bool, str]:
        calls.append((query, str(output_dir)))
        return (query == "good-query", "boom output")

    manager = DownloadManager(
        session_factory=session_factory,
        runner=fake_runner,
        start_scan=lambda: scans.append(True) or True,
    )
    assert manager.start() is True

    deadline = time.monotonic() + 5
    while manager.running and time.monotonic() < deadline:
        time.sleep(0.02)
    assert manager.running is False

    assert [query for query, _dir in calls] == ["good-query", "bad-query"]
    assert all(directory == str(music_dir) for _q, directory in calls)
    assert scans == [True]
    assert manager.last_finished_at is not None

    with session_factory() as db:
        good = db.scalar(select(DownloadWatch).where(DownloadWatch.name == "Good"))
        bad = db.scalar(select(DownloadWatch).where(DownloadWatch.name == "Bad"))
        off = db.scalar(select(DownloadWatch).where(DownloadWatch.name == "Off"))
        assert good.last_status == "ok"
        assert good.last_error is None
        assert bad.last_status == "error"
        assert "boom" in bad.last_error
        assert off.last_status is None
    engine.dispose()


def test_download_settings_roundtrip(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    assert client.get(SETTINGS_URL, headers=admin_headers).json() == {
        "check_interval_hours": 24
    }

    response = client.put(
        SETTINGS_URL, json={"check_interval_hours": 12}, headers=admin_headers
    )
    assert response.status_code == 200
    assert client.get(SETTINGS_URL, headers=admin_headers).json() == {
        "check_interval_hours": 12
    }

    disabled = client.put(
        SETTINGS_URL, json={"check_interval_hours": 0}, headers=admin_headers
    )
    assert disabled.status_code == 200


@pytest.fixture(autouse=True)
def _reset_manager_state() -> None:
    """Keep the module-level manager untouched across tests."""
    yield
    downloads_service.download_manager.current_watch = None
