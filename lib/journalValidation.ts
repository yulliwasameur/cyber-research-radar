import type { Journal } from './journalTypes';

const ACCESS_MODELS = new Set(['diamond', 'gold', 'hybrid', 'subscription', 'other']);
const STATUSES = new Set(['active', 'caution']);
const METRICS = new Set(['Journal Impact Factor', 'CiteScore', 'SJR', 'SNIP', 'H-index', 'Other']);
const FRAMEWORKS = new Set(['JCR', 'SJR', 'Scopus', 'CCF']);
const RANKS = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'A', 'B', 'C', 'Indexed']);
const TIMELINE_BASES = new Set(['publisher-reported', 'journal-reported', 'not-published']);
const MEASURE_TYPES = new Set(['median', 'target', 'scheduled-cycle', 'not-published']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISSN = /^\d{4}-[\dX]{4}$/;
const CURRENCY = /^[A-Z]{3}$/;

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isNullableUrl(value: unknown) {
  return value == null || isHttpUrl(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableString(value: unknown) {
  return value == null || typeof value === 'string';
}

function isStringArray(value: unknown, allowEmpty = true): value is string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(isNonEmptyString);
}

function isNullableDays(value: unknown) {
  return value == null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isDate(value: unknown) {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isCharge(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const charge = value as Record<string, unknown>;
  return (charge.amount == null || (typeof charge.amount === 'number' && Number.isFinite(charge.amount) && charge.amount >= 0))
    && (charge.currency == null || (typeof charge.currency === 'string' && CURRENCY.test(charge.currency)))
    && isNonEmptyString(charge.label)
    && (charge.mandatory == null || typeof charge.mandatory === 'boolean')
    && typeof charge.conditions === 'string'
    && isNullableUrl(charge.sourceUrl)
    && isDate(charge.verifiedAt);
}

function isTimeline(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const timeline = value as Record<string, unknown>;
  return isNullableDays(timeline.firstDecisionDays)
    && isNullableDays(timeline.reviewDays)
    && isNullableDays(timeline.submissionToAcceptanceDays)
    && isNullableDays(timeline.acceptanceToPublicationDays)
    && TIMELINE_BASES.has(String(timeline.basis))
    && (timeline.measureType == null || MEASURE_TYPES.has(String(timeline.measureType)))
    && typeof timeline.note === 'string'
    && isNullableUrl(timeline.sourceUrl)
    && isDate(timeline.verifiedAt);
}

export function isJournal(value: unknown): value is Journal {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const metrics = item.metrics as Array<Record<string, unknown>> | undefined;
  const rankings = item.rankings as Array<Record<string, unknown>> | undefined;
  return isNonEmptyString(item.id)
    && isNonEmptyString(item.title)
    && isNullableString(item.acronym)
    && isNonEmptyString(item.publisher)
    && isNullableString(item.society)
    && isNonEmptyString(item.summary)
    && isNonEmptyString(item.scope)
    && isStringArray(item.topics, false)
    && isHttpUrl(item.officialUrl)
    && isNullableUrl(item.authorGuidelinesUrl)
    && isNullableUrl(item.submissionUrl)
    && isStringArray(item.issn) && item.issn.every((entry) => ISSN.test(entry))
    && (item.formerTitles == null || isStringArray(item.formerTitles))
    && (item.formerIssns == null || (isStringArray(item.formerIssns) && item.formerIssns.every((entry) => ISSN.test(entry))))
    && ACCESS_MODELS.has(String(item.accessModel))
    && isCharge(item.apc)
    && (item.submissionFee == null || isCharge(item.submissionFee))
    && isNullableString(item.otherCharges)
    && isNullableString(item.waivers)
    && isTimeline(item.timeline)
    && isNullableString(item.publicationFrequency)
    && isNullableString(item.peerReviewModel)
    && isStringArray(item.articleTypes)
    && isStringArray(item.indexing)
    && Array.isArray(metrics) && metrics.every((entry) => {
      const year = entry.year;
      return METRICS.has(String(entry.name)) && typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.value >= 0 && typeof year === 'number' && Number.isInteger(year) && year >= 1900 && year <= 2100 && isHttpUrl(entry.sourceUrl);
    })
    && Array.isArray(rankings) && rankings.every((entry) => FRAMEWORKS.has(String(entry.framework)) && RANKS.has(String(entry.rank)) && isNonEmptyString(entry.category) && isNonEmptyString(entry.edition) && isHttpUrl(entry.sourceUrl))
    && isNullableString(item.acceptanceRate)
    && isNullableString(item.dataCodePolicy)
    && isNullableUrl(item.dataCodePolicyUrl)
    && isNullableUrl(item.ethicsUrl)
    && STATUSES.has(String(item.status))
    && isNullableString(item.caution)
    && isNullableString(item.notes)
    && isDate(item.verifiedAt);
}

export function normalizeJournals(value: unknown): Journal[] {
  if (!Array.isArray(value) || !value.every(isJournal)) return [];
  const ids = value.map((journal) => journal.id);
  if (new Set(ids).size !== ids.length) return [];
  return value;
}
