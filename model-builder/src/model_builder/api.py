"""HTTP wrapper around the build, so the web app can start one and poll it.

Mirrors buildStatusSchema in src/features/model/service.ts.
Builds are kept in memory: restarting the service forgets them. One build runs at a time.
"""

import re
import threading
import uuid
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from .build import build_model
from .paths import output_dir, project_dir

app = FastAPI(title="Model builder")

_builds: dict[str, "BuildStatus"] = {}
_build_lock = threading.Lock()


class BuildRequest(BaseModel):
    projectSlug: str


class BuildStatus(BaseModel):
    id: str
    projectSlug: str
    status: Literal["queued", "running", "succeeded", "failed"]
    error: str | None = None


def _run(build_id: str) -> None:
    status = _builds[build_id]
    with _build_lock:
        status.status = "running"
        try:
            out = output_dir(status.projectSlug)
            out.mkdir(parents=True, exist_ok=True)
            build_model(project_dir(status.projectSlug), out)
            status.status = "succeeded"
        except Exception as error:  # report every failure to the caller
            status.status = "failed"
            status.error = str(error) or type(error).__name__


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/builds", status_code=202)
def start_build(request: BuildRequest, background: BackgroundTasks) -> BuildStatus:
    if not re.fullmatch(r"[a-z0-9-]+", request.projectSlug) or not project_dir(request.projectSlug).is_dir():
        raise HTTPException(status_code=404, detail=f"Unknown project: {request.projectSlug}")
    status = BuildStatus(id=uuid.uuid4().hex, projectSlug=request.projectSlug, status="queued")
    _builds[status.id] = status
    background.add_task(_run, status.id)
    return status


@app.get("/builds/{build_id}")
def get_build(build_id: str) -> BuildStatus:
    status = _builds.get(build_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown build: {build_id}")
    return status
