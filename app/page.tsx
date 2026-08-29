import ResearchHub from '../components/ResearchHub';
import opportunityData from '../data/opportunities.json';
import cryptoOpportunityData from '../data/crypto_opportunities.json';
import cyberOpportunityData from '../data/cyber_opportunities.json';
import catalogueEventData from '../data/catalogue_events.json';
import journalData from '../data/journals.json';
import type { Opportunity } from '../lib/types';
import type { Journal } from '../lib/journalTypes';
import { normalizeOpportunities } from '../lib/opportunityValidation';
import { normalizeJournals } from '../lib/journalValidation';

const REMOTE_DATA_ROOT = 'https://raw.githubusercontent.com/yulliwasameur/cyber-research-radar/main/data';
const REMOTE_DATA_FILES = ['opportunities.json', 'crypto_opportunities.json', 'cyber_opportunities.json', 'catalogue_events.json'];
const deploymentOpportunities = normalizeOpportunities([
  ...(opportunityData as unknown as Opportunity[]),
  ...(cryptoOpportunityData as unknown as Opportunity[]),
  ...(cyberOpportunityData as unknown as Opportunity[]),
  ...(catalogueEventData as unknown as Opportunity[]),
]);
const deploymentJournals = normalizeJournals(journalData as unknown as Journal[]);

export const dynamic = 'force-dynamic';

async function loadOpportunities() {
  try {
    const responses = await Promise.all(REMOTE_DATA_FILES.map((file) => fetch(`${REMOTE_DATA_ROOT}/${file}`, { cache: 'no-store' })));
    if (responses.some((response) => !response.ok)) return deploymentOpportunities;
    const datasets = await Promise.all(responses.map((response) => response.json())) as unknown[];
    const live = normalizeOpportunities(datasets.flat());
    return live.length >= Math.max(10, deploymentOpportunities.length * 0.75) ? live : deploymentOpportunities;
  } catch {
    return deploymentOpportunities;
  }
}

async function loadJournals() {
  try {
    const response = await fetch(`${REMOTE_DATA_ROOT}/journals.json`, { cache: 'no-store' });
    if (!response.ok) return deploymentJournals;
    const live = normalizeJournals(await response.json());
    return live.length >= Math.max(5, deploymentJournals.length * 0.75) ? live : deploymentJournals;
  } catch {
    return deploymentJournals;
  }
}

