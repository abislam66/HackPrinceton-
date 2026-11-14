from fastapi.testclient import TestClient

from model_builder.api import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_unknown_project_is_404():
    assert client.post("/builds", json={"projectSlug": "no-such-project"}).status_code == 404


def test_build_reports_failure_until_implemented():
    started = client.post("/builds", json={"projectSlug": "demo-project"})
    assert started.status_code == 202
    status = client.get(f"/builds/{started.json()['id']}").json()
    assert status["status"] == "failed"
    assert "not implemented" in status["error"]


def test_unknown_build_is_404():
    assert client.get("/builds/nope").status_code == 404
