"""The contract with the web app. Mirrors src/features/model/schema.ts.

Change both files together and post on the board.

Coordinates: meters, glTF convention. +Y up, +X east, -Z north.
Origin: center of the building footprint at ground level.
"""

from typing import Literal

from pydantic import BaseModel, Field

Side = Literal["north", "east", "south", "west"]
Vec3 = tuple[float, float, float]

MODEL_FILE = "model.glb"
METADATA_FILE = "model.json"


class BoundingBox(BaseModel):
    min: Vec3
    max: Vec3


class ModelMetadata(BaseModel):
    """Written as model.json next to the GLB. The web app treats its presence as "a model exists"."""

    projectSlug: str
    file: str = MODEL_FILE
    version: int = Field(ge=1)
    units: Literal["meters"] = "meters"
    boundingBox: BoundingBox
    knownSides: list[Side]
