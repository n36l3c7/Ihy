from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture
def spa_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[TestClient, None, None]:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<html>ihy-spa</html>")
    (static_dir / "app.js").write_text("console.log('app');")
    monkeypatch.setenv("IHY_STATIC_DIR", str(static_dir))
    monkeypatch.setenv("IHY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        yield client
    get_settings.cache_clear()


def test_root_serves_index(spa_client: TestClient) -> None:
    response = spa_client.get("/")
    assert response.status_code == 200
    assert "ihy-spa" in response.text


def test_static_asset_served(spa_client: TestClient) -> None:
    response = spa_client.get("/app.js")
    assert response.status_code == 200
    assert "console.log" in response.text


def test_client_route_falls_back_to_index(spa_client: TestClient) -> None:
    response = spa_client.get("/albums/42")
    assert response.status_code == 200
    assert "ihy-spa" in response.text


def test_api_still_reachable_with_static_mounted(spa_client: TestClient) -> None:
    response = spa_client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
