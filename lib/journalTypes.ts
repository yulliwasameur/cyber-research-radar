export type JournalAccessModel = 'diamond' | 'gold' | 'hybrid' | 'subscription' | 'other';

export interface JournalMetric {
  name: 'Journal Impact Factor' | 'CiteScore' | 'SJR' | 'SNIP' | 'Other';
  value: number;
  year: number;
  sourceUrl: string;
}

export interface JournalRanking {
  framework: 'JCR' | 'SJR' | 'Scopus' | 'CCF';
  rank: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'A' | 'B' | 'C' | 'Indexed';
  category: string;
  edition: string;
  sourceUrl: string;
}

export interface JournalCharge {
  amount: number | null;
  currency: string | null;
  label: string;
  mandatory: boolean | null;
  conditions: string;
  sourceUrl: string | null;
  verifiedAt: string;
}

export interface JournalTimeline {
  firstDecisionDays: number | null;
  reviewDays: number | null;
  submissionToAcceptanceDays: number | null;
  acceptanceToPublicationDays: number | null;
  basis: 'publisher-reported' | 'journal-reported' | 'not-published';
  measureType?: 'median' | 'target' | 'scheduled-cycle' | 'not-published';
  note: string;
  sourceUrl: string | null;
  verifiedAt: string;
}

export interface Journal {
  id: string;
  title: string;
  acronym: string | null;
  publisher: string;
  society: string | null;
  summary: string;
  scope: string;
  topics: string[];
  officialUrl: string;
  authorGuidelinesUrl: string | null;
  submissionUrl: string | null;
  issn: string[];
  formerTitles?: string[];
  formerIssns?: string[];
  accessModel: JournalAccessModel;
  apc: JournalCharge;
  submissionFee: JournalCharge | null;
  otherCharges: string | null;
  waivers: string | null;
  timeline: JournalTimeline;
  publicationFrequency: string | null;
  peerReviewModel: string | null;
  articleTypes: string[];
  indexing: string[];
  metrics: JournalMetric[];
  rankings: JournalRanking[];
  acceptanceRate: string | null;
  dataCodePolicy: string | null;
  dataCodePolicyUrl: string | null;
  ethicsUrl: string | null;
  status: 'active' | 'caution';
  caution: string | null;
  notes: string | null;
  verifiedAt: string;
}
