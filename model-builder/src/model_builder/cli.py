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

    serve = commands.add_parser("serve", help="run the HTTP service the web app calls")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)

    args = parser.parse_args(argv)

    if args.command == "serve":
        import uvicorn

        uvicorn.run("model_builder.api:app", host=args.host, port=args.port)
        return 0

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


if __name__ == "__main__":
    raise SystemExit(main())
