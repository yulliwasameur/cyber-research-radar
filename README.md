# CyberResearch Radar

**The global map of cybersecurity and cryptography events.**

Live portal: <https://cyber-research-radar.yulliwas.chatgpt.site>

CyberResearch Radar is a public, source-first portal for researchers, doctoral candidates and educators working in cybersecurity, cryptography, privacy, trustworthy AI, digital forensics and secure systems.

The default radar focuses on conferences, workshops and CFP deadlines worldwide. A secondary view preserves book chapters, journal special issues, grants, doctoral positions and research schools. The initial registry contains 84 opportunities, each linked to official evidence.

## What the portal offers

- a worldwide interactive event map;
- full-text search by topic, city and country;
- filters for event type, deadline window, continent, country, city and venue rank;
- deadline-first, event-date and geographic sorting;
- downloadable calendar reminders;
- clickable ICORE/CORE 2026 ranking evidence for the current ranked venues;
- a methodology ready to add CCF, Scopus, SJR and JCR evidence separately, without invented crosswalks;
- a deterministic Monday refresh with an auditable Git history.

## Editorial principles

Official organiser, society, publisher and funder pages are preferred over aggregators. Workshops never inherit a parent conference rank. New machine-discovered links stay in a review queue until a human confirms the deadline and scope.

Read the complete [methodology](docs/methodology.md) and [watcher contract](docs/agent-contract.md).

## Monday refresh

The GitHub Action runs every Monday at 06:00 UTC. It verifies the dates still shown by official pages, closes expired calls, records source health and discovers candidate links for editorial review.

Automated discovery is deliberately centred on cyber and cryptography events. The secondary collection of books, journal issues, funding and positions remains curator- and community-reviewed until equally reliable official registries are added.

Install the PDF evidence reader, then validate locally:

```bash
python -m pip install -r requirements.txt
python scripts/refresh_opportunities.py --offline
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
