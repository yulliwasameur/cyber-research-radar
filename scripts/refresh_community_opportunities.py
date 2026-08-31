#!/usr/bin/env python3
"""Validate and monitor manually curated community CFP records."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import refresh_publication_recommender as watcher

ROOT = Path(__file__).resolve().parents[1]
watcher.DATA_PATH = ROOT / "data" / "community_opportunities.json"
watcher.REPORT_PATH = ROOT / "data" / "community_watch_report.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="validate local community records without network access")
    args = parser.parse_args()
    try:
        return watcher.refresh(args.offline)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"Community opportunity validation failed:\n{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
