#!/usr/bin/env python3
"""Refresh CyberResearch Radar from traceable public sources.

The refresh is deliberately conservative: an existing deadline is only marked
verified when the official evidence page still contains that date. Ranking data
is never inferred or rewritten by this process.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import ssl
import sys
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OPPORTUNITIES_PATH = DATA_DIR / "opportunities.json"
CRYPTO_OPPORTUNITIES_PATH = DATA_DIR / "crypto_opportunities.json"
CYBER_OPPORTUNITIES_PATH = DATA_DIR / "cyber_opportunities.json"
CATALOGUE_EVENTS_PATH = DATA_DIR / "catalogue_events.json"
RECORD_PATHS = (OPPORTUNITIES_PATH, CRYPTO_OPPORTUNITIES_PATH, CYBER_OPPORTUNITIES_PATH, CATALOGUE_EVENTS_PATH)
REGISTRY_PATH = DATA_DIR / "source_registry.json"
REPORT_PATH = DATA_DIR / "watch_report.json"
DISCOVERED_PATH = DATA_DIR / "discovered_links.json"

USER_AGENT = "CyberResearchRadar/1.0 (+https://github.com/yulliwasameur/cyber-research-radar)"
MAX_BYTES = 2_500_000
CALL_TERMS = (
    "call for papers", "call for chapters", "call for proposals", "special issue",
    "submission", "conference", "workshop", "doctoral", "phd", "grant", "school", "cfp",
)
TOPIC_TERMS = (
    "cyber", "security", "privacy", "crypt", "post-quantum", "quantum", "forensic",
    "trust", "blockchain", "internet of things", "iot", "network", "malware", "threat",
    "artificial intelligence", "machine learning", "digital investigation",
)
MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|November|December|"
    "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
)
DATE_PATTERN = re.compile(
    rf"\b(?:{MONTHS})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,)?\s+20\d{{2}}\b|"
    rf"\b\d{{1,2}}\s+(?:{MONTHS})\.?\s+20\d{{2}}\b|"
    r"\b20\d{2}-\d{2}-\d{2}\b",
    re.IGNORECASE,
)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self.times: list[str] = []
        self._href: str | None = None
        self._anchor_parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag in {"script", "style", "noscript"}:
            self._ignored_depth += 1
        if self._ignored_depth:
            return
        if tag == "a" and attrs_dict.get("href"):
            self._href = attrs_dict["href"]
            self._anchor_parts = []
        if tag == "time" and attrs_dict.get("datetime"):
            self.times.append(attrs_dict["datetime"] or "")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._ignored_depth:
            self._ignored_depth -= 1
            return
        if tag == "a" and self._href:
            label = " ".join(self._anchor_parts).strip()
            self.links.append((self._href, label))
            self._href = None
            self._anchor_parts = []

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        cleaned = " ".join(data.split())
        if not cleaned:
            return
        self.text_parts.append(cleaned)
        if self._href:
            self._anchor_parts.append(cleaned)


def fetch_page(url: str) -> tuple[str, str, int, str]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    context = ssl.create_default_context()
    with urlopen(request, timeout=25, context=context) as response:
        body = response.read(MAX_BYTES)
        media_type = response.headers.get_content_type()
        if media_type == "application/pdf" or response.geturl().lower().split("?", 1)[0].endswith(".pdf"):
            try:
                from pypdf import PdfReader
            except ImportError as exc:
                raise RuntimeError("PDF evidence requires the pypdf dependency") from exc
            reader = PdfReader(BytesIO(body))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            return text, response.geturl(), response.status, "application/pdf"
        charset = response.headers.get_content_charset() or "utf-8"
        return body.decode(charset, errors="replace"), response.geturl(), response.status, media_type


def parse_page(raw_html: str) -> PageParser:
    parser = PageParser()
    parser.feed(raw_html)
    return parser


def normalized_text(parser: PageParser) -> str:
    return " ".join(html.unescape(" ".join(parser.text_parts)).split())


def date_variants(iso_date: str) -> set[str]:
    parsed = date.fromisoformat(iso_date[:10])
    month = parsed.strftime("%B")
    short_month = parsed.strftime("%b")
    return {
        iso_date[:10].lower(),
        f"{month} {parsed.day}, {parsed.year}".lower(),
        f"{month} {parsed.day} {parsed.year}".lower(),
        f"{parsed.day} {month} {parsed.year}".lower(),
        f"{short_month} {parsed.day}, {parsed.year}".lower(),
        f"{parsed.day} {short_month} {parsed.year}".lower(),
    }


def deadline_contexts(text: str, deadline: str | None) -> list[str]:
    if not deadline:
        return []
    lowered = text.lower()
    date_contexts: list[str] = []
    for variant in date_variants(deadline):
        start = 0
        while True:
            index = lowered.find(variant, start)
            if index < 0:
                break
            date_contexts.append(lowered[max(0, index - 180): min(len(lowered), index + len(variant) + 180)])
            start = index + len(variant)
    deadline_terms = ("deadline", "submission", "submissions due", "paper due", "papers due", "abstract due", "proposal due", "manuscript due", "applications close")
    return [context for context in date_contexts if any(term in context for term in deadline_terms)]


def evidence_contains_deadline(text: str, deadline: str | None) -> bool:
    return bool(deadline_contexts(text, deadline))


def evidence_matches_precision(text: str, deadline: str | None, deadline_timezone: str | None = None) -> bool:
    if not deadline:
        return False
    contexts = deadline_contexts(text, deadline)
    if not contexts:
        return False

    if "T" in deadline:
        parsed = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
        time_variants = {
            parsed.strftime("%H:%M").lower(),
            parsed.strftime("%-I:%M %p").lower(),
            parsed.strftime("%-I %p").lower(),
        }
        contexts = [context for context in contexts if any(value in context for value in time_variants)]
        if not contexts:
            return False

    zone = (deadline_timezone or "").lower()
    if "aoe" in zone and not any("aoe" in context or "anywhere on earth" in context for context in contexts):
        return False
    if zone == "utc" and not any("utc" in context for context in contexts):
        return False
    return True


def candidate_deadlines(text: str) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    lowered = text.lower()
    for keyword in ("deadline", "submission", "paper due", "proposal", "chapter due", "applications close"):
        start = 0
        while True:
            index = lowered.find(keyword, start)
            if index < 0:
                break
            window = text[max(0, index - 70): min(len(text), index + 220)]
            for match in DATE_PATTERN.finditer(window):
                entry = {"keyword": keyword, "dateText": match.group(0), "context": window[:280]}
                if entry not in candidates:
                    candidates.append(entry)
            start = index + len(keyword)
    return candidates[:12]


def stable_link_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def discover_links(base_url: str, parser: PageParser, source_id: str, found_at: str) -> list[dict[str, str]]:
    seen: set[str] = set()
    results: list[dict[str, str]] = []
    base_host = urlparse(base_url).netloc
    for href, label in parser.links:
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        combined = f"{label} {parsed.path}".lower()
        has_call_term = any(term in combined for term in CALL_TERMS)
        has_topic_term = any(term in combined for term in TOPIC_TERMS)
        if not has_call_term or not has_topic_term:
            continue
        canonical = absolute.split("#", 1)[0]
        if canonical in seen:
            continue
        seen.add(canonical)
        results.append({
            "id": stable_link_id(canonical),
            "title": label or parsed.path.rsplit("/", 1)[-1].replace("-", " ").title(),
            "url": canonical,
            "sourceId": source_id,
            "sourceHost": base_host,
            "foundAt": found_at,
            "status": "needs-review",
        })
    return results[:40]


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    rendered = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    path.write_text(rendered, encoding="utf-8")


def validate_records(records: list[dict[str, Any]]) -> None:
    required = {"id", "title", "type", "summary", "topics", "country", "continent", "mode", "officialUrl", "evidenceUrl", "rankings", "status", "verifiedAt"}
    allowed_types = {"conference", "workshop", "book-chapter", "special-issue", "school", "grant", "doctoral-position"}
    allowed_statuses = {"verified", "watchlist", "needs-review", "closed"}
    allowed_continents = {"Africa", "Asia", "Europe", "North America", "South America", "Oceania", "Global"}
    allowed_modes = {"onsite", "hybrid", "online", "multiple", "unspecified"}
    allowed_frameworks = {"ICORE", "CCF", "SJR", "JCR"}
    allowed_ranks = {"A*", "A", "B", "C", "Q1", "Q2", "Q3", "Q4"}
    ids: set[str] = set()
    errors: list[str] = []
    for index, record in enumerate(records):
        missing = sorted(required - set(record))
        if missing:
            errors.append(f"record {index}: missing {', '.join(missing)}")
        record_id = str(record.get("id", ""))
        if record_id in ids:
            errors.append(f"duplicate id: {record_id}")
        ids.add(record_id)
        if record.get("type") not in allowed_types:
            errors.append(f"{record_id}: invalid type")
        if record.get("status") not in allowed_statuses:
            errors.append(f"{record_id}: invalid status")
        if record.get("continent") not in allowed_continents:
            errors.append(f"{record_id}: invalid continent")
        if record.get("mode") not in allowed_modes:
            errors.append(f"{record_id}: invalid mode")
        if not isinstance(record.get("topics"), list) or not record.get("topics"):
            errors.append(f"{record_id}: topics must be a non-empty list")
        for field in ("deadline", "eventStart", "eventEnd", "verifiedAt"):
            if record.get(field):
                try:
                    date.fromisoformat(str(record[field])[:10])
                except ValueError:
                    errors.append(f"{record_id}: invalid {field}")
        for field in ("officialUrl", "evidenceUrl"):
            if record.get(field) and urlparse(str(record[field])).scheme not in {"http", "https"}:
                errors.append(f"{record_id}: invalid {field}")
        for ranking in record.get("rankings", []):
            if ranking.get("framework") not in allowed_frameworks or ranking.get("rank") not in allowed_ranks:
                errors.append(f"{record_id}: invalid ranking")
            if not ranking.get("exactSeriesMatch"):
                errors.append(f"{record_id}: ranking without exact series match")
            if urlparse(str(ranking.get("sourceUrl", ""))).scheme not in {"http", "https"}:
                errors.append(f"{record_id}: invalid ranking source")
    if errors:
        raise ValueError("\n".join(errors))


def refresh(offline: bool) -> int:
    datasets: dict[Path, list[dict[str, Any]]] = {
        path: load_json(path, []) for path in RECORD_PATHS if path.exists()
    }
    for dataset in datasets.values():
        validate_records(dataset)
    records_by_id: dict[str, dict[str, Any]] = {}
    for dataset in datasets.values():
        for record in dataset:
            records_by_id[record["id"]] = record
    records = list(records_by_id.values())
    registry: list[dict[str, Any]] = load_json(REGISTRY_PATH, [])

    run_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    today = datetime.now(timezone.utc).date()
    report: dict[str, Any] = {
        "runAt": run_at,
        "mode": "offline-validation" if offline else "network-refresh",
        "recordsChecked": 0,
        "recordsVerified": 0,
        "recordsNeedingReview": 0,
        "recordsPrecisionConfirmed": 0,
        "sourceErrors": 0,
        "registrySourceErrors": 0,
        "sources": [],
    }

    if offline:
        print(json.dumps({key: report[key] for key in ("runAt", "mode", "recordsChecked", "recordsVerified", "recordsNeedingReview", "recordsPrecisionConfirmed", "sourceErrors", "registrySourceErrors")}, indent=2))
        return 0

    for record in records:
        if record.get("deadline") and date.fromisoformat(record["deadline"][:10]) < today:
            record["status"] = "closed"
        url = record.get("evidenceUrl") or record["officialUrl"]
        source_report: dict[str, Any] = {"recordId": record["id"], "url": url}
        if not record.get("deadline") or record.get("status") == "closed":
            source_report["skipped"] = "no active firm deadline"
            report["sources"].append(source_report)
            continue
        try:
            raw_html, final_url, status_code, media_type = fetch_page(url)
            parser = parse_page(raw_html)
            text = normalized_text(parser)
            verified = evidence_contains_deadline(text, record.get("deadline"))
            precision_verified = evidence_matches_precision(text, record.get("deadline"), record.get("deadlineTimezone"))
            source_report.update({
                "httpStatus": status_code,
                "finalUrl": final_url,
                "contentType": media_type,
                "contentSha256": hashlib.sha256(raw_html.encode("utf-8", errors="ignore")).hexdigest(),
                "deadlineStillPresent": verified,
                "timeAndZoneStillPresent": precision_verified,
                "deadlineCandidates": candidate_deadlines(text),
            })
            report["recordsChecked"] += 1
            if verified and record.get("status") != "closed":
                record["status"] = "verified"
                record["verifiedAt"] = today.isoformat()
                report["recordsVerified"] += 1
                if precision_verified:
                    report["recordsPrecisionConfirmed"] += 1
            elif record.get("deadline"):
                report["recordsNeedingReview"] += 1
        except (HTTPError, URLError, TimeoutError, UnicodeError, ValueError, RuntimeError) as exc:
            report["sourceErrors"] += 1
            source_report["error"] = f"{type(exc).__name__}: {exc}"
        report["sources"].append(source_report)

    existing_discovered = {item["url"]: item for item in load_json(DISCOVERED_PATH, [])}
    for source in registry:
        source_report: dict[str, Any] = {"registryId": source["id"], "url": source["url"]}
        try:
            raw_html, final_url, status_code, media_type = fetch_page(source["url"])
            parser = parse_page(raw_html)
            found = discover_links(final_url, parser, source["id"], today.isoformat())
            for item in found:
                existing_discovered.setdefault(item["url"], item)
            source_report.update({"httpStatus": status_code, "contentType": media_type, "linksDiscovered": len(found)})
        except (HTTPError, URLError, TimeoutError, UnicodeError, ValueError, RuntimeError) as exc:
            report["sourceErrors"] += 1
            report["registrySourceErrors"] += 1
            source_report["error"] = f"{type(exc).__name__}: {exc}"
        report["sources"].append(source_report)

    discovered = sorted(existing_discovered.values(), key=lambda item: (item.get("foundAt", ""), item.get("title", "")), reverse=True)[:500]
    for path, dataset in datasets.items():
        write_json(path, dataset)
    write_json(DISCOVERED_PATH, discovered)
    report["discoveredLinks"] = len(discovered)
    write_json(REPORT_PATH, report)
    print(json.dumps({key: report[key] for key in ("runAt", "mode", "recordsChecked", "recordsVerified", "recordsNeedingReview", "recordsPrecisionConfirmed", "sourceErrors", "registrySourceErrors", "discoveredLinks")}, indent=2))
    registry_failure_threshold = max(1, len(registry) // 2 + 1)
    return 1 if not offline and report["registrySourceErrors"] >= registry_failure_threshold else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="validate local data without network access")
    args = parser.parse_args()
    try:
        return refresh(args.offline)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"Data validation failed:\n{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
