"""Hash locking for the reviewed gold corpus."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, cast

LOCK_NAME = "LOCK.json"


def _files(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*")
        if path.is_file() and path.name != LOCK_NAME and "audio" not in path.parts
    )


def hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in _files(root)
    }


def read_lock(root: Path) -> dict[str, Any]:
    path = root / LOCK_NAME
    if not path.is_file():
        raise ValueError(f"Gold lock is missing: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("version"), int):
        raise ValueError(f"Invalid gold lock: {path}")  # noqa: TRY004 - external file validation
    return cast(dict[str, Any], value)


def verify_lock(root: Path) -> None:
    lock = read_lock(root)
    expected = lock.get("files")
    actual = hashes(root)
    if expected != actual:
        changed = sorted(set(actual) | set(expected or {}))
        changed = [name for name in changed if actual.get(name) != (expected or {}).get(name)]
        raise ValueError("Gold lock mismatch: " + ", ".join(changed))


def write_lock(root: Path, *, bump: bool = False) -> int:
    path = root / LOCK_NAME
    version = 1
    if path.exists():
        version = int(read_lock(root)["version"]) + (1 if bump else 0)
    payload = {"version": version, "algorithm": "sha256", "files": hashes(root)}
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return version
