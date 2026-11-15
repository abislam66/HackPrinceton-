"""Photo reader: reference photos in, project.json fields out.

A vision model reads each photo and fills the optional massing fields that only a picture can give (core, crown,
podium, facade material and glass share, tower proportions, floor count). Every value is reported with a
confidence and is marked ``photo-measured``; nothing here sets a footprint or location, which photos cannot give.

The call goes to the Anthropic Messages API over httpx (already a dependency). It is injectable so tests and the
ablation can supply a saved or hand-made response. Photos are reference only and are never shown to anyone.
"""

import base64
import json
import os
import re
from pathlib import Path
from typing import Callable

import httpx

from .reference import IMAGE_SUFFIXES, SIDES

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-opus-5-5"
MEDIA_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
Caller = Callable[[list[dict]], str]

# The same text is used for the real call and for the blind reads in the ablation, so results are comparable.
INSTRUCTIONS = """You are reading reference photos of ONE building to fill in a parametric massing model. Use only what you can see.
Do not use outside knowledge of the building. If the photos name no side, work out which face each shows from the light, street
layout and the building's own features, and say so in "photoSides".

Return ONLY a JSON object with these keys (omit a key you cannot judge, and give a confidence 0-1 for each group):
{
  "photoSides": {"<file>": ["north"|"south"|"east"|"west", ...]},        // faces visible in each photo
  "floors": integer,                                                     // count window rows from base to roof, excluding any plant
  "podiumFloors": integer,                                               // floors of a lower base around the tower, 0 if none
  "typology": "tower"|"block"|"bar"|"courtyard",
  "towerAspect": number,                                                 // long side / short side of the tower plan, 1.0 = square
  "slenderness": number,                                                 // tower height / width of its widest visible face
  "core": {"present": bool, "side": "north"|"south"|"east"|"west", "share": number, "material": "charcoal"|"brick"|"concrete"|"metal"|"stone", "sign": "T"|null},
  "crown": bool,                                                         // a distinct glassy top floor under a canopy
  "facades": {"north"|"south"|"east"|"west": {"material": "tile"|"brick"|"metal"|"stone"|"concrete"|"timber"|"terracotta", "glass": number}, "podium": {"material": string, "glass": number}},
  "windowBayM": number,                                                  // your estimate of one window bay in meters (typical 1.5-3 m)
  "confidence": {"floors": number, "layout": number, "materials": number},
  "notes": string                                                        // one sentence: what you could not tell
}
"""


def _image_block(path: Path) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": MEDIA_TYPES[path.suffix.lower()],
                                         "data": base64.b64encode(path.read_bytes()).decode()}}


def build_messages(images: list[Path], address_hint: str | None = None) -> list[dict]:
    content: list[dict] = []
    for path in images:
        content.append({"type": "text", "text": f"Photo file: {path.name}"})
        content.append(_image_block(path))
    text = INSTRUCTIONS
    if address_hint:
        text += f"\nContext you may use: {address_hint}\n"
    content.append({"type": "text", "text": text})
    return [{"role": "user", "content": content}]


def anthropic_caller(api_key: str | None = None) -> Caller:
    """A Caller that sends the messages to the Anthropic API. Needs ANTHROPIC_API_KEY (read, never printed)."""
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set (put it in .env or the environment)")

    def call(messages: list[dict]) -> str:
        response = httpx.post(API_URL, headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                              json={"model": MODEL, "max_tokens": 2000, "messages": messages}, timeout=120)
        response.raise_for_status()
        return "".join(b.get("text", "") for b in response.json()["content"])

    return call


def parse_reply(text: str) -> dict:
    """The JSON object in a model reply (it may be wrapped in a code fence or prose)."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("the reply holds no JSON object")
    return json.loads(match.group(0))


def to_project_fields(reading: dict) -> tuple[dict, dict[str, str]]:
    """Convert a reading into project.json fields plus a provenance note per field.

    Only values the schema accepts are kept. Core, facades and floors are carried over as given by the reader.
    """
    fields: dict = {}
    notes: dict[str, str] = {}
    conf = reading.get("confidence") or {}

    def keep(key: str, value, source: str, c: float | None) -> None:
        fields[key] = value
        notes[key] = f"photo-measured ({source}{'' if c is None else f', confidence {c:.1f}'})"

    if isinstance(reading.get("floors"), int) and reading["floors"] >= 1:
        keep("floors", reading["floors"], "counted window rows", conf.get("floors"))
    if isinstance(reading.get("podiumFloors"), int) and reading["podiumFloors"] >= 0:
        keep("podiumFloors", reading["podiumFloors"], "base height in the photo", conf.get("layout"))
    if reading.get("typology") in ("tower", "block", "bar", "courtyard"):
        keep("typology", reading["typology"], "overall shape", conf.get("layout"))
    core = reading.get("core")
    if isinstance(core, dict) and core.get("present"):
        out = {k: core[k] for k in ("material", "side", "share", "sign") if core.get(k) is not None}
        if out.get("side") not in (None, *SIDES):
            out.pop("side")
        keep("core", out, "service core in the photo", conf.get("layout"))
    if isinstance(reading.get("crown"), bool):
        keep("crown", reading["crown"], "top floor and canopy", conf.get("layout"))
    if isinstance(reading.get("facades"), dict):
        keep("facades", reading["facades"], "facade material and glass share", conf.get("materials"))
    return fields, notes


def read_photos(images_dir: Path, call: Caller | None = None, address_hint: str | None = None) -> tuple[dict, dict]:
    """Read every image in ``images_dir``. Returns (project fields, the raw reading with provenance notes)."""
    images = sorted(p for p in images_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES)
    if not images:
        raise ValueError(f"no images in {images_dir}")
    reply = (call or anthropic_caller())(build_messages(images, address_hint))
    reading = parse_reply(reply)
    fields, notes = to_project_fields(reading)
    return fields, {"reading": reading, "provenance": notes}
