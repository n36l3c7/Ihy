from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def test_health_endpoint() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "Ihy"
