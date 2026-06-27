# glinet-registry

Community device-profile registry for GL.iNet routers — firmware API capability data, fully decoupled from the `glinet-profiler` package.

## What this is

`registry/devices/` holds one sanitized JSON profile per device+firmware combination. `registry/index.json` is a generated manifest summarising available method counts per device, kept in sync by `scripts/build_manifest.py`.

## How to contribute

**Option 1 — via the launcher:** Run `gli4py` against your device, export a sanitized profile (no MAC addresses, no credentials), and open a pull request adding the file under `registry/devices/<model>_<firmware>.json`.

**Option 2 — via the issue form:** Open an issue using the Device Profile submission template and paste the sanitized JSON output.

## Keeping `index.json` in sync

After adding or editing a device profile, regenerate the manifest:

```bash
python scripts/build_manifest.py
```

CI enforces that `index.json` matches the device files (`python scripts/build_manifest.py --check`). Pull requests that add a device file without regenerating the manifest will fail CI.

## Tooling

- `tools/registry_lib.py` — pure stdlib helpers: `device_id`, `validate_profile`, `build_manifest`
- `scripts/build_manifest.py` — rebuild or `--check` the manifest
- `scripts/ingest.py` — validate a submission file, write it, and rebuild the manifest
- `tests/` — `uvx pytest -q`
