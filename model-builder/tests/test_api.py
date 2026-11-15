import json
import shutil

import pytest
from fastapi.testclient import TestClient

from model_builder import api
from model_builder.api import app

client = TestClient(app)

REAL_PROJECT = api.project_dir("demo-project")


@pytest.fixture
def isolated_paths(tmp_path, monkeypatch):
    """Point the service at a copy of the project and a temp output folder, so tests never touch public/."""
    source = tmp_path / "data" / "demo-project"
    shutil.copytree(REAL_PROJECT, source)
    monkeypatch.setattr(api, "project_dir", lambda slug: source if slug == "demo-project" else tmp_path / slug)
    monkeypatch.setattr(api, "output_dir", lambda slug: tmp_path / "out" / slug)
    return tmp_path


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_unknown_project_is_404():
    assert client.post("/builds", json={"projectSlug": "no-such-project"}).status_code == 404


def test_build_succeeds_and_writes_model(isolated_paths):
    started = client.post("/builds", json={"projectSlug": "demo-project"})
    assert started.status_code == 202
    status = client.get(f"/builds/{started.json()['id']}").json()
    assert status["status"] == "succeeded"
    assert status["error"] is None
    model_json = isolated_paths / "out" / "demo-project" / "model.json"
    assert json.loads(model_json.read_text(encoding="utf-8"))["projectSlug"] == "demo-project"


def test_unknown_build_is_404():
    assert client.get("/builds/nope").status_code == 404
