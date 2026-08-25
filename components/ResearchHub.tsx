'use client';

import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Opportunity } from '../lib/types';
import type { Journal } from '../lib/journalTypes';
import OpportunityExplorer from './OpportunityExplorer';
import JournalExplorer from './JournalExplorer';

type HubView = 'events' | 'journals';

export default function ResearchHub({ opportunities, journals }: { opportunities: Opportunity[]; journals: Journal[] }) {
  const [activeView, setActiveView] = useState<HubView>('events');

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      const view = hash === '#journals' ? 'journals' : 'events';
      setActiveView(view);
      if (hash === '#journals' || hash === '#opportunities') {
        window.requestAnimationFrame(() => document.getElementById(view === 'journals' ? 'journals' : 'opportunities')?.scrollIntoView({ block: 'start' }));
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const activate = (view: HubView) => {
    setActiveView(view);
    window.history.replaceState(null, '', view === 'journals' ? '#journals' : '#opportunities');
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, view: HubView) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'events' : event.key === 'End' ? 'journals' : view === 'events' ? 'journals' : 'events';
    activate(next);
    window.requestAnimationFrame(() => document.getElementById(`${next}-tab`)?.focus());
  };

  return (
    <div className="research-hub" id="research-hub">
      <div className="portal-tabs" role="tablist" aria-label="Research intelligence directory">
        <button id="events-tab" type="button" role="tab" aria-controls="events-panel" aria-selected={activeView === 'events'} tabIndex={activeView === 'events' ? 0 : -1} onKeyDown={(event) => onTabKeyDown(event, 'events')} onClick={() => activate('events')}>
          <span>01</span><strong>Events</strong><small>{opportunities.filter((item) => item.type === 'conference' || item.type === 'workshop').length} conferences & workshops</small>
        </button>
        <button id="journals-tab" type="button" role="tab" aria-controls="journals-panel" aria-selected={activeView === 'journals'} tabIndex={activeView === 'journals' ? 0 : -1} onKeyDown={(event) => onTabKeyDown(event, 'journals')} onClick={() => activate('journals')}>
          <span>02</span><strong>Journals</strong><small>{journals.length} cyber & cryptography titles</small>
        </button>
      </div>
      {activeView === 'events'
        ? <div id="events-panel" role="tabpanel" aria-labelledby="events-tab"><OpportunityExplorer opportunities={opportunities} /></div>
        : <div id="journals-panel" role="tabpanel" aria-labelledby="journals-tab"><JournalExplorer journals={journals} /></div>}
    </div>
  );
}
