import type { Opportunity, OpportunityType, VenueRanking, VerificationStatus } from './types';

const TYPES = new Set<OpportunityType>(['conference', 'workshop', 'book-chapter', 'special-issue', 'school', 'grant', 'doctoral-position']);
const STATUSES = new Set<VerificationStatus>(['verified', 'watchlist', 'needs-review', 'closed']);
const CONTINENTS = new Set(['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Global']);
const MODES = new Set(['onsite', 'hybrid', 'online', 'multiple', 'unspecified']);
const FRAMEWORKS = new Set(['ICORE', 'CCF', 'SJR', 'JCR']);
const RANKS = new Set(['A*', 'A', 'B', 'C', 'Q1', 'Q2', 'Q3', 'Q4']);

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isRanking(value: unknown): value is VenueRanking {
  if (!value || typeof value !== 'object') return false;
  const rank = value as Record<string, unknown>;
  return FRAMEWORKS.has(String(rank.framework))
    && RANKS.has(String(rank.rank))
    && typeof rank.edition === 'string'
    && isHttpUrl(rank.sourceUrl)
    && rank.exactSeriesMatch === true;
}

export function isOpportunity(value: unknown): value is Opportunity {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const optionalString = (field: string) => item[field] == null || typeof item[field] === 'string';
  const optionalNumber = (field: string) => item[field] == null || (typeof item[field] === 'number' && Number.isFinite(item[field]));

  return typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.summary === 'string'
    && TYPES.has(item.type as OpportunityType)
    && Array.isArray(item.topics)
    && item.topics.length > 0
    && item.topics.every((topic) => typeof topic === 'string')
    && typeof item.country === 'string'
    && CONTINENTS.has(String(item.continent))
    && MODES.has(String(item.mode))
    && isHttpUrl(item.officialUrl)
    && isHttpUrl(item.evidenceUrl)
    && Array.isArray(item.rankings)
    && item.rankings.every(isRanking)
    && STATUSES.has(item.status as VerificationStatus)
    && typeof item.verifiedAt === 'string'
    && optionalString('acronym')
    && optionalString('deadline')
    && optionalString('deadlineLabel')
    && optionalString('deadlineTimezone')
    && optionalString('eventStart')
    && optionalString('eventEnd')
    && optionalString('city')
    && optionalString('countryCode')
    && (item.cfpUrl == null || isHttpUrl(item.cfpUrl))
    && optionalString('notes')
    && optionalNumber('latitude')
    && optionalNumber('longitude');
}

export function normalizeOpportunities(value: unknown): Opportunity[] {
  if (!Array.isArray(value)) return [];
  return [...new Map(value.filter(isOpportunity).map((item) => [item.id, item])).values()];
}
