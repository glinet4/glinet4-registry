"""Self-contained registry helpers (stdlib only): id slug, validation, manifest."""

import json
import re
from typing import Any

_SLUG = re.compile(r"[^a-z0-9.]+")
_MAC_RE = re.compile(r"(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}")
_PRESENT = ("available", "needs_params")
_REQUIRED = ("model", "firmware_version", "services")
_IDENTIFIERS = ("mac", "sn", "sn_bak")


def device_id(model: str, firmware: str) -> str:
    """Slug `model_firmware`."""
    model_slug = _SLUG.sub("-", model.lower()).strip("-")
    firmware_slug = _SLUG.sub("-", firmware.lower()).strip("-")
    return f"{model_slug}_{firmware_slug}"


def validate_profile(data: Any) -> str | None:  # pylint: disable=too-many-return-statements
    """Return an error message if `data` is not a clean sanitized profile, else None."""
    if not isinstance(data, dict):
        return "submission is not a JSON object"
    for key in _REQUIRED:
        if key not in data:
            return f"missing required key: {key}"
    for key in ("model", "firmware_version"):
        if not isinstance(data[key], str) or not data[key].strip():
            return f"'{key}' must be a non-empty string"
    if not isinstance(data["services"], dict):
        return "'services' must be an object"
    for ident in _IDENTIFIERS:
        if ident in data:
            return f"profile contains a device identifier ({ident}); submit a sanitized profile, not a raw report"
    for service, methods in data["services"].items():
        if not isinstance(methods, dict):
            return f"service '{service}' must be an object"
        for method, rec in methods.items():
            if not isinstance(rec, dict):
                return f"method '{service}.{method}' must be an object"
            if "value" in rec:
                return f"method '{service}.{method}' contains a response value; submit a sanitized profile"
    if _MAC_RE.search(json.dumps(data)):
        return "profile contains a MAC-address-like value; submit a sanitized profile"
    return None


def build_manifest(profiles: list[dict[str, Any]]) -> dict[str, Any]:
    """Build the manifest (per-device id/model/firmware + present-method counts)."""
    entries: list[dict[str, Any]] = []
    for dev in profiles:
        present = [
            rec
            for methods in dev["services"].values()
            for rec in methods.values()
            if rec.get("status") in _PRESENT
        ]
        service_count = sum(
            1
            for methods in dev["services"].values()
            if any(rec.get("status") in _PRESENT for rec in methods.values())
        )
        entries.append(
            {
                "id": dev["id"],
                "model": dev.get("model", "unknown"),
                "firmware_version": dev.get("firmware_version", "unknown"),
                "service_count": service_count,
                "available_count": len(present),
                "not_wrapped_count": sum(1 for rec in present if rec.get("covered_by") is None),
            }
        )
    entries.sort(key=lambda entry: (entry["model"], entry["firmware_version"]))
    return {"devices": entries}
