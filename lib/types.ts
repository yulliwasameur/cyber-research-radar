export type OpportunityType =
  | 'conference'
  | 'workshop'
  | 'book-chapter'
  | 'special-issue'
  | 'school'
  | 'grant'
  | 'doctoral-position';

export type VerificationStatus = 'verified' | 'watchlist' | 'needs-review' | 'closed';

export interface VenueRanking {
  framework: 'ICORE' | 'CCF' | 'SJR' | 'JCR';
  rank: 'A*' | 'A' | 'B' | 'C' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
  edition: string;
  sourceUrl: string;
  exactSeriesMatch: boolean;
}

export interface Opportunity {
  id: string;
  title: string;
  acronym?: string | null;
  type: OpportunityType;
  summary: string;
  topics: string[];
  deadline?: string | null;
  deadlineLabel?: string | null;
  deadlineTimezone?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  city?: string | null;
  country: string;
  countryCode?: string | null;
  continent: 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania' | 'Global';
  latitude?: number | null;
  longitude?: number | null;
  mode: 'onsite' | 'hybrid' | 'online' | 'multiple';
  officialUrl: string;
  cfpUrl?: string | null;
  evidenceUrl: string;
  rankings: VenueRanking[];
  indexedIn?: string[] | null;
  status: VerificationStatus;
  verifiedAt: string;
  notes?: string | null;
  featured?: boolean | null;
}
