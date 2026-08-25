'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import type { Opportunity, OpportunityType } from '../lib/types';
import { normalizeOpportunities } from '../lib/opportunityValidation';

const TYPE_LABELS: Record<OpportunityType, string> = {
  conference: 'Conference',
  workshop: 'Workshop',
  'book-chapter': 'Book chapter',
  'special-issue': 'Special issue',
  school: 'Research school',
  grant: 'Grant',
  'doctoral-position': 'PhD / postdoc',
};

const TYPE_SHORT: Record<OpportunityType, string> = {
  conference: 'CONF',
  workshop: 'WKSP',
  'book-chapter': 'BOOK',
  'special-issue': 'ISSUE',
  school: 'SCHOOL',
  grant: 'GRANT',
  'doctoral-position': 'PHD',
};

const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Global'];
const REMOTE_DATA_ROOT = 'https://raw.githubusercontent.com/yulliwasameur/cyber-research-radar/main/data';
const REMOTE_DATA_FILES = ['opportunities.json', 'crypto_opportunities.json', 'cyber_opportunities.json'];
const EVENT_TYPES: OpportunityType[] = ['conference', 'workshop'];

function dateValue(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function formatDate(value?: string | null) {
  if (!value) return 'To be announced';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

function locationLabel(item: Opportunity) {
  const parts = [item.city, item.country].filter(Boolean);
  return parts.join(', ') || item.continent;
}

function mapDeadlineLabel(item: Opportunity) {
  const remaining = daysUntil(item.deadline);
  if (remaining === null) return 'Deadline to be announced';
  const relative = remaining < 0
    ? 'closed'
    : remaining === 0
      ? 'closes today'
      : `${remaining} day${remaining === 1 ? '' : 's'} left`;
  return `${formatDate(item.deadline)} · ${relative}`;
}

function coordinateKey(item: Opportunity) {
  return `${item.latitude?.toFixed(5)},${item.longitude?.toFixed(5)}`;
}

function buildMapTooltip(items: Opportunity[]) {
  const card = document.createElement('div');
  card.className = 'radar-tooltip-card';

  const place = document.createElement('span');
  place.className = 'radar-tooltip-place';
  place.textContent = `${locationLabel(items[0])}${items.length > 1 ? ` · ${items.length} events` : ''}`;
  card.appendChild(place);

  items.forEach((item) => {
    const event = document.createElement('div');
    event.className = 'radar-tooltip-event';

    const heading = document.createElement('strong');
    heading.textContent = item.acronym || item.title;
    event.appendChild(heading);

    const metadata = document.createElement('span');
    const rank = item.rankings[0]?.rank ? ` · ${item.rankings[0].rank}` : '';
    metadata.textContent = `${TYPE_LABELS[item.type]}${rank}`;
    event.appendChild(metadata);

    const deadline = document.createElement('time');
    deadline.dateTime = item.deadline || '';
    deadline.textContent = `Deadline: ${mapDeadlineLabel(item)}`;
    event.appendChild(deadline);

    if (item.deadlineTimezone) {
      const timezone = document.createElement('small');
      timezone.textContent = item.deadlineTimezone;
      event.appendChild(timezone);
    }
    card.appendChild(event);
  });

  const hint = document.createElement('small');
  hint.className = 'radar-tooltip-hint';
  hint.textContent = items.length > 1 ? 'Click to choose an event' : 'Click for full details';
  card.appendChild(hint);
  return card;
}

function buildMapPopup(items: Opportunity[], onSelect: (item: Opportunity) => void, closePopup: () => void) {
  const popup = document.createElement('div');
  popup.className = 'radar-popup-card';

  const heading = document.createElement('strong');
  heading.textContent = `${items.length} events in ${locationLabel(items[0])}`;
  popup.appendChild(heading);

  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    const title = document.createElement('b');
    title.textContent = item.acronym || item.title;
    const deadline = document.createElement('span');
    deadline.textContent = `Deadline: ${mapDeadlineLabel(item)}`;
    button.append(title, deadline);
    button.addEventListener('click', () => {
      onSelect(item);
      closePopup();
    });
    popup.appendChild(button);
  });
  return popup;
}

