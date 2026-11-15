"""OpenStreetMap autofill: a place name or coordinates in, project.json fields out.

Fills ``footprint``, ``floors`` (from ``building:levels``), ``context`` (neighboring buildings) and ``streets``
so a client only has to name the building. Everything comes from two free public services: Nominatim (to find a
name) and Overpass (the map data). Responses are cached on disk, so repeating a build costs no requests.

Network access is injected (``fetch``) so tests run on saved responses.
"""

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Callable

import httpx

USER_AGENT = "model-builder/0.1 (reference-model research)"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = "https://overpass-api.de/api/interpreter"
SEARCH_RADIUS_M = 260
STREET_WIDTH_M = {"primary": 26, "secondary": 16, "tertiary": 12, "residential": 9, "unclassified": 9, "pedestrian": 8}
Fetch = Callable[[str, dict[str, str]], dict | list]


def _cache_path(cache_dir: Path | None, url: str, params: dict[str, str]) -> Path | None:
    if cache_dir is None:
        return None
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()[:20]
    return cache_dir / f"{key}.json"


def http_fetch(url: str, params: dict[str, str], cache_dir: Path | None = None) -> dict | list:
    """GET (Nominatim) or POST (Overpass) with an on-disk cache. Raises on a non-200."""
    cached = _cache_path(cache_dir, url, params)
    if cached is not None and cached.is_file():
        return json.loads(cached.read_text(encoding="utf-8"))
    headers = {"User-Agent": USER_AGENT}
    if url == OVERPASS:
        response = httpx.post(url, data=params, headers=headers, timeout=90)
    else:
        response = httpx.get(url, params=params, headers=headers, timeout=30)
    response.raise_for_status()
    data = response.json()
    if cached is not None:
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(data), encoding="utf-8")
    return data


def geocode(query: str, fetch: Fetch) -> tuple[float, float]:
    """(lat, lng) of the best Nominatim match for a name or address."""
    hits = fetch(NOMINATIM, {"q": query, "format": "json", "limit": "1"})
    if not hits:
        raise ValueError(f"could not find {query!r} on OpenStreetMap")
    return float(hits[0]["lat"]), float(hits[0]["lon"])


def _ring(element: dict) -> list[list[float]]:
    return [[round(p["lon"], 7), round(p["lat"], 7)] for p in element.get("geometry", [])]


def _distance_m(lat: float, lng: float, point: list[float]) -> float:
    return math.hypot((point[0] - lng) * 111_320 * math.cos(math.radians(lat)), (point[1] - lat) * 110_574)


def _centroid(ring: list[list[float]]) -> list[float]:
    return [sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)]


def _number(value) -> float | None:
    """The leading number in an OSM tag value such as "27" or "92 m"."""
    match = re.match(r"\s*([0-9]+(?:\.[0-9]+)?)", str(value))
    return float(match.group(1)) if match else None


def parse_overpass(data: dict, lat: float, lng: float, building_id: int | None = None) -> dict:
    """Turn an Overpass response (ways with geometry) into project.json fields.

    The subject is ``building_id`` if given, else the building whose outline contains or is nearest to the point.
    """
    buildings = [e for e in data.get("elements", []) if "building" in e.get("tags", {}) and len(e.get("geometry", [])) >= 4]
    if not buildings:
        raise ValueError("no buildings found near that point")
    if building_id is not None:
        subject = next((e for e in buildings if e["id"] == building_id), None)
        if subject is None:
            raise ValueError(f"building {building_id} not found near that point")
    else:
        subject = min(buildings, key=lambda e: _distance_m(lat, lng, _centroid(_ring(e))))
    tags = subject.get("tags", {})

    context = []
    for e in buildings:
        if e["id"] == subject["id"]:
            continue
        item: dict = {"footprint": _ring(e)}
        if e.get("tags", {}).get("name"):
            item["name"] = e["tags"]["name"]
        t = e.get("tags", {})
        if _number(t.get("height")) is not None:
            item["heightM"] = _number(t["height"])
        elif _number(t.get("building:levels")) is not None:
            item["levels"] = _number(t["building:levels"])
        context.append(item)

    streets = []
    for e in data.get("elements", []):
        kind = e.get("tags", {}).get("highway")
        if kind in STREET_WIDTH_M and len(e.get("geometry", [])) >= 2:
            streets.append({"line": _ring(e), "widthM": STREET_WIDTH_M[kind], "name": e["tags"].get("name", "")})

    fields: dict = {"footprint": _ring(subject), "context": context, "streets": streets, "osmWay": subject["id"]}
    if _number(tags.get("building:levels")) is not None:
        fields["floors"] = int(_number(tags["building:levels"]))  # type: ignore[arg-type]
    if _number(tags.get("height")) is not None:
        fields["heightM"] = _number(tags["height"])
    if tags.get("name"):
        fields["osmName"] = tags["name"]
    return fields


def overpass_query(lat: float, lng: float, radius: int = SEARCH_RADIUS_M) -> str:
    return (
        f"[out:json];(way(around:{radius},{lat},{lng})[\"building\"];"
        f"way(around:{radius},{lat},{lng})[\"highway\"~\"^(primary|secondary|tertiary|residential|unclassified|pedestrian)$\"];"
        f");out tags geom;"
    )


def autofill(place: str | None = None, lat: float | None = None, lng: float | None = None,
             fetch: Fetch | None = None, cache_dir: Path | None = None, building_id: int | None = None) -> dict:
    """Project fields for a building named by ``place`` (a name or address) or by coordinates."""
    fetch = fetch or (lambda url, params: http_fetch(url, params, cache_dir))
    if lat is None or lng is None:
        if not place:
            raise ValueError("give a place name or coordinates")
        lat, lng = geocode(place, fetch)
    data = fetch(OVERPASS, {"data": overpass_query(lat, lng)})
    fields = parse_overpass(data, lat, lng, building_id)  # type: ignore[arg-type]
    fields["location"] = [round(lat, 6), round(lng, 6)]
    return fields
