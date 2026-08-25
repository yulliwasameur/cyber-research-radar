# CyberResearch Radar

**The global map of cybersecurity and cryptography events — plus an evidence-led journal targeting directory.**

Live portal: <https://cyber-research-radar.yulliwas.chatgpt.site>

CyberResearch Radar is a public, source-first portal for researchers, doctoral candidates and educators working in cybersecurity, cryptography, privacy, trustworthy AI, digital forensics and secure systems.

The default radar focuses on conferences, workshops and CFP deadlines worldwide. It now combines the original curated editions with a much broader recurring-event catalogue. A dedicated Journals tab helps researchers compare journal scope, publisher, access model, APC, editorial timing and dated bibliometric evidence.

## What the portal offers

- a worldwide interactive event map;
- full-text search by topic, city and country;
- filters for event type, attendance format, deadline window, continent, country, city and venue rank;
- deadline-first, event-date and geographic sorting;
- downloadable calendar reminders;
- clickable ICORE/CORE 2026 ranking evidence for the current ranked venues;
- a methodology ready to add CCF, Scopus, SJR and JCR evidence separately, without invented crosswalks;
- a deterministic Monday refresh with an auditable Git history;
- a journal directory with scope, indexing, rankings, metrics, APCs, timelines and a three-journal comparison table.

## Editorial principles

Official organiser, society, publisher and funder pages are preferred over aggregators. Workshops never inherit a parent conference rank. New machine-discovered links stay in a review queue until a human confirms the deadline and scope.

Read the complete [methodology](docs/methodology.md) and [watcher contract](docs/agent-contract.md).

## Monday refresh

The GitHub Action runs every Monday at 06:00 UTC. It verifies the dates still shown by official event pages, closes expired calls, records source health and discovers candidate links for editorial review. It also monitors journal homepages plus fee, timeline, metric, ranking, submission, ethics and reproducibility evidence for changes requiring review.

Recurring event series without a confirmed current edition remain visible as watchlist records, with dates and formats left unspecified. Journal prices and timelines are never guessed: unavailable values remain explicitly unpublished until an official source is reviewed.

Install the PDF evidence reader, then validate locally:

```bash
python -m pip install -r requirements.txt
python scripts/refresh_opportunities.py --offline
python scripts/refresh_journals.py --offline
```

## Run the portal locally

```bash
pnpm install
pnpm dev
```

The production build is generated with `pnpm build`.

## Contribute

Use the repository issue form to suggest an event, correct a deadline or provide ranking evidence. Pull requests are welcome for reviewed data and accessibility or interface improvements.

Curated by Yulliwas Ameur. Personal contact details are intentionally excluded from the public dataset.
