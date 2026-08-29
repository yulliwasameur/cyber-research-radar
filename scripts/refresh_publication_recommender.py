#!/usr/bin/env python3
"""Validate and monitor imported publication-recommender event records.

Imported candidates stay conservative: a deadline is promoted to ``verified``
only when it remains visible on the official evidence page. Missing or blocked
pages are reported, never converted into invented dates or rankings.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import ssl
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "publication_recommender_events.json"
REPORT_PATH = ROOT / "data" / "publication_recommender_watch_report.json"
USER_AGENT = "CyberResearchRadar/3.2 (+https://github.com/yulliwasameur/cyber-research-radar)"
MAX_BYTES = 2_500_000
ALLOWED_TYPES = {"conference", "workshop"}
ALLOWED_STATUSES = {"verified", "watchlist", "needs-review", "closed"}
ALLOWED_CONTINENTS = {"Africa", "Asia", "Europe", "North America", "South America", "Oceania", "Global"}
ALLOWED_MODES = {"onsite", "hybrid", "online", "multiple", "unspecified"}


def load_json(path: Path, fallback: Any) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else fallback


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return urlparse(value).scheme in {"http", "https"}
    except ValueError:
        return False


def validate(records: Any) -> list[dict[str, Any]]:
    if not isinstance(records, list):
        raise ValueError("publication_recommender_events.json must contain an array")
    required = {
        "id", "title", "type", "summary", "topics", "country", "continent", "mode",
        "officialUrl", "evidenceUrl", "rankings", "status", "verifiedAt",
    }
    ids: set[str] = set()
    errors: list[str] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            errors.append(f"record {index}: expected object")
            continue
        record_id = str(record.get("id", f"record-{index}"))
        missing = sorted(required - set(record))
        if missing:
            errors.append(f"{record_id}: missing {', '.join(missing)}")
        if record_id in ids:
            errors.append(f"duplicate id: {record_id}")
        ids.add(record_id)
        if record.get("type") not in ALLOWED_TYPES:
            errors.append(f"{record_id}: invalid type")
        if record.get("status") not in ALLOWED_STATUSES:
            errors.append(f"{record_id}: invalid status")
        if record.get("continent") not in ALLOWED_CONTINENTS:
            errors.append(f"{record_id}: invalid continent")
        if record.get("mode") not in ALLOWED_MODES:
            errors.append(f"{record_id}: invalid mode")
        if not isinstance(record.get("topics"), list) or not record.get("topics"):
            errors.append(f"{record_id}: topics must be a non-empty list")
        if not isinstance(record.get("rankings"), list):
            errors.append(f"{record_id}: rankings must be a list")
        for field in ("officialUrl", "evidenceUrl", "cfpUrl"):
            if record.get(field) is not None and not is_http_url(record.get(field)):
                errors.append(f"{record_id}: invalid {field}")
        for field in ("deadline", "eventStart", "eventEnd", "verifiedAt"):
            if record.get(field):
                try:
                    date.fromisoformat(str(record[field])[:10])
                except ValueError:
                    errors.append(f"{record_id}: invalid {field}")
    if errors:
        raise ValueError("\n".join(errors))
    return records


def fetch(url: str) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/pdf"})
    context = ssl.create_default_context()
    with urlopen(request, timeout=24, context=context) as response:
        body = response.read(MAX_BYTES)
        return {
            "httpStatus": response.status,
            "finalUrl": response.geturl(),
            "contentType": response.headers.get_content_type(),
            "contentSha256": hashlib.sha256(body).hexdigest(),
            "bytesRead": len(body),
            "text": body.decode(response.headers.get_content_charset() or "utf-8", errors="replace"),
        }


def date_variants(value: str) -> tuple[str, ...]:
    parsed = date.fromisoformat(value[:10])
    return (
        parsed.isoformat(),
        f"{parsed.strftime('%B')} {parsed.day}, {parsed.year}",
        f"{parsed.day} {parsed.strftime('%B')} {parsed.year}",
        f"{parsed.strftime('%b')} {parsed.day}, {parsed.year}",
        f"{parsed.day} {parsed.strftime('%b')} {parsed.year}",
    )


def deadline_visible(text: str, deadline: str | None) -> bool:
    if not deadline:
        return False
    plain = re.sub(r"\s+", " ", text).lower()
    return any(variant.lower() in plain for variant in date_variants(deadline))


def refresh(offline: bool) -> int:
    records = validate(load_json(DATA_PATH, []))
    run_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if offline:
        print(json.dumps({"runAt": run_at, "mode": "offline-validation", "records": len(records)}, indent=2))
        return 0

    previous = load_json(REPORT_PATH, {})
    old_hashes = {entry.get("url"): entry.get("contentSha256") for entry in previous.get("sources", [])}
    today = datetime.now(timezone.utc).date().isoformat()
    tasks: dict[Any, tuple[dict[str, Any], str]] = {}
    sources: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        for record in records:
            url = record.get("evidenceUrl") or record["officialUrl"]
            tasks[executor.submit(fetch, url)] = (record, url)
        for future in as_completed(tasks):
            record, url = tasks[future]
            entry: dict[str, Any] = {"recordId": record["id"], "url": url}
            try:
                result = future.result()
                text = result.pop("text")
                entry.update(result)
                entry["contentChanged"] = old_hashes.get(url) not in {None, entry["contentSha256"]}
                visible = deadline_visible(text, record.get("deadline"))
                entry["deadlineStillPresent"] = visible
                if visible and record.get("deadline"):
                    record["status"] = "verified"
                    record["verifiedAt"] = today
            except HTTPError as exc:
                if exc.code in {401, 403, 429}:
                    entry["blocked"] = f"HTTP {exc.code}: automated retrieval restricted"
                else:
                    entry["error"] = f"HTTPError: {exc}"
            except (URLError, TimeoutError, UnicodeError, ValueError) as exc:
                entry["error"] = f"{type(exc).__name__}: {exc}"
            sources.append(entry)

    sources.sort(key=lambda item: item["recordId"])
    report = {
        "runAt": run_at,
        "mode": "network-monitor",
        "records": len(records),
        "verified": sum(record.get("status") == "verified" for record in records),
        "needsReview": sum(record.get("status") == "needs-review" for record in records),
        "sourceErrors": sum("error" in item for item in sources),
        "sourceBlocks": sum("blocked" in item for item in sources),
        "sourcesChanged": sum(bool(item.get("contentChanged")) for item in sources),
        "reviewRequired": [item for item in sources if item.get("contentChanged") or item.get("error") or item.get("blocked")],
        "sources": sources,
    }
    write_json(DATA_PATH, records)
    write_json(REPORT_PATH, report)
    print(json.dumps({key: report[key] for key in ("runAt", "records", "verified", "needsReview", "sourceErrors", "sourceBlocks", "sourcesChanged")}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    try:
        return refresh(args.offline)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"Publication recommender validation failed:\n{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
