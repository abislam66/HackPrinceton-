"""Which sides of the building have real reference images.

A side counts as known when an image in images/ has its side name in the file name,
e.g. ``north-elevation.jpg`` or ``East_facade.png``. Shots only frame these sides.
"""

import re
from pathlib import Path

from .contract import Side

SIDES: tuple[Side, ...] = ("north", "east", "south", "west")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def known_sides(images_dir: Path) -> list[Side]:
    """Return the sides named by image file names, in north, east, south, west order.

    A file that names no side, or names more than one, is ignored. A missing folder means no known sides.
    """
    if not images_dir.is_dir():
        return []
    found: set[Side] = set()
    for path in images_dir.iterdir():
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        words = set(re.findall(r"[a-z]+", path.stem.lower()))
        named = [side for side in SIDES if side in words]
        if len(named) == 1:
            found.add(named[0])
    return [side for side in SIDES if side in found]
