'use client';

import { useMemo, useState } from 'react';
import type { Journal, JournalAccessModel } from '../lib/journalTypes';

const ACCESS_LABELS: Record<JournalAccessModel, string> = {
  diamond: 'Diamond open access',
  gold: 'Gold open access',
  hybrid: 'Hybrid',
  subscription: 'Subscription',
  other: 'Other / transitioning',
};

function quartiles(journal: Journal) {
  return journal.rankings.filter((ranking) => ranking.rank.startsWith('Q'));
}

function ccfRank(journal: Journal) {
  return journal.rankings.find((ranking) => ranking.framework === 'CCF');
}

function metric(journal: Journal, name: Journal['metrics'][number]['name']) {
  return journal.metrics.filter((entry) => entry.name === name).sort((a, b) => b.year - a.year)[0];
}

function chargeLabel(journal: Journal) {
  const { apc } = journal;
  if (apc.amount === 0) return 'No APC';
  if (apc.amount == null || !apc.currency) return 'Not published';
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(apc.amount);
  return `${apc.currency} ${amount}${apc.mandatory === false ? ' optional OA' : ''}`;
}

function timelineLabel(journal: Journal) {
  const days = journal.timeline.firstDecisionDays;
  if (days == null) return 'Not published';
  const qualifier = journal.timeline.measureType === 'median' ? 'median' : journal.timeline.measureType === 'scheduled-cycle' ? 'cycle' : journal.timeline.measureType === 'target' ? 'target' : null;
  return `${days} days${qualifier ? ` · ${qualifier}` : ''}`;
}

function timelineSummaryLabel(journal: Journal) {
  if (journal.timeline.firstDecisionDays != null) return timelineLabel(journal);
  if (journal.timeline.reviewDays != null) return `${journal.timeline.reviewDays} days · review ${journal.timeline.measureType === 'target' ? 'target' : 'timing'}`;
  if (journal.timeline.submissionToAcceptanceDays != null) return `${journal.timeline.submissionToAcceptanceDays} days · to acceptance`;
  if (journal.timeline.acceptanceToPublicationDays != null) return `${journal.timeline.acceptanceToPublicationDays} days · acceptance to publication`;
  return 'Not published';
}

function compareValue(journal: Journal, field: 'quartile' | 'ccf' | 'scope' | 'topics' | 'publisher' | 'access' | 'apc' | 'decision' | 'metrics') {
  if (field === 'quartile') return [...new Set(quartiles(journal).map((entry) => entry.rank))].join(' / ') || 'Not listed';
  if (field === 'ccf') return ccfRank(journal)?.rank || 'Not listed';
  if (field === 'scope') return journal.scope;
  if (field === 'topics') return journal.topics.slice(0, 5).join(', ');
  if (field === 'publisher') return journal.publisher;
  if (field === 'access') return ACCESS_LABELS[journal.accessModel];
  if (field === 'apc') return chargeLabel(journal);
  if (field === 'decision') return timelineSummaryLabel(journal);
  return journal.metrics.map((entry) => `${entry.name}: ${entry.value} (${entry.year})`).join(' · ') || 'Not published';
}

