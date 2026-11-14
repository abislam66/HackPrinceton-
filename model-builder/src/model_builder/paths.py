"""Where things live in the repo."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"
MODELS_DIR = REPO_ROOT / "public" / "models"


def project_dir(project_slug: str) -> Path:
    return DATA_DIR / project_slug


def output_dir(project_slug: str) -> Path:
    return MODELS_DIR / project_slug