function shortDate(value?: string | null) {
  if (!value) return 'TBA';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export default async function Home() {
  const [opportunities, journals] = await Promise.all([loadOpportunities(), loadJournals()]);
  const eventOpportunities = opportunities.filter((item) => item.type === 'conference' || item.type === 'workshop');
  const upcoming = eventOpportunities
    .filter((item) => item.status === 'verified' && item.deadline)
    .sort((a, b) => a.deadline!.slice(0, 10).localeCompare(b.deadline!.slice(0, 10)));
  const countries = new Set(eventOpportunities.filter((item) => item.countryCode).map((item) => item.countryCode)).size;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Cybersecurity and cryptography events worldwide',
    description: 'Verified cybersecurity and cryptography conferences, workshops and calls for papers worldwide.',
    numberOfItems: eventOpportunities.length,
    itemListElement: upcoming.slice(0, 50).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Thing',
        name: item.title,
        description: item.summary,
        url: item.cfpUrl || item.officialUrl,
        keywords: item.topics.join(', '),
      },
    })),
  };
  const journalStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Cybersecurity and cryptography journal targeting directory',
    description: 'Source-linked cybersecurity and cryptography journals with scope, publisher, access model, publication fees, editorial timing and dated ranking signals.',
    numberOfItems: journals.length,
    itemListElement: journals.map((journal, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Periodical',
        name: journal.title,
        url: journal.officialUrl,
        issn: journal.issn,
        publisher: { '@type': 'Organization', name: journal.publisher },
      },
    })),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll('<', '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(journalStructuredData).replaceAll('<', '\\u003c') }} />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CyberResearch Radar home">
          <span className="brand-mark">CR</span>
          <span><strong>CyberResearch Radar</strong><small>Global cyber event intelligence</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#opportunities">Events</a>
          <a href="#journals">Journals</a>
          <a href="#ai-security">AI security</a>
          <a href="#short-contribution">Short contribution</a>
          <a href="#methodology">Method</a>
          <a href="#expertise">Scope</a>
          <a href="https://github.com/yulliwasameur/cyber-research-radar" target="_blank" rel="noreferrer">Contribute ↗</a>
        </nav>
        <span className="update-pill"><i /> Monday refresh · 06:00 UTC</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Evidence-led · worldwide · open to the community</p>
          <h1>The global map of cybersecurity & cryptography <em>events.</em></h1>
          <p className="lede">
            Track conferences, workshops and CFP deadlines across every continent —
            ranked transparently and linked to official evidence.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#opportunities">Explore the live radar</a>
            <a className="secondary-action" href="#journals">Choose a journal</a>
            <a className="secondary-action" href="#methodology">Read the methodology</a>
          </div>
          <div className="quick-filters" aria-label="Core research scope">
            <span>Expert scope:</span><b>PQC</b><b>Homomorphic encryption</b><b>PPML</b><b>AI security</b><b>Digital forensics</b>
          </div>
        </div>

        <aside className="atlas-preview deadline-signal" aria-label="Next verified deadlines">
          <div className="map-head"><span>Deadline signal</span><strong>LIVE · 2026—27</strong></div>
          <div className="signal-orbit" aria-hidden="true"><i /><i /><i /><span>CR</span></div>
          <div className="next-calls">
            {upcoming.slice(0, 4).map((item, index) => (
              <a href={item.cfpUrl || item.officialUrl} target="_blank" rel="noreferrer" key={item.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{item.acronym || item.title}</strong><small>{item.topics.slice(0, 2).join(' · ')}</small></div>
                <time dateTime={item.deadline || undefined}>{shortDate(item.deadline)}</time>
              </a>
            ))}
          </div>
          <div className="map-legend"><span><i className="dot aqua" /> official deadline evidence</span><span><i className="dot coral" /> closest first</span></div>
        </aside>
      </section>

      <section className="pulse" aria-label="Current portal coverage">
        <div><strong>{eventOpportunities.length}</strong><span>curated cyber & crypto events</span></div>
        <div><strong>{countries || 'Global'}</strong><span>countries represented</span></div>
        <div><strong>{journals.length}</strong><span>journal targeting records</span></div>
        <div><strong>A* → C</strong><span>traceable ICORE 2026 signals</span></div>
      </section>

      <ResearchHub opportunities={opportunities} journals={journals} />

      <section className="method-section" id="ai-security">
        <div className="method-intro">
          <p className="eyebrow">Matched to your AI-security work</p>
          <h2>Where to publish on AI, LLM &amp; agentic security.</h2>
          <p>Open special issues and on-theme venues for LLM security, agentic AI, prompt injection and zero-trust for agents. Deadlines checked Aug 2026 — confirm on the official page before submitting.</p>
          <a href="https://www.computer.org/publications/author-resources/calls-for-papers" target="_blank" rel="noreferrer">All IEEE-CS calls for papers ↗</a>
        </div>
        <div className="framework-list">
          <a href="https://www.computer.org/digital-library/magazines/ic/cfp-future-systems-llm-agents" target="_blank" rel="noreferrer"><span>01</span><div><strong>IEEE Internet Computing — Future Internet Systems with LLMs &amp; Agents</strong><p>Agent security, identity &amp; authentication for tools and APIs, prompt injection, adversarial robustness. Magazine — short &amp; fast.</p></div><b>15 Sep 2026 ↗</b></a>
          <a href="https://www.computer.org/digital-library/journals/tsc/cfp-language-models-ecosystems-design" target="_blank" rel="noreferrer"><span>02</span><div><strong>IEEE Trans. Services Computing — LLMs in Service-Oriented Ecosystems</strong><p>LLMs and agents across service ecosystems; agent-in-services and API-security angles.</p></div><b>31 Oct 2026 ↗</b></a>
          <a href="https://www.computer.org/digital-library/magazines/sp/cfp-real-world-security-impact" target="_blank" rel="noreferrer"><span>03</span><div><strong>IEEE Security &amp; Privacy — Real-World Security: Impact Beyond the Publications</strong><p>Deployed, measurable security impact. Magazine — good for a systems and measurement framing.</p></div><b>1 Nov 2026 ↗</b></a>
          <a href="https://www.computer.org/digital-library/journals/tq/cfp-safety-alignment-responsibility-language" target="_blank" rel="noreferrer"><span>04</span><div><strong>IEEE TDSC — Safety, Alignment &amp; Responsibility of LLMs</strong><p>Hallucination, prompt injection, jailbreaks, privacy leakage, trustworthy deployment.</p></div><b>31 Dec 2026 ↗</b></a>
          <a href="https://www.computer.org/digital-library/magazines/cg/cfp-visualization-secure-ai-cyber-systems" target="_blank" rel="noreferrer"><span>05</span><div><strong>IEEE Computer Graphics &amp; Applications — Visualization for Secure AI &amp; Cyber Systems</strong><p>LLM security incl. prompt-injection detection and jailbreak-pattern analysis, with a visualization angle.</p></div><b>4 Jan 2027 ↗</b></a>
          <a href="https://www.computer.org/digital-library/journals/tq/cfp-trust-privacy-security-agentic-systems" target="_blank" rel="noreferrer"><span>06</span><div><strong>IEEE TDSC — Trust, Privacy &amp; Security in Intelligent and Agentic Systems</strong><p>Tool-use isolation &amp; least-privilege, agent identity and delegated access control, RAG security, adversarial ML. Best topical fit for your zero-trust-for-agents work.</p></div><b>15 Jan 2027 ↗</b></a>
        </div>
        <div className="method-intro"><p>On-theme workshops &amp; conferences (short-paper tracks):</p></div>
        <div className="framework-list">
          <a href="https://sites.google.com/view/agent-sec-2026/" target="_blank" rel="noreferrer"><span>01</span><div><strong>AGENT-SEC 2026</strong><p>Workshop on the security of AI agents.</p></div><b>2026 ↗</b></a>
          <a href="https://aisec.cc/" target="_blank" rel="noreferrer"><span>02</span><div><strong>ACM AISec 2026</strong><p>Flagship workshop on AI &amp; security, co-located with ACM CCS.</p></div><b>@ CCS ↗</b></a>
          <a href="https://gaiss.info/call-for-papers" target="_blank" rel="noreferrer"><span>03</span><div><strong>IEEE GAISS 2026</strong><p>Generative AI for secure systems.</p></div><b>2026 ↗</b></a>
          <a href="https://tps.ieee-cs.org/2026/call-for-papers/" target="_blank" rel="noreferrer"><span>04</span><div><strong>IEEE TPS 2026</strong><p>Trust, privacy and security in intelligent systems.</p></div><b>2026 ↗</b></a>
          <a href="https://sites.google.com/view/secai2026/call-for-papers" target="_blank" rel="noreferrer"><span>05</span><div><strong>SECAI 2026</strong><p>Security &amp; AI, ESORICS-affiliated.</p></div><b>2026 ↗</b></a>
        </div>
      </section>

      <section className="method-section" id="short-contribution">
        <div className="method-intro">
          <p className="eyebrow">Letters &amp; rapid short-paper venues</p>
          <h2>Place a short contribution, fast.</h2>
          <p>Journals that accept letters and short papers — the quickest route to a citable result, in the same short format as your IEEE Networking Letters paper. Rolling submission.</p>
        </div>
        <div className="framework-list">
          <a href="https://www.comsoc.org/publications/journals/ieee-lnet/call-papers" target="_blank" rel="noreferrer"><span>01</span><div><strong>IEEE Networking Letters</strong><p>Your current venue. Network &amp; system security and ML-for-networking; up to 4 pp free route.</p></div><b>Rolling</b></a>
          <a href="https://www.computer.org/csdl/journal/lc" target="_blank" rel="noreferrer"><span>02</span><div><strong>IEEE Letters of the Computer Society</strong><p>General computer-science letters, fast review — a home for a crisp AI-security result without a networking wrapper.</p></div><b>Rolling</b></a>
          <a href="https://dl.acm.org/journal/ailet" target="_blank" rel="noreferrer"><span>03</span><div><strong>ACM AI-Let (AI Letters)</strong><p>New ACM rapid-publication AI letters. Open access, no charges through 2028; frame via responsible / emerging AI.</p></div><b>Rolling</b></a>
          <a href="https://www.comsoc.org/publications/journals/ieee-communications-letters" target="_blank" rel="noreferrer"><span>04</span><div><strong>IEEE Communications Letters</strong><p>High-throughput comms letters; a fit when the security result rides on a communications or ML-for-comms mechanism.</p></div><b>Rolling</b></a>
          <a href="https://cis.ieee.org/publications/ieee-computational-intelligence-letters" target="_blank" rel="noreferrer"><span>05</span><div><strong>IEEE Computational Intelligence Letters</strong><p>Short CI/ML venue — best when the core is a learning or optimisation method with a security application.</p></div><b>Rolling</b></a>
        </div>
      </section>

      <section className="method-section" id="methodology">
        <div className="method-intro">
          <p className="eyebrow">No black-box prestige score</p>
          <h2>Academic signals, kept honest.</h2>
          <p>Conference ranks, journal indexing and bibliometric metrics answer different questions. CyberResearch Radar keeps them separate, dated and linked to their source.</p>
          <a href="https://github.com/yulliwasameur/cyber-research-radar/blob/main/docs/methodology.md" target="_blank" rel="noreferrer">Open the full editorial policy ↗</a>
        </div>
        <div className="framework-list">
          <a href="https://portal.core.edu.au/conf-ranks/" target="_blank" rel="noreferrer"><span>01</span><div><strong>ICORE / CORE 2026</strong><p>Primary A*, A, B and C evidence for exact computer-science conference series.</p></div><b>Conference rank ↗</b></a>
          <a href="https://www.ccf.org.cn/Academic_Evaluation/By_category/" target="_blank" rel="noreferrer"><span>02</span><div><strong>CCF recommendations</strong><p>A separate A, B and C lens, especially valuable for international and Asian venue assessment.</p></div><b>Conference & journal ↗</b></a>
          <a href="https://www.elsevier.com/products/scopus/metrics" target="_blank" rel="noreferrer"><span>03</span><div><strong>Scopus / SJR</strong><p>Source-level indexing and metrics for journals, book series and some proceedings — never converted into CORE ranks.</p></div><b>Indexing signal ↗</b></a>
          <a href="https://sfdora.org/read/" target="_blank" rel="noreferrer"><span>04</span><div><strong>DORA safeguards</strong><p>Venue metrics do not stand in for the quality of an article, researcher or research programme.</p></div><b>Responsible use ↗</b></a>
        </div>
      </section>

      <section className="expertise-section" id="expertise">
        <div className="expertise-copy">
          <p className="eyebrow">Curated with senior-researcher context</p>
          <h2>Wide enough for discovery. Precise enough for a submission plan.</h2>
          <p>The editorial scope is shaped by Yulliwas Ameur’s research and teaching profile across applied cryptography, cybersecurity, privacy and secure systems. Personal contact details are deliberately excluded from the public dataset.</p>
        </div>
        <div className="expertise-grid">
          <article><span>01</span><h3>Cryptography & privacy</h3><p>Homomorphic encryption, PQC, secure computation, blockchain privacy and privacy-preserving ML.</p></article>
          <article><span>02</span><h3>Systems & networks</h3><p>IoT/cloud security, encrypted-traffic IDS, SIEM, Windows/AD, network resilience and critical systems.</p></article>
          <article><span>03</span><h3>AI & digital investigation</h3><p>Trustworthy AI, adversarial ML, forensics, incident response, cybercrime and intelligence.</p></article>
          <article><span>04</span><h3>Research & education</h3><p>Grants, doctoral opportunities, research schools, cyber ranges, curricula and security education.</p></article>
        </div>
      </section>

      <section className="community-cta">
        <div><p className="eyebrow">A shared point of entry</p><h2>Help researchers find the call they would otherwise miss.</h2></div>
        <div><p>Suggest a venue, correct a deadline or contribute a source. Every change remains visible and reviewable.</p><a href="https://github.com/yulliwasameur/cyber-research-radar/issues/new/choose" target="_blank" rel="noreferrer">Contribute on GitHub ↗</a></div>
      </section>

      <footer>
        <p><strong>CyberResearch Radar</strong> · The global map of cybersecurity and cryptography events.</p>
        <p>Curated by Yulliwas Ameur · Refreshed every Monday · Official sources first</p>
      </footer>
    </main>
  );
}
