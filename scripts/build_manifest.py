"""Rebuild registry/index.json from registry/devices/*.json (or --check it's in sync)."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.registry_lib import build_manifest  # noqa: E402

_REG = Path(__file__).resolve().parent.parent / "registry"


def main(argv: list[str] | None = None) -> int:
    """Rebuild or --check the manifest."""
    parser = argparse.ArgumentParser(description="Build/check the registry manifest.")
    parser.add_argument("--check", action="store_true", help="fail if index.json is out of date")
    args = parser.parse_args(argv)
    profiles = [
        json.loads(p.read_text(encoding="utf-8")) for p in sorted((_REG / "devices").glob("*.json"))
    ]
    manifest = json.dumps(build_manifest(profiles), indent=2, sort_keys=True) + "\n"
    index = _REG / "index.json"
    if args.check:
        if index.read_text(encoding="utf-8") != manifest:
            print("index.json is out of date — run scripts/build_manifest.py", file=sys.stderr)
            return 1
        return 0
    index.write_text(manifest, encoding="utf-8")
    print(f"wrote {len(profiles)} device(s) to {index}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
