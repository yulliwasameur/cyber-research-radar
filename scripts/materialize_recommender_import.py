#!/usr/bin/env python3
"""Materialize the owner-supplied IEEE Publication Recommender snapshot.

The repository stores small, integrity-checked LZMA/Base64 parts so the complete
legacy-XLS import remains reproducible without committing opaque binary files.
Generated JSON/CSV files are deterministic and are committed by the refresh job.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import lzma
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ASSET_DIR = ROOT / "data" / "imports" / "ieee_recommender_20260829"
DEFAULT_MANIFEST = DEFAULT_ASSET_DIR / "assets.json"


class SnapshotError(RuntimeError):
    pass


def write_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(payload)
    os.replace(temporary, path)


def materialize(manifest_path: Path, check_only: bool = False) -> dict[str, Any]:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotError(f"Cannot read snapshot manifest {manifest_path}: {exc}") from exc
    if manifest.get("format") != "cyberresearch-radar-import-snapshot-v1":
        raise SnapshotError("Unsupported snapshot format")
    assets = manifest.get("assets")
    if not isinstance(assets, dict) or not assets:
        raise SnapshotError("Snapshot has no assets")

    asset_dir = manifest_path.parent
    report: dict[str, Any] = {"manifest": str(manifest_path), "assets": []}
    for relative_path, metadata in assets.items():
        if not isinstance(relative_path, str) or not isinstance(metadata, dict):
            raise SnapshotError("Invalid asset metadata")
        if metadata.get("encoding") != "base64+lzma":
            raise SnapshotError(f"Unsupported encoding for {relative_path}")
        parts = metadata.get("parts")
        if not isinstance(parts, list) or not parts:
            raise SnapshotError(f"No parts declared for {relative_path}")
        try:
            encoded = "".join(
                (asset_dir / str(part)).read_text(encoding="ascii").strip()
                for part in parts
            )
            compressed = base64.b64decode(encoded, validate=True)
            payload = lzma.decompress(compressed)
        except (OSError, ValueError, lzma.LZMAError) as exc:
            raise SnapshotError(f"Cannot decode {relative_path}: {exc}") from exc

        actual_hash = hashlib.sha256(payload).hexdigest()
        if actual_hash != metadata.get("sha256"):
            raise SnapshotError(f"SHA-256 mismatch for {relative_path}")
        if len(payload) != metadata.get("bytes"):
            raise SnapshotError(f"Size mismatch for {relative_path}")
        output = ROOT / relative_path
        changed = not output.exists() or output.read_bytes() != payload
        if changed and not check_only:
            write_atomic(output, payload)
        report["assets"].append({
            "path": relative_path,
            "bytes": len(payload),
            "sha256": actual_hash,
            "changed": changed,
            "written": changed and not check_only,
        })
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--check", action="store_true", help="verify without writing")
    args = parser.parse_args()
    try:
        report = materialize(args.manifest.resolve(), args.check)
    except SnapshotError as exc:
        print(f"Snapshot materialization failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
