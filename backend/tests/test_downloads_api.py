import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.downloads import DownloadFix, DownloadWatch
from app.models.library import Source
from app.services import downloads as downloads_service
from app.services.downloads import DownloadManager, parse_failures

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
        log_lines = ["=== Something (query)"]

        def start(self) -> bool:
            return False

    monkeypatch.setattr(downloads_service, "download_manager", BusyManager())
    assert client.post(RUN_URL, headers=admin_headers).status_code == 409

    log = client.get("/api/v1/downloads/log", headers=admin_headers)
    assert log.status_code == 200
    assert log.json()["lines"] == ["=== Something (query)"]


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

    def fake_runner(query: str, output_dir: Path, _options: dict, on_line) -> tuple[bool, str]:
        calls.append((query, str(output_dir)))
        on_line("boom output")
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
    assert scans == [True, True]  # one scan per completed watch
    assert manager.last_finished_at is not None
    assert any("boom output" in line for line in manager.log_lines)
    assert any("Bad" in line and "FAILED" in line for line in manager.log_lines)

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


def test_failure_with_url_gets_human_label(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine, session_factory, _music, watch_id, _other = _make_manager_env(tmp_path)
    monkeypatch.setattr(
        "app.services.spotify.resolve_track_label", lambda url: "Halsey - Without Me"
    )

    def fake_runner(query, _dir, _options, on_line):
        if query == "solo-query":
            on_line(
                "https://open.spotify.com/track/abc123 - AudioProviderError: "
                "YT-DLP download error -"
            )
            on_line("DownloaderError: something went wrong")  # no URL -> skipped
        return True, "done"

    manager = DownloadManager(
        session_factory=session_factory, runner=fake_runner, start_scan=lambda: True
    )
    assert manager.start(watch_ids=[watch_id]) is True
    _wait_for(manager)

    with session_factory() as db:
        fixes = list(db.scalars(select(DownloadFix)))
        assert len(fixes) == 1
        assert fixes[0].song == "Halsey - Without Me"
        assert fixes[0].spotify_url == "https://open.spotify.com/track/abc123"
    engine.dispose()


def test_download_settings_roundtrip(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    assert client.get(SETTINGS_URL, headers=admin_headers).json() == {
        "check_interval_hours": 24,
        "cron": "",
    }

    response = client.put(
        SETTINGS_URL, json={"check_interval_hours": 12}, headers=admin_headers
    )
    assert response.status_code == 200
    assert client.get(SETTINGS_URL, headers=admin_headers).json() == {
        "check_interval_hours": 12,
        "cron": "",
    }

    disabled = client.put(
        SETTINGS_URL, json={"check_interval_hours": 0}, headers=admin_headers
    )
    assert disabled.status_code == 200


def test_download_cron_schedule(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.put(
        SETTINGS_URL,
        json={"check_interval_hours": 0, "cron": "30 4 * * 1"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert client.get(SETTINGS_URL, headers=admin_headers).json() == {
        "check_interval_hours": 0,
        "cron": "30 4 * * 1",
    }

    invalid = client.put(
        SETTINGS_URL,
        json={"check_interval_hours": 0, "cron": "not a cron"},
        headers=admin_headers,
    )
    assert invalid.status_code == 400


def test_parse_failures() -> None:
    lines = [
        "Downloading Artist - Song",
        "LookupError: No results found for song: Halsey - Without Me",
        "AudioProviderError: YT-DLP download error - https://open.spotify.com/track/abc123XYZ",
        "Downloaded 3 songs",
    ]
    failures = parse_failures(lines)
    songs = [failure["song"] for failure in failures]
    assert "Halsey - Without Me" in songs
    assert any(f["spotify_url"] == "https://open.spotify.com/track/abc123XYZ" for f in failures)


def _make_manager_env(tmp_path: Path):
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
        watch = DownloadWatch(name="Solo", query="solo-query", source_id=src.id)
        other = DownloadWatch(name="Other", query="other-query", source_id=src.id)
        db.add_all([watch, other])
        db.commit()
        watch_id, other_id = watch.id, other.id
    return engine, session_factory, music_dir, watch_id, other_id


def _wait_for(manager: DownloadManager) -> None:
    deadline = time.monotonic() + 5
    while manager.running and time.monotonic() < deadline:
        time.sleep(0.02)
    assert manager.running is False


def test_manager_single_watch_run(tmp_path: Path) -> None:
    engine, session_factory, _music, watch_id, _other = _make_manager_env(tmp_path)
    calls: list[str] = []

    def fake_runner(query, _dir, _options, _on_line):
        calls.append(query)
        return True, "done"

    manager = DownloadManager(
        session_factory=session_factory, runner=fake_runner, start_scan=lambda: True
    )
    assert manager.start(watch_ids=[watch_id]) is True
    _wait_for(manager)
    assert calls == ["solo-query"]
    engine.dispose()


def test_manager_records_failures_and_applies_fixes(tmp_path: Path) -> None:
    engine, session_factory, _music, watch_id, _other = _make_manager_env(tmp_path)
    with session_factory() as db:
        db.add(
            DownloadFix(
                watch_id=watch_id,
                song="Old Failure",
                spotify_url="https://open.spotify.com/track/old",
                youtube_url="https://youtu.be/xyz",
            )
        )
        db.commit()

    calls: list[str] = []

    def fake_runner(query, _dir, _options, on_line):
        calls.append(query)
        if query == "solo-query":
            on_line("LookupError: No results found for song: Artist - Missing Song")
        return True, "done"

    manager = DownloadManager(
        session_factory=session_factory, runner=fake_runner, start_scan=lambda: True
    )
    assert manager.start(watch_ids=[watch_id]) is True
    _wait_for(manager)

    # The saved fix pair was applied after the main query
    assert calls == ["solo-query", "https://open.spotify.com/track/old|https://youtu.be/xyz"]
    with session_factory() as db:
        recorded = db.scalar(
            select(DownloadFix).where(DownloadFix.song == "Artist - Missing Song")
        )
        assert recorded is not None
        assert recorded.watch_id == watch_id
        assert recorded.youtube_url is None
    engine.dispose()


def test_fixes_missing_id_404(client: TestClient, admin_headers: dict[str, str]) -> None:
    assert client.get("/api/v1/downloads/fixes", headers=admin_headers).json() == []
    assert (
        client.patch(
            "/api/v1/downloads/fixes/999",
            json={"youtube_url": "https://youtu.be/abc"},
            headers=admin_headers,
        ).status_code
        == 404
    )
    assert client.delete("/api/v1/downloads/fixes/999", headers=admin_headers).status_code == 404


def test_fix_update_flow(
    client: TestClient,
    admin_headers: dict[str, str],
    source: Source,
    db_session,
) -> None:
    watch = client.post(
        WATCHES_URL,
        json={"name": "W", "query": "q", "source_id": source.id},
        headers=admin_headers,
    ).json()
    db_session.add(
        DownloadFix(watch_id=watch["id"], song="Artist - Lost", error="No results")
    )
    db_session.commit()

    listed = client.get("/api/v1/downloads/fixes", headers=admin_headers).json()
    assert len(listed) == 1
    assert listed[0]["song"] == "Artist - Lost"
    assert listed[0]["watch_name"] == "W"

    fix_id = listed[0]["id"]
    patched = client.patch(
        f"/api/v1/downloads/fixes/{fix_id}",
        json={
            "spotify_url": "https://open.spotify.com/track/x",
            "youtube_url": "https://youtu.be/y",
        },
        headers=admin_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["youtube_url"] == "https://youtu.be/y"

    assert (
        client.delete(f"/api/v1/downloads/fixes/{fix_id}", headers=admin_headers).status_code
        == 204
    )
    assert client.get("/api/v1/downloads/fixes", headers=admin_headers).json() == []


def test_spotdl_options_roundtrip(client: TestClient, admin_headers: dict[str, str]) -> None:
    defaults = client.get("/api/v1/settings/spotdl", headers=admin_headers).json()
    assert defaults["output_format"] is None
    assert defaults["client_id"] == ""

    response = client.put(
        "/api/v1/settings/spotdl",
        json={
            "output_format": "mp3",
            "bitrate": "320k",
            "threads": 4,
            "extra_args": "--sponsor-block",
            "client_id": "abc",
            "client_secret": "def",
        },
        headers=admin_headers,
    )
    assert response.status_code == 200
    stored = client.get("/api/v1/settings/spotdl", headers=admin_headers).json()
    assert stored["output_format"] == "mp3"
    assert stored["threads"] == 4
    assert stored["client_id"] == "abc"


def test_spotify_search_without_credentials(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = client.get(
        "/api/v1/downloads/spotify/search?q=daft", headers=admin_headers
    )
    assert response.status_code == 400
    assert "credentials" in response.json()["detail"].lower()


def test_spotify_search_with_credentials(
    client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    client.put(
        "/api/v1/settings/spotdl",
        json={"client_id": "abc", "client_secret": "def"},
        headers=admin_headers,
    )

    def fake_search(client_id: str, client_secret: str, query: str, limit: int = 10):
        assert (client_id, client_secret) == ("abc", "def")
        return [
            {
                "id": "1",
                "name": f"Result for {query}",
                "url": "https://open.spotify.com/artist/1",
                "image": None,
                "followers": 1000,
            }
        ]

    monkeypatch.setattr("app.services.spotify.search_artists", fake_search)
    response = client.get(
        "/api/v1/downloads/spotify/search?q=daft", headers=admin_headers
    )
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Result for daft"


def test_spotify_resolve(
    client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.spotify.resolve_title", lambda url: "Daft Punk")
    response = client.get(
        "/api/v1/downloads/spotify/resolve?url=https://open.spotify.com/artist/4tZ",
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"name": "Daft Punk"}

    bad = client.get(
        "/api/v1/downloads/spotify/resolve?url=https://example.com/whatever",
        headers=admin_headers,
    )
    assert bad.status_code == 400


def test_spotify_resolve_not_found(
    client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.spotify.resolve_title", lambda url: None)
    response = client.get(
        "/api/v1/downloads/spotify/resolve?url=https://open.spotify.com/artist/nope",
        headers=admin_headers,
    )
    assert response.status_code == 404


@pytest.fixture(autouse=True)
def _reset_manager_state() -> None:
    """Keep the module-level manager untouched across tests."""
    yield
    downloads_service.download_manager.current_watch = None
