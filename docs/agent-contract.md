# Watcher contract

## Goal

Maintain a current, internationally useful and evidence-backed registry of cybersecurity and cryptography research opportunities.

## Inputs

- curated opportunity records;
- official CFP and deadline pages;
- official conference-series, publisher, society and funding indexes;
- ICORE/CORE, CCF, Scopus/SJR and JCR evidence kept as separate fields;
- community corrections accepted through GitHub issues and pull requests.

## Outputs

- validated opportunity JSON consumed by the public portal;
- a source-health and candidate-deadline watch report;
- a queue of newly discovered links requiring editorial review;
- an auditable Git history of Monday updates.

## State

State is stored in versioned JSON. Every public record has a stable ID, verification date and status. No browser session, personal account or secret is needed for the scheduled refresh.

## Deterministic tools

- HTTP retrieval of public official pages;
- HTML text and link extraction;
- deadline-context date matching, including stated time and AoE/UTC checks;
- PDF text extraction for official CFP documents;
- deadline-candidate extraction near explicit submission keywords;
- schema validation, duplicate detection and past-deadline closure.

## Approval gates

The watcher must not automatically:

- invent or overwrite a deadline from an ambiguous page;
- assign a venue rank without an exact series match and source;
- promote an automatically discovered link to verified public content;
- claim prospective Scopus, Web of Science or publisher indexation as confirmed;
- publish credentials, personal data or material unrelated to the research scope.

## Local proof

`python scripts/refresh_opportunities.py --offline` validates all local records without network access. The normal Monday workflow runs the same path with official-source retrieval enabled.
