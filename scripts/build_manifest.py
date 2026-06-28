"""Rebuild generated registry artifacts (index.json + per-device OpenRPC) or --check them."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.registry_lib import build_manifest, to_openrpc  # noqa: E402

_REG = Path(__file__).resolve().parent.parent / "registry"


def _artifacts(reg: Path) -> dict[str, str]:
    """Return {relative-path: content} for every generated file (manifest + OpenRPC docs)."""
    profiles = [
        json.loads(p.read_text(encoding="utf-8")) for p in sorted((reg / "devices").glob("*.json"))
    ]
    out = {"index.json": json.dumps(build_manifest(profiles), indent=2, sort_keys=True) + "\n"}
    for profile in profiles:
        out[f"openrpc/{profile['id']}.openrpc.json"] = (
            json.dumps(to_openrpc(profile), indent=2, sort_keys=True) + "\n"
        )
    return out


def regenerate(reg: Path) -> int:
    """Write all generated artifacts; prune stale OpenRPC files. Returns the file count."""
    arts = _artifacts(reg)
    (reg / "openrpc").mkdir(exist_ok=True)
    expected = {p for p in arts if p.startswith("openrpc/")}
    for stale in (reg / "openrpc").glob("*.json"):
        if f"openrpc/{stale.name}" not in expected:
            stale.unlink()
    for rel, content in arts.items():
        (reg / rel).write_text(content, encoding="utf-8")
    return len(arts)


def check(reg: Path) -> str | None:
    """Return an error message if any generated file is stale/missing/extra, else None."""
    arts = _artifacts(reg)
    for rel, content in arts.items():
        path = reg / rel
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            return f"{rel} is out of date"
    expected = {p for p in arts if p.startswith("openrpc/")}
    extra = {f"openrpc/{f.name}" for f in (reg / "openrpc").glob("*.json")} - expected
    if extra:
        return f"stale generated files: {sorted(extra)}"
    return None


def main(argv: list[str] | None = None) -> int:
    """Rebuild or --check the generated registry artifacts (manifest + OpenRPC)."""
    parser = argparse.ArgumentParser(description="Build/check generated registry artifacts.")
    parser.add_argument("--check", action="store_true", help="fail if any generated file is stale")
    args = parser.parse_args(argv)
    if args.check:
        error = check(_REG)
        if error:
            print(f"{error} — run scripts/build_manifest.py", file=sys.stderr)
            return 1
        return 0
    count = regenerate(_REG)
    print(f"wrote {count} generated file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
