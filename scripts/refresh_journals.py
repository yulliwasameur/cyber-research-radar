#!/usr/bin/env python3
"""Validate and monitor official journal evidence pages.

The watcher records source health and content changes. It never invents or
silently rewrites APCs, editorial timelines, metrics or rankings; a changed
source is queued for human review in the public report.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import ssl
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
JOURNALS_PATH = ROOT / "data" / "journals.json"
REPORT_PATH = ROOT / "data" / "journal_watch_report.json"
USER_AGENT = "CyberResearchRadar/1.0 (+https://github.com/yulliwasameur/cyber-research-radar)"
MAX_BYTES = 2_500_000


def load_json(path: Path, fallback: Any) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else fallback


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_http_url(value: Any) -> bool:
    return isinstance(value, str) and urlparse(value).scheme in {"http", "https"}


def validate(journals: list[dict[str, Any]]) -> None:
    required = {
        "id", "title", "acronym", "publisher", "society", "summary", "scope", "topics",
        "officialUrl", "authorGuidelinesUrl", "submissionUrl", "issn", "accessModel",
        "apc", "submissionFee", "otherCharges", "waivers", "timeline",
        "publicationFrequency", "peerReviewModel", "articleTypes", "indexing", "metrics",
        "rankings", "acceptanceRate", "dataCodePolicy", "dataCodePolicyUrl", "ethicsUrl",
        "status", "caution", "notes", "verifiedAt",
    }
    allowed_access = {"diamond", "gold", "hybrid", "subscription", "other"}
    allowed_status = {"active", "caution"}
    ids: set[str] = set()
    errors: list[str] = []
    for index, journal in enumerate(journals):
        journal_id = str(journal.get("id", f"record-{index}"))
        missing = sorted(required - set(journal))
        if missing:
            errors.append(f"{journal_id}: missing {', '.join(missing)}")
        if journal_id in ids:
            errors.append(f"duplicate journal id: {journal_id}")
        ids.add(journal_id)
        if journal.get("accessModel") not in allowed_access:
            errors.append(f"{journal_id}: invalid access model")
        if journal.get("status") not in allowed_status:
            errors.append(f"{journal_id}: invalid status")
        for field in ("id", "title", "publisher", "summary", "scope"):
            if not isinstance(journal.get(field), str) or not journal[field].strip():
                errors.append(f"{journal_id}: {field} must be a non-empty string")
        for field, allow_empty in (("topics", False), ("issn", True), ("articleTypes", True), ("indexing", True)):
            value = journal.get(field)
            if not isinstance(value, list) or (not allow_empty and not value) or not all(isinstance(entry, str) and entry.strip() for entry in value):
                errors.append(f"{journal_id}: {field} must be {'a non-empty ' if not allow_empty else 'a '}string list")
        for issn in [*(journal.get("issn") or []), *(journal.get("formerIssns") or [])]:
            if not re.fullmatch(r"\d{4}-[\dX]{4}", issn):
                errors.append(f"{journal_id}: invalid ISSN {issn}")
        for field in ("officialUrl", "authorGuidelinesUrl", "submissionUrl", "dataCodePolicyUrl", "ethicsUrl"):
            if journal.get(field) is not None and not is_http_url(journal[field]):
                errors.append(f"{journal_id}: invalid {field}")
        for block_name in ("apc", "submissionFee"):
            block = journal.get(block_name)
            if block_name == "apc" and not isinstance(block, dict):
                errors.append(f"{journal_id}: APC must be an object")
                continue
            if block is not None and not isinstance(block, dict):
                errors.append(f"{journal_id}: {block_name} must be an object or null")
                continue
            if block:
                amount = block.get("amount")
                currency = block.get("currency")
                if amount is not None and (not isinstance(amount, (int, float)) or isinstance(amount, bool) or amount < 0):
                    errors.append(f"{journal_id}: invalid {block_name} amount")
                if currency is not None and (not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency)):
                    errors.append(f"{journal_id}: invalid {block_name} currency")
                if block.get("sourceUrl") is not None and not is_http_url(block["sourceUrl"]):
                    errors.append(f"{journal_id}: invalid {block_name} source")
        timeline = journal.get("timeline") or {}
        for field in ("firstDecisionDays", "reviewDays", "submissionToAcceptanceDays", "acceptanceToPublicationDays"):
            value = timeline.get(field)
            if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0):
                errors.append(f"{journal_id}: invalid timeline {field}")
        if timeline.get("sourceUrl") is not None and not is_http_url(timeline["sourceUrl"]):
            errors.append(f"{journal_id}: invalid timeline source")
        if timeline.get("measureType") not in {"median", "target", "scheduled-cycle", "not-published"}:
            errors.append(f"{journal_id}: invalid timeline measure type")
        for evidence in [*(journal.get("metrics") or []), *(journal.get("rankings") or [])]:
            if not is_http_url(evidence.get("sourceUrl")):
                errors.append(f"{journal_id}: invalid metric/ranking source")
    if errors:
        raise ValueError("\n".join(errors))


def source_urls(journal: dict[str, Any]) -> list[tuple[str, str]]:
    candidates = [
        ("homepage", journal.get("officialUrl")),
        ("author-guidelines", journal.get("authorGuidelinesUrl")),
        ("submission-information", journal.get("submissionUrl")),
        ("apc", (journal.get("apc") or {}).get("sourceUrl")),
        ("submission-fee", (journal.get("submissionFee") or {}).get("sourceUrl")),
        ("timeline", (journal.get("timeline") or {}).get("sourceUrl")),
        ("data-code", journal.get("dataCodePolicyUrl")),
        ("ethics", journal.get("ethicsUrl")),
    ]
    candidates.extend((f"metric:{entry.get('name', 'unknown')}", entry.get("sourceUrl")) for entry in journal.get("metrics") or [])
    candidates.extend((f"ranking:{entry.get('framework', 'unknown')}", entry.get("sourceUrl")) for entry in journal.get("rankings") or [])
    seen: set[str] = set()
    result: list[tuple[str, str]] = []
    for role, url in candidates:
        if not is_http_url(url) or url in seen:
            continue
        seen.add(url)
        result.append((role, url))
    return result


def fetch(url: str) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/pdf"})
    context = ssl.create_default_context()
    with urlopen(request, timeout=22, context=context) as response:
        body = response.read(MAX_BYTES)
        return {
            "httpStatus": response.status,
            "finalUrl": response.geturl(),
            "contentType": response.headers.get_content_type(),
            "contentSha256": hashlib.sha256(body).hexdigest(),
            "bytesRead": len(body),
        }


def refresh(offline: bool) -> int:
    journals: list[dict[str, Any]] = load_json(JOURNALS_PATH, [])
    validate(journals)
    run_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if offline:
        print(json.dumps({"runAt": run_at, "mode": "offline-validation", "journals": len(journals)}, indent=2))
        return 0

    previous = load_json(REPORT_PATH, {})
    old_hashes = {entry.get("url"): entry.get("contentSha256") for entry in previous.get("sources", [])}
    tasks: list[tuple[str, str, str]] = []
    for journal in journals:
        tasks.extend((journal["id"], role, url) for role, url in source_urls(journal))

    sources: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(fetch, url): (journal_id, role, url) for journal_id, role, url in tasks}
        for future in as_completed(futures):
            journal_id, role, url = futures[future]
            entry: dict[str, Any] = {"journalId": journal_id, "role": role, "url": url}
            try:
                entry.update(future.result())
                old_hash = old_hashes.get(url)
                entry["contentChanged"] = old_hash is not None and old_hash != entry["contentSha256"]
            except HTTPError as exc:
                if exc.code in {401, 403, 429}:
                    entry["blocked"] = f"HTTP {exc.code}: automated retrieval restricted by publisher"
                else:
                    entry["error"] = f"HTTPError: {exc}"
            except (URLError, TimeoutError, UnicodeError, ValueError) as exc:
                entry["error"] = f"{type(exc).__name__}: {exc}"
            sources.append(entry)

    sources.sort(key=lambda entry: (entry["journalId"], entry["role"], entry["url"]))
    report = {
        "runAt": run_at,
        "mode": "network-monitor",
        "journals": len(journals),
        "sourcesChecked": len(sources),
        "sourceErrors": sum("error" in entry for entry in sources),
        "sourceBlocks": sum("blocked" in entry for entry in sources),
        "sourcesChanged": sum(bool(entry.get("contentChanged")) for entry in sources),
        "reviewRequired": [entry for entry in sources if entry.get("contentChanged") or entry.get("error") or entry.get("blocked")],
        "sources": sources,
    }
    write_json(REPORT_PATH, report)
    print(json.dumps({key: report[key] for key in ("runAt", "mode", "journals", "sourcesChecked", "sourceErrors", "sourceBlocks", "sourcesChanged")}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="validate structured journal records without network access")
    args = parser.parse_args()
    try:
        return refresh(args.offline)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"Journal data validation failed:\n{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
