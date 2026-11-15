"""Command line entry point.

    uv run model-builder build demo-project
    uv run model-builder serve
"""

import argparse
import sys
from pathlib import Path

from .build import build_model
from .paths import output_dir, project_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="model-builder")
    commands = parser.add_subparsers(dest="command", required=True)

    build = commands.add_parser("build", help="build the model for a project in data/")
    build.add_argument("project_slug")
    build.add_argument("--out", type=Path, help="output folder (default: public/models/<project_slug>)")

    photos = commands.add_parser("from-photos", help="build a model from reference photos and a place name or coordinates")
    photos.add_argument("images", type=Path, help="folder of reference photos (name each by the side it shows, if known)")
    photos.add_argument("--place", help="building name or address, to pull the outline and surroundings from OpenStreetMap")
    photos.add_argument("--lat", type=float)
    photos.add_argument("--lng", type=float)
    photos.add_argument("--floors", type=int, help="override or supply the floor count")
    photos.add_argument("--height", type=float, help="known height in meters")
    photos.add_argument("--out", type=Path, default=Path("from-photos-out"), help="output folder (default: ./from-photos-out)")

    serve = commands.add_parser("serve", help="run the HTTP service the web app calls")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)

    args = parser.parse_args(argv)

    if args.command == "serve":
        import uvicorn

        uvicorn.run("model_builder.api:app", host=args.host, port=args.port)
        return 0

    if args.command == "from-photos":
        return _from_photos(args)

    source = project_dir(args.project_slug)
    if not source.is_dir():
        print(f"model-builder: no project folder at {source}", file=sys.stderr)
        return 2
    out = args.out or output_dir(args.project_slug)
    out.mkdir(parents=True, exist_ok=True)
    try:
        metadata = build_model(source, out)
    except NotImplementedError as error:
        print(f"model-builder: {error}", file=sys.stderr)
        return 1
    print(f"Built {out / metadata.file} (version {metadata.version})")
    return 0


def _from_photos(args: argparse.Namespace) -> int:
    """Photos + a place name -> project.json + model. Every value is printed with where it came from."""
    import json
    import shutil

    from .osm import autofill
    from .photos import read_photos

    fields: dict = {"slug": "from-photos"}
    sources: dict[str, str] = {}
    hint = None
    if args.place or args.lat is not None:
        found = autofill(args.place, args.lat, args.lng, cache_dir=args.out / "cache")
        fields.update(found)
        sources.update({k: "OpenStreetMap" for k in found})
        hint = f"The building is {found.get('osmName') or args.place}."
    photo_fields, report = read_photos(args.images, address_hint=hint)
    for key, value in photo_fields.items():
        if key not in fields:  # OSM and explicit values win over a photo reading
            fields[key] = value
            sources[key] = report["provenance"][key]
    if args.floors is not None:
        fields["floors"], sources["floors"] = args.floors, "given"
    if args.height is not None:
        fields["heightM"], sources["heightM"] = args.height, "given"
    if "typology" not in fields:
        fields["typology"] = "tower" if fields.get("podiumFloors") or fields.get("core") else "block"
        sources["typology"] = "inferred (default from what the photos show)"

    project = args.out / "project"
    (project / "images").mkdir(parents=True, exist_ok=True)
    for image in args.images.iterdir():
        if image.is_file():
            shutil.copy2(image, project / "images" / image.name)
    (project / "project.json").write_text(json.dumps(fields, indent=1), encoding="utf-8")
    for key, source in sources.items():
        print(f"  {key}: {source}", file=sys.stderr)
    metadata = build_model(project, args.out)
    print(f"Built {args.out / metadata.file} (version {metadata.version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