function calendarHref(item: Opportunity) {
  if (!item.deadline) return undefined;
  const hasExactTime = item.deadline.includes('T');
  const calendarDate = hasExactTime
    ? new Date(item.deadline).toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z')
    : item.deadline.slice(0, 10).replaceAll('-', '');
  const cleanTitle = item.title.replace(/[\r\n,;]/g, ' ');
  const calendar = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CyberResearch Radar//EN',
    'BEGIN:VEVENT', `UID:${item.id}@cyberresearch-radar`, hasExactTime ? `DTSTART:${calendarDate}` : `DTSTART;VALUE=DATE:${calendarDate}`,
    `SUMMARY:Submission deadline — ${cleanTitle}`, `URL:${item.cfpUrl || item.officialUrl}`,
    `DESCRIPTION:Deadline timezone: ${item.deadlineTimezone || 'Not stated'}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(calendar)}`;
}

function Deadline({ opportunity }: { opportunity: Opportunity }) {
  const remaining = daysUntil(opportunity.deadline);
  const descriptor = opportunity.deadlineLabel || 'Submission deadline';
  return (
    <div className="deadline-block">
      <small>{descriptor}</small>
      <strong>{formatDate(opportunity.deadline)}</strong>
      {opportunity.deadlineTimezone && <span className="deadline-zone">{opportunity.deadlineTimezone}</span>}
      {remaining !== null && remaining >= 0 && <span>{remaining === 0 ? 'Closes today' : `${remaining} day${remaining === 1 ? '' : 's'} left`}</span>}
      {remaining !== null && remaining < 0 && <span className="closed-copy">Closed</span>}
    </div>
  );
}

function ResearchMap({ items, selectedId, onSelect }: { items: Opportunity[]; selectedId?: string; onSelect: (item: Opportunity) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const markerNodesRef = useRef<Array<{ element: HTMLElement; itemIds: string[] }>>([]);
  const selectedIdRef = useRef(selectedId);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | undefined;
    void import('leaflet').then((L) => {
      if (!mounted || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, { zoomControl: true, minZoom: 1.4, worldCopyJump: true, scrollWheelZoom: false }).setView([24, 8], 1.7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
      resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      resizeObserver.observe(hostRef.current);
      window.setTimeout(() => map.invalidateSize(), 80);
    });
    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      markerNodesRef.current = [];
    };
  }, []);

  useEffect(() => {
    let active = true;
    void import('leaflet').then((L) => {
      if (!active || !mapRef.current || !markerLayerRef.current) return;
      markerLayerRef.current.clearLayers();
      markerNodesRef.current = [];
      const coordinates: [number, number][] = [];
      const groups = new Map<string, Opportunity[]>();
      items.forEach((item) => {
        const key = coordinateKey(item);
        groups.set(key, [...(groups.get(key) || []), item]);
      });

      groups.forEach((group) => {
        const lead = group[0];
        if (lead.latitude == null || lead.longitude == null) return;
        coordinates.push([lead.latitude, lead.longitude]);
        const iconNode = document.createElement('span');
        iconNode.className = `radar-marker marker-${lead.type}${group.length > 1 ? ' is-stack' : ''}`;
        iconNode.classList.toggle('is-selected', Boolean(selectedIdRef.current && group.some((item) => item.id === selectedIdRef.current)));
        const iconLabel = document.createElement('b');
        iconLabel.textContent = group.length > 1 ? String(group.length) : TYPE_SHORT[lead.type];
        iconNode.appendChild(iconLabel);
        const icon = L.divIcon({
          className: 'radar-marker-host',
          html: iconNode,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        });
        const marker = L.marker([lead.latitude, lead.longitude], {
          icon,
          keyboard: true,
          riseOnHover: true,
          alt: group.length > 1 ? `${group.length} events in ${locationLabel(lead)}` : lead.title,
          title: group.length > 1 ? `${group.length} events — ${locationLabel(lead)}` : `${lead.title} — ${locationLabel(lead)}`,
        });
        marker.bindTooltip(buildMapTooltip(group), {
          className: 'radar-tooltip',
          direction: 'top',
          offset: [0, -18],
          opacity: 1,
        });
        if (group.length > 1) {
          marker.bindPopup(buildMapPopup(group, onSelect, () => mapRef.current?.closePopup()), {
            className: 'radar-popup',
            maxWidth: 370,
          });
        } else {
          marker.on('click', () => onSelect(lead));
        }
        marker.addTo(markerLayerRef.current!);
        markerNodesRef.current.push({ element: iconNode, itemIds: group.map((item) => item.id) });
      });

      mapRef.current.invalidateSize();
      if (!coordinates.length) {
        mapRef.current.setView([24, 8], 1.7);
      } else if (coordinates.length === 1) {
        mapRef.current.setView(coordinates[0], 4);
      } else {
        mapRef.current.fitBounds(coordinates, { padding: [54, 54], maxZoom: 4 });
      }
    });
    return () => { active = false; };
  }, [items, mapReady, onSelect]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    markerNodesRef.current.forEach(({ element, itemIds }) => {
      element.classList.toggle('is-selected', Boolean(selectedId && itemIds.includes(selectedId)));
    });
  }, [selectedId]);

  return <div ref={hostRef} className="research-map" role="region" aria-label="Interactive map of filtered research opportunities" aria-describedby="research-map-help" />;
}