export default function JournalExplorer({ journals }: { journals: Journal[] }) {
  const [query, setQuery] = useState('');
  const [publisher, setPublisher] = useState('all');
  const [access, setAccess] = useState<'all' | JournalAccessModel>('all');
  const [rank, setRank] = useState<'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'unranked'>('all');
  const [ccf, setCcf] = useState<'all' | 'A' | 'B' | 'C' | 'unranked'>('all');
  const [cost, setCost] = useState<'all' | 'no-mandatory' | '2000' | '3000' | 'unknown'>('all');
  const [decision, setDecision] = useState<'all' | '30' | '60' | '90' | 'unknown'>('all');
  const [sortBy, setSortBy] = useState<'title' | 'decision' | 'apc' | 'jif' | 'citescore' | 'sjr' | 'hindex'>('title');
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(journals[0]?.id || null);
  const [comparison, setComparison] = useState<string[]>([]);

  const publishers = useMemo(() => [...new Set(journals.map((journal) => journal.publisher))].sort(), [journals]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return journals.filter((journal) => {
      const haystack = [journal.title, journal.acronym, journal.publisher, journal.society, journal.summary, journal.scope, ...journal.topics, ...journal.indexing].filter(Boolean).join(' ').toLocaleLowerCase();
      if (needle && !haystack.includes(needle)) return false;
      if (publisher !== 'all' && journal.publisher !== publisher) return false;
      if (access !== 'all' && journal.accessModel !== access) return false;
      if (activeOnly && journal.status !== 'active') return false;
      const journalQuartiles = quartiles(journal);
      if (rank === 'unranked' && journalQuartiles.length) return false;
      if (rank !== 'all' && rank !== 'unranked' && !journalQuartiles.some((entry) => entry.rank === rank)) return false;
      const journalCcfRank = ccfRank(journal)?.rank;
      if (ccf === 'unranked' && journalCcfRank) return false;
      if (ccf !== 'all' && ccf !== 'unranked' && journalCcfRank !== ccf) return false;
      if (cost === 'unknown' && journal.apc.amount != null) return false;
      if (cost === 'no-mandatory' && journal.apc.mandatory !== false && journal.apc.amount !== 0) return false;
      if (cost === '2000' && (journal.apc.amount == null || journal.apc.currency !== 'USD' || journal.apc.amount > 2000)) return false;
      if (cost === '3000' && (journal.apc.amount == null || journal.apc.currency !== 'USD' || journal.apc.amount > 3000)) return false;
      if (decision === 'unknown' && journal.timeline.firstDecisionDays != null) return false;
      if (decision !== 'all' && decision !== 'unknown' && (journal.timeline.firstDecisionDays == null || journal.timeline.firstDecisionDays > Number(decision))) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === 'decision') return (a.timeline.firstDecisionDays ?? Number.POSITIVE_INFINITY) - (b.timeline.firstDecisionDays ?? Number.POSITIVE_INFINITY);
      if (sortBy === 'apc') return (a.apc.amount ?? Number.POSITIVE_INFINITY) - (b.apc.amount ?? Number.POSITIVE_INFINITY);
      if (sortBy === 'jif') return (metric(b, 'Journal Impact Factor')?.value ?? -1) - (metric(a, 'Journal Impact Factor')?.value ?? -1);
      if (sortBy === 'citescore') return (metric(b, 'CiteScore')?.value ?? -1) - (metric(a, 'CiteScore')?.value ?? -1);
      if (sortBy === 'sjr') return (metric(b, 'SJR')?.value ?? -1) - (metric(a, 'SJR')?.value ?? -1);
      if (sortBy === 'hindex') return (metric(b, 'H-index')?.value ?? -1) - (metric(a, 'H-index')?.value ?? -1);
      return a.title.localeCompare(b.title);
    });
  }, [access, activeOnly, ccf, cost, decision, journals, publisher, query, rank, sortBy]);

  const activeJournal = journals.find((journal) => journal.id === selectedId && visible.some((item) => item.id === journal.id)) || visible[0];
  const comparedJournals = comparison.map((id) => visible.find((journal) => journal.id === id)).filter((journal): journal is Journal => Boolean(journal));
  const toggleCompare = (id: string) => setComparison((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  const reset = () => {
    setQuery(''); setPublisher('all'); setAccess('all'); setRank('all'); setCcf('all'); setCost('all'); setDecision('all'); setSortBy('title'); setActiveOnly(false); setSelectedId(journals[0]?.id || null);
  };

  return (
    <section className="explorer journal-explorer" id="journals">
      <div className="explorer-heading">
        <div><p className="eyebrow">Journal targeting intelligence</p><h2>Choose a journal with evidence, not folklore.</h2></div>
        <p>Compare scientific scope, publisher, access model, APC, editorial timing and dated bibliometric signals. Unknown values stay unknown until an official source publishes them.</p>
      </div>

      <div className="journal-warning"><strong>Decision aid, not a universal league table.</strong><span>The directory covers the active cybersecurity, privacy, cryptography and digital-forensics titles identified in the 2025 SJR sweep. Discontinued titles are excluded from submission targeting; identity or indexing cautions remain visible. Metrics keep their framework and year.</span></div>

      <div className="filter-deck journal-filters" aria-label="Journal filters">
        <label className="wide-filter"><span>Journal, topic or scope</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. post-quantum, forensics, privacy" /></label>
        <label><span>Publisher</span><select value={publisher} onChange={(event) => setPublisher(event.target.value)}><option value="all">All publishers</option>{publishers.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label><span>Access model</span><select value={access} onChange={(event) => setAccess(event.target.value as typeof access)}><option value="all">All models</option>{Object.entries(ACCESS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Quartile</span><select value={rank} onChange={(event) => setRank(event.target.value as typeof rank)}><option value="all">All quartiles</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option><option value="unranked">Not listed</option></select></label>
        <label><span>CCF journal rank</span><select value={ccf} onChange={(event) => setCcf(event.target.value as typeof ccf)}><option value="all">All CCF ranks</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="unranked">Not listed</option></select></label>
        <label><span>Publication cost</span><select value={cost} onChange={(event) => setCost(event.target.value as typeof cost)}><option value="all">Any cost</option><option value="no-mandatory">No mandatory APC</option><option value="2000">APC up to USD 2,000</option><option value="3000">APC up to USD 3,000</option><option value="unknown">Not published</option></select></label>
        <label><span>First decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="all">Any timeline</option><option value="30">Within 30 days</option><option value="60">Within 60 days</option><option value="90">Within 90 days</option><option value="unknown">Not published</option></select></label>
        <label><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="title">Journal title</option><option value="decision">Fastest stated response</option><option value="apc">Lowest stated APC</option><option value="jif">Highest JIF</option><option value="citescore">Highest CiteScore</option><option value="sjr">Highest SJR</option><option value="hindex">Highest H-index</option></select></label>
        <label className="check-filter"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /><span>Hide caution records</span></label>
      </div>

      <div className="result-bar">
        <p role="status" aria-live="polite"><strong>{visible.length}</strong> journals · <span>{visible.filter((journal) => journal.status === 'active').length} active</span> · <span>{visible.filter((journal) => journal.apc.amount != null).length} with sourced APC data</span> · <span>{visible.filter((journal) => journal.metrics.length > 0).length} with dated metrics</span> · <span>{visible.filter((journal) => Object.entries(journal.timeline).some(([key, value]) => key.endsWith('Days') && value != null)).length} with published timing</span></p>
        <button type="button" onClick={reset}>Reset filters</button>
      </div>

      {comparedJournals.length > 0 && (
        <div className="comparison-panel" aria-label="Journal comparison">
          <div className="comparison-head"><div><span>Target shortlist</span><strong>Compare up to three journals</strong></div><button type="button" onClick={() => setComparison([])}>Clear comparison</button></div>
          <div className="comparison-scroll"><table className="comparison-table"><caption>Side-by-side journal targeting evidence</caption><thead><tr><th scope="col">Criterion</th>{comparedJournals.map((journal) => <th scope="col" key={journal.id}>{journal.acronym || journal.title}</th>)}</tr></thead><tbody>{(['scope', 'topics', 'publisher', 'quartile', 'ccf', 'access', 'apc', 'decision', 'metrics'] as const).map((field) => <tr key={field}><th scope="row">{field === 'apc' ? 'Publication cost' : field === 'decision' ? 'Stated timing' : field === 'ccf' ? 'CCF rank' : field[0].toUpperCase() + field.slice(1)}</th>{comparedJournals.map((journal) => <td key={`${field}-${journal.id}`}>{compareValue(journal, field)}</td>)}</tr>)}</tbody></table></div>
        </div>
      )}

      <div className="journal-layout">
        <div className="journal-list">
          {visible.map((journal) => {
            const journalQuartiles = quartiles(journal);
            const journalCcf = ccfRank(journal);
            const jif = metric(journal, 'Journal Impact Factor');
            const citeScore = metric(journal, 'CiteScore');
            const sjr = metric(journal, 'SJR');
            const isCompared = comparison.includes(journal.id);
            return (
              <article className={`journal-card${activeJournal?.id === journal.id ? ' selected-journal' : ''}`} key={journal.id}>
                <div className="journal-card-top"><span>{ACCESS_LABELS[journal.accessModel]}</span><i className={journal.status === 'caution' ? 'caution' : ''}>{journal.status === 'caution' ? 'Caution' : 'Active'}</i></div>
                <div className="journal-title-row"><div><h3>{journal.title}</h3><p>{[journal.acronym, journal.publisher, journal.society].filter(Boolean).join(' · ')}</p></div><div className="journal-rank-stack">{journalCcf && <a href={journalCcf.sourceUrl} target="_blank" rel="noreferrer"><strong>{journalCcf.rank}</strong><small>CCF</small></a>}{journalQuartiles.length > 0 && <a href={journalQuartiles[0].sourceUrl} target="_blank" rel="noreferrer"><strong>{[...new Set(journalQuartiles.map((entry) => entry.rank))].join('/')}</strong><small>quartile</small></a>}{!journalCcf && !journalQuartiles.length && <span className="journal-unranked">N/L<small>not listed</small></span>}</div></div>
                <p className="journal-summary">{journal.summary}</p>
                <div className="topic-row">{journal.topics.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)}</div>
                <div className="journal-signals"><div><small>APC / publication</small><strong>{chargeLabel(journal)}</strong></div><div><small>Stated timing</small><strong>{timelineSummaryLabel(journal)}</strong></div><div><small>Dated metrics</small><strong>{jif ? `JIF ${jif.value} (${jif.year})` : citeScore ? `CiteScore ${citeScore.value} (${citeScore.year})` : sjr ? `SJR ${sjr.value} (${sjr.year})` : 'Not published'}</strong></div></div>
                <div className="journal-card-actions"><button type="button" onClick={() => setSelectedId(journal.id)}>Full journal record</button><button type="button" className={isCompared ? 'is-compared' : ''} disabled={!isCompared && comparison.length >= 3} onClick={() => toggleCompare(journal.id)}>{isCompared ? 'Remove from comparison' : 'Compare'}</button><a href={journal.authorGuidelinesUrl || journal.officialUrl} target="_blank" rel="noreferrer">Author guide ↗</a></div>
              </article>
            );
          })}
          {!visible.length && <div className="empty-state"><strong>No exact journal match.</strong><p>Broaden a filter; unavailable costs and timelines are intentionally not estimated.</p><button type="button" onClick={reset}>Show all journals</button></div>}
        </div>

        <aside className="journal-detail" aria-label="Selected journal details">
          {activeJournal && <>
            <div className="journal-detail-head"><span>Evidence record · checked {activeJournal.verifiedAt}</span><h3>{activeJournal.title}</h3><p>{activeJournal.publisher}{activeJournal.society ? ` · ${activeJournal.society}` : ''}</p></div>
            {activeJournal.caution && <div className="journal-caution"><strong>Editorial caution</strong><p>{activeJournal.caution}</p></div>}
            <section><h4>Scope and fit</h4><p>{activeJournal.scope}</p><div className="detail-tags">{activeJournal.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></section>
            <section><h4>Rankings and metrics</h4><div className="evidence-grid">{activeJournal.rankings.map((entry) => <a href={entry.sourceUrl} target="_blank" rel="noreferrer" key={`${entry.framework}-${entry.rank}-${entry.category}`}><small>{entry.framework} · {entry.edition}</small><strong>{entry.rank}</strong><span>{entry.category}</span></a>)}{activeJournal.metrics.map((entry) => <a href={entry.sourceUrl} target="_blank" rel="noreferrer" key={`${entry.name}-${entry.year}`}><small>{entry.name} · {entry.year}</small><strong>{entry.value}</strong><span>Open source evidence ↗</span></a>)}</div>{!activeJournal.rankings.length && !activeJournal.metrics.length && <p className="unknown-value">No current metric has been independently sourced.</p>}</section>
            <section><h4>Cost and access</h4><dl><div><dt>Access model</dt><dd>{ACCESS_LABELS[activeJournal.accessModel]}</dd></div><div><dt>APC</dt><dd>{chargeLabel(activeJournal)}</dd></div><div><dt>Submission fee</dt><dd>{activeJournal.submissionFee ? (activeJournal.submissionFee.amount === 0 ? 'No submission fee' : `${activeJournal.submissionFee.currency || ''} ${activeJournal.submissionFee.amount ?? 'not published'}`.trim()) : 'Not independently confirmed'}</dd></div><div><dt>Conditions</dt><dd>{activeJournal.apc.conditions}</dd></div><div><dt>Waivers</dt><dd>{activeJournal.waivers || 'Not published in the reviewed source'}</dd></div><div><dt>Other charges</dt><dd>{activeJournal.otherCharges || 'Not independently confirmed'}</dd></div></dl>{activeJournal.apc.sourceUrl && <a className="source-link" href={activeJournal.apc.sourceUrl} target="_blank" rel="noreferrer">Official fee evidence ↗</a>}</section>
            <section><h4>Editorial timing</h4><dl><div><dt>Stated first response</dt><dd>{timelineLabel(activeJournal)}</dd></div><div><dt>Timing basis</dt><dd>{activeJournal.timeline.measureType === 'scheduled-cycle' ? 'Scheduled review cycle' : activeJournal.timeline.measureType === 'median' ? 'Reported median' : activeJournal.timeline.measureType === 'target' ? 'Editorial target' : 'Not published'}</dd></div><div><dt>Decision after review</dt><dd>{activeJournal.timeline.reviewDays == null ? 'Not published separately' : `${activeJournal.timeline.reviewDays} days`}</dd></div><div><dt>Submission → acceptance</dt><dd>{activeJournal.timeline.submissionToAcceptanceDays == null ? 'Not published' : `${activeJournal.timeline.submissionToAcceptanceDays} days`}</dd></div><div><dt>Acceptance → publication</dt><dd>{activeJournal.timeline.acceptanceToPublicationDays == null ? 'Not published' : `${activeJournal.timeline.acceptanceToPublicationDays} days`}</dd></div></dl><p className="evidence-note">{activeJournal.timeline.note}</p>{activeJournal.timeline.sourceUrl && <a className="source-link" href={activeJournal.timeline.sourceUrl} target="_blank" rel="noreferrer">Official timing evidence ↗</a>}</section>
            <section><h4>Editorial profile</h4><dl><div><dt>ISSN</dt><dd>{activeJournal.issn.join(' · ') || 'Not published'}</dd></div>{activeJournal.formerTitles?.length ? <div><dt>Former title</dt><dd>{activeJournal.formerTitles.join(' · ')}</dd></div> : null}{activeJournal.formerIssns?.length ? <div><dt>Former ISSN</dt><dd>{activeJournal.formerIssns.join(' · ')}</dd></div> : null}<div><dt>Frequency</dt><dd>{activeJournal.publicationFrequency || 'Not published'}</dd></div><div><dt>Peer review</dt><dd>{activeJournal.peerReviewModel || 'Not published'}</dd></div><div><dt>Article types</dt><dd>{activeJournal.articleTypes.join(', ') || 'See author guide'}</dd></div><div><dt>Indexing</dt><dd>{activeJournal.indexing.join(', ') || 'Not independently confirmed'}</dd></div><div><dt>Acceptance rate</dt><dd>{activeJournal.acceptanceRate || 'Not officially published'}</dd></div></dl></section>
            <section><h4>Policies and official links</h4><p>{activeJournal.dataCodePolicy || 'No specific data or code policy was found in the reviewed public material.'}</p><div className="journal-links"><a href={activeJournal.officialUrl} target="_blank" rel="noreferrer">Journal homepage ↗</a>{activeJournal.authorGuidelinesUrl && <a href={activeJournal.authorGuidelinesUrl} target="_blank" rel="noreferrer">Author instructions ↗</a>}{activeJournal.submissionUrl && <a href={activeJournal.submissionUrl} target="_blank" rel="noreferrer">Submission information ↗</a>}{activeJournal.dataCodePolicyUrl && <a href={activeJournal.dataCodePolicyUrl} target="_blank" rel="noreferrer">Data/code evidence ↗</a>}{activeJournal.ethicsUrl && <a href={activeJournal.ethicsUrl} target="_blank" rel="noreferrer">Ethics policy ↗</a>}</div></section>
            {activeJournal.notes && <section><h4>Editorial notes</h4><p>{activeJournal.notes}</p></section>}
          </>}
        </aside>
      </div>
    </section>
  );
}
