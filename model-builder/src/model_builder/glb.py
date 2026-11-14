"""Writes a GLB (binary glTF 2.0) file with the standard library only.

For now the model is a gray box: one solid block that fills the bounding box.
Coordinates follow the contract: meters, +Y up, +X east, -Z north.
"""

import json
import struct

from .contract import BoundingBox

_MAGIC = 0x46546C67  # "glTF"
_JSON_CHUNK = 0x4E4F534A  # "JSON"
_BIN_CHUNK = 0x004E4942  # "BIN\0"
_GRAY = [0.55, 0.55, 0.55, 1.0]


def _box_geometry(box: BoundingBox) -> tuple[bytes, bytes, list[float], list[float]]:
    """Return (positions, indices, min, max) for an axis-aligned box as triangles."""
    (x0, y0, z0), (x1, y1, z1) = box.min, box.max
    corners = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),  # back face, z0
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),  # front face, z1
    ]
    faces = [
        (0, 2, 1), (0, 3, 2),  # back
        (4, 5, 6), (4, 6, 7),  # front
        (0, 4, 7), (0, 7, 3),  # left
        (1, 2, 6), (1, 6, 5),  # right
        (3, 7, 6), (3, 6, 2),  # top
        (0, 1, 5), (0, 5, 4),  # bottom
    ]
    positions = b"".join(struct.pack("<3f", *corner) for corner in corners)
    indices = b"".join(struct.pack("<3H", *face) for face in faces)
    lo = [min(c[i] for c in corners) for i in range(3)]
    hi = [max(c[i] for c in corners) for i in range(3)]
    return positions, indices, lo, hi


def box_glb(box: BoundingBox, name: str) -> bytes:
    """Return a GLB file (bytes) holding a gray box that covers ``box``."""
    positions, indices, lo, hi = _box_geometry(box)
    # Pad each buffer view to a 4-byte boundary, as the glTF spec requires.
    index_pad = (-len(indices)) % 4
    indices_padded = indices + b"\x00" * index_pad
    binary = positions + indices_padded

    gltf = {
        "asset": {"version": "2.0", "generator": "model-builder (gray box)"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [
            {
                "primitives": [
                    {
                        "attributes": {"POSITION": 0},
                        "indices": 1,
                        "material": 0,
                    }
                ]
            }
        ],
        "materials": [
            {
                "pbrMetallicRoughness": {"baseColorFactor": _GRAY, "metallicFactor": 0.0, "roughnessFactor": 0.9},
                "doubleSided": True,
            }
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,  # FLOAT
                "count": 8,
                "type": "VEC3",
                "min": lo,
                "max": hi,
            },
            {"bufferView": 1, "componentType": 5123, "count": 36, "type": "SCALAR"},  # UNSIGNED_SHORT
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(positions), "target": 34962},
            {"buffer": 0, "byteOffset": len(positions), "byteLength": len(indices), "target": 34963},
        ],
        "buffers": [{"byteLength": len(binary)}],
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((-len(json_bytes)) % 4)  # JSON chunk is padded with spaces

    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    out = bytearray()
    out += struct.pack("<III", _MAGIC, 2, total)
    out += struct.pack("<II", len(json_bytes), _JSON_CHUNK) + json_bytes
    out += struct.pack("<II", len(binary), _BIN_CHUNK) + binary
    return bytes(out)