export default function OpportunityExplorer({ opportunities }: { opportunities: Opportunity[] }) {
  const [records, setRecords] = useState(opportunities);
  const [syncLabel, setSyncLabel] = useState('Curated deployment snapshot');
  const [freshlyCheckedIds, setFreshlyCheckedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'events' | 'all'>('events');
  const [type, setType] = useState<'all' | OpportunityType>('all');
  const [rank, setRank] = useState<'all' | 'A*' | 'A' | 'B' | 'C' | 'unranked'>('all');
  const [continent, setContinent] = useState('all');
  const [country, setCountry] = useState('all');
  const [city, setCity] = useState('all');
  const [deadlineWindow, setDeadlineWindow] = useState<'all' | '14' | '30' | '90' | 'tba'>('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'event' | 'country' | 'city' | 'title'>('deadline');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [selected, setSelected] = useState<Opportunity | undefined>();
  const mapPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMondayData() {
      try {
        const responses = await Promise.all(REMOTE_DATA_FILES.map((file) => fetch(`${REMOTE_DATA_ROOT}/${file}`, { signal: controller.signal, cache: 'no-store' })));
        if (responses.some((response) => !response.ok)) return;
        const datasets = await Promise.all(responses.map((response) => response.json())) as unknown[];
        if (!datasets.every((dataset) => Array.isArray(dataset))) return;
        const unique = normalizeOpportunities(datasets.flat());
        if (unique.length < Math.max(10, opportunities.length * 0.75)) return;
        setRecords(unique);
        const reportResponse = await fetch(`${REMOTE_DATA_ROOT}/watch_report.json`, { signal: controller.signal, cache: 'no-store' });
        if (reportResponse.ok) {
          const report = await reportResponse.json() as {
            runAt?: string | null;
            mode?: string | null;
            discoveredLinks?: number | null;
            sources?: Array<{ recordId?: string | null; deadlineStillPresent?: boolean | null }>;
          };
          const confirmedIds = new Set((report.sources || []).filter((source) => source.recordId && source.deadlineStillPresent).map((source) => source.recordId as string));
          setFreshlyCheckedIds(confirmedIds);
          const candidateCopy = report.discoveredLinks ? ` · ${report.discoveredLinks} candidates` : '';
          setSyncLabel(report.runAt && report.mode === 'network-refresh' ? `Sources checked ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(report.runAt))}${candidateCopy}` : 'Curated repository snapshot');
        } else {
          setSyncLabel('Live repository data');
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setSyncLabel('Curated deployment snapshot');
      }
    }
    void loadMondayData();
    return () => controller.abort();
  }, [opportunities]);

  const countries = useMemo(() => [...new Set(records.filter((item) => continent === 'all' || item.continent === continent).map((item) => item.country))].sort(), [continent, records]);
  const cities = useMemo(() => [...new Set(records.filter((item) => item.city && (continent === 'all' || item.continent === continent) && (country === 'all' || item.country === country)).map((item) => item.city as string))].sort(), [continent, country, records]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const filtered = records.filter((item) => {
      const haystack = [item.title, item.acronym, item.summary, item.city, item.country, item.continent, ...item.topics].filter(Boolean).join(' ').toLocaleLowerCase();
      if (needle && !haystack.includes(needle)) return false;
      if (scope === 'events' && !EVENT_TYPES.includes(item.type)) return false;
      if (type !== 'all' && item.type !== type) return false;
      if (continent !== 'all' && item.continent !== continent) return false;
      if (country !== 'all' && item.country !== country) return false;
      if (city !== 'all' && item.city !== city) return false;
      if (verifiedOnly && item.status !== 'verified') return false;
      if (rank !== 'all') {
        if (rank === 'unranked' && item.rankings.length) return false;
        if (rank !== 'unranked' && !item.rankings.some((entry) => entry.rank === rank)) return false;
      }
      if (deadlineWindow === 'tba' && item.deadline) return false;
      if (deadlineWindow !== 'all' && deadlineWindow !== 'tba') {
        if (!item.deadline) return false;
        const diff = dateValue(item.deadline) - todayUtc;
        if (diff < 0 || diff > Number(deadlineWindow) * 86_400_000) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortBy === 'deadline') return dateValue(a.deadline) - dateValue(b.deadline);
      if (sortBy === 'event') return dateValue(a.eventStart) - dateValue(b.eventStart);
      if (sortBy === 'country') return a.country.localeCompare(b.country);
      if (sortBy === 'city') return (a.city || '').localeCompare(b.city || '');
      return a.title.localeCompare(b.title);
    });
  }, [city, continent, country, deadlineWindow, query, rank, records, scope, sortBy, type, verifiedOnly]);

  const mappedItems = useMemo(() => visible.filter((item) => item.latitude != null && item.longitude != null), [visible]);
  const activeSelection = selected && visible.some((item) => item.id === selected.id) ? selected : visible[0];
  const mappedCount = mappedItems.length;
  const mappedLocationCount = useMemo(() => new Set(mappedItems.map(coordinateKey)).size, [mappedItems]);
  const resetFilters = () => {
    setQuery(''); setScope('events'); setType('all'); setRank('all'); setContinent('all'); setCountry('all'); setCity('all'); setDeadlineWindow('all'); setVerifiedOnly(true); setSelected(undefined);
  };
  const selectAndReveal = (item: Opportunity) => {
    setSelected(item);
    if (window.matchMedia('(max-width: 980px)').matches) {
      window.setTimeout(() => mapPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
  };

  return (
    <section className="explorer" id="opportunities">
      <div className="explorer-heading">
        <div><p className="eyebrow">Global event intelligence</p><h2>Find the right cyber event, before its CFP closes.</h2></div>
        <p>Start with conferences and workshops worldwide, then expand to other research calls. Rankings stay separate and traceable to their original framework.</p>
      </div>

      <div className="filter-deck" aria-label="Opportunity filters">
        <label className="wide-filter"><span>Keywords, city or country</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. post-quantum, PPML, Paris" /></label>
        <label><span>Research scope</span><select value={scope} onChange={(event) => { const nextScope = event.target.value as typeof scope; setScope(nextScope); if (nextScope === 'events' && type !== 'all' && !EVENT_TYPES.includes(type)) setType('all'); }}><option value="events">Cyber & crypto events</option><option value="all">All research calls</option></select></label>
        <label><span>Call type</span><select value={type} onChange={(event) => setType(event.target.value as 'all' | OpportunityType)}><option value="all">All {scope === 'events' ? 'event types' : 'call types'}</option>{Object.entries(TYPE_LABELS).filter(([value]) => scope === 'all' || EVENT_TYPES.includes(value as OpportunityType)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Venue rank</span><select value={rank} onChange={(event) => setRank(event.target.value as typeof rank)}><option value="all">All ranks</option><option value="A*">A*</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="unranked">Unranked</option></select></label>
        <label><span>Continent</span><select value={continent} onChange={(event) => { setContinent(event.target.value); setCountry('all'); setCity('all'); }}><option value="all">All continents</option>{CONTINENTS.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label><span>Country</span><select value={country} onChange={(event) => { setCountry(event.target.value); setCity('all'); }}><option value="all">All countries</option>{countries.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label><span>City</span><select value={city} onChange={(event) => setCity(event.target.value)}><option value="all">All cities</option>{cities.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label><span>Deadline</span><select value={deadlineWindow} onChange={(event) => setDeadlineWindow(event.target.value as typeof deadlineWindow)}><option value="all">Any deadline</option><option value="14">Next 14 days</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option><option value="tba">To be announced</option></select></label>
        <label><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="deadline">Closest deadline</option><option value="event">Event date</option><option value="country">Country</option><option value="city">City</option><option value="title">Title</option></select></label>
        <label className="check-filter"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /><span>Verified only</span></label>
      </div>

      <div className="result-bar">
        <p><strong>{visible.length}</strong> opportunities · <span>{mappedCount} mapped</span> · <span className="sync-label"><i />{syncLabel}</span></p>
        <button type="button" onClick={resetFilters}>Reset filters</button>
      </div>

      <div className="explorer-grid">
        <div className="result-list" aria-live="polite">
          {visible.map((item) => {
            const primaryRank = item.rankings[0];
            const statusCopy = item.status === 'verified'
              ? (freshlyCheckedIds.has(item.id) ? 'Date rechecked' : 'Official source reviewed')
              : item.status.replace('-', ' ');
            return (
              <article className={`opportunity-card${activeSelection?.id === item.id ? ' selected-card' : ''}`} key={item.id}>
                <div className="card-topline">
                  <span className={`type-label type-${item.type}`}>{TYPE_LABELS[item.type]}</span>
                  <span className={`status-label status-${item.status}`}>{statusCopy}</span>
                </div>
                <div className="card-title-row">
                  <div><h3>{item.title}</h3>{item.acronym && <p>{item.acronym} · {locationLabel(item)}</p>}</div>
                  {primaryRank ? <a className={`rank-badge rank-${primaryRank.rank.replace('*', 'star').toLowerCase()}`} href={primaryRank.sourceUrl} target="_blank" rel="noreferrer" title={`Open ${primaryRank.framework} ${primaryRank.edition} evidence`}>{primaryRank.rank}<small>{primaryRank.framework}</small></a> : <span className="rank-badge rank-none">N/R<small>unranked</small></span>}
                </div>
                <p className="card-summary">{item.summary}</p>
                <div className="topic-row">{item.topics.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)}</div>
                <div className="card-bottom"><Deadline opportunity={item} /><div className="card-actions"><button type="button" onClick={() => selectAndReveal(item)}>View details</button><a href={item.cfpUrl || item.officialUrl} target="_blank" rel="noreferrer">Official call ↗</a></div></div>
              </article>
            );
          })}
          {!visible.length && <div className="empty-state"><strong>No exact match yet.</strong><p>Broaden a filter or include records awaiting verification.</p><button type="button" onClick={resetFilters}>Show all verified calls</button></div>}
        </div>

        <aside className="map-column" aria-label="Map and selected opportunity" ref={mapPanelRef}>
          <div className="map-toolbar">
            <div><span>Global research map</span><small>Drag, zoom and hover over a marker</small></div>
            <p aria-live="polite"><strong>{mappedCount}</strong> filtered events · {mappedLocationCount} locations</p>
          </div>
          <p className="sr-only" id="research-map-help">The map updates immediately when a filter changes. Hover or focus a marker to read submission deadlines. Numbered markers contain several events at the same location.</p>
          <ResearchMap items={mappedItems} selectedId={activeSelection?.id} onSelect={setSelected} />
          {activeSelection && (
            <div className="map-detail">
              <div className="map-detail-heading"><span>{TYPE_LABELS[activeSelection.type]}</span><strong>{activeSelection.acronym || activeSelection.title}</strong></div>
              <p>{locationLabel(activeSelection)} · {activeSelection.mode}</p>
              <p className="map-detail-summary">{activeSelection.summary}</p>
              <div className="map-detail-topics">{activeSelection.topics.slice(0, 3).map((topic) => <span key={topic}>{topic}</span>)}</div>
              <p className="map-deadline"><strong>Deadline:</strong> {formatDate(activeSelection.deadline)}{activeSelection.deadlineTimezone ? ` · ${activeSelection.deadlineTimezone}` : ''}</p>
              {activeSelection.eventStart && <p className="event-period">Event: {formatDate(activeSelection.eventStart)}{activeSelection.eventEnd ? ` — ${formatDate(activeSelection.eventEnd)}` : ''}</p>}
              <div className="detail-links"><a href={activeSelection.officialUrl} target="_blank" rel="noreferrer">Event website ↗</a><a href={activeSelection.evidenceUrl} target="_blank" rel="noreferrer">Deadline evidence ↗</a>{calendarHref(activeSelection) && <a href={calendarHref(activeSelection)} download={`${activeSelection.id}-deadline.ics`}>Add deadline to calendar ↓</a>}</div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
