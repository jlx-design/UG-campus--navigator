import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { Empty, Loading, Notice, SourceLink } from '../components/common';
import { icsFile } from '../lib/ics';

export interface CampusEvent { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; location_id: string | null; venue_text: string | null; organiser: string | null; category: string; source_label: string; source_url: string | null; status: string }
export const EVENT_CATS: Record<string, string> = { general: 'General', academic: 'Academic', sports: 'Sports', culture: 'Culture', religious: 'Faith', career: 'Careers', src: 'SRC', club: 'Clubs', health: 'Health' };

export function UpdatesTabs({ active }: { active: 'news' | 'events' }) {
  return <nav className="sched-tabs" aria-label="Updates sections"><a href="#/updates" aria-current={active === 'news' ? 'page' : undefined}><Icon name="bell" />News</a><a href="#/updates/events" aria-current={active === 'events' ? 'page' : undefined}><Icon name="event" />Events</a></nav>;
}

export function EventsList() {
  const { byId, goDirections, select } = useStore();
  const [rows, setRows] = useState<CampusEvent[] | null>(null); const [err, setErr] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  useEffect(() => {
    const since = new Date(Date.now() - 6 * 3600e3).toISOString();
    db<CampusEvent[]>('events', `select=*&status=neq.draft&or=(ends_at.gte.${since},and(ends_at.is.null,starts_at.gte.${since}))&order=starts_at.asc&limit=200`).then(setRows).catch(e => setErr(e.message));
  }, []);
  const shown = useMemo(() => (rows || []).filter(e => !cat || e.category === cat), [rows, cat]);
  const groups = useMemo(() => {
    const m = new Map<string, CampusEvent[]>();
    for (const e of shown) { const k = new Date(e.starts_at).toDateString(); m.set(k, [...(m.get(k) || []), e]); }
    return [...m.entries()];
  }, [shown]);
  const used = Object.keys(EVENT_CATS).filter(c => rows?.some(r => r.category === c));
  const venue = (e: CampusEvent) => (e.location_id && byId.get(e.location_id)?.name) || e.venue_text;
  const dayLabel = (k: string) => { const d = new Date(k); const t = new Date(); const tm = new Date(Date.now() + 864e5);
    return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === tm.toDateString() ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); };
  return (
    <div className="screen">
      <h1>Events</h1>
      <p className="lede">Talks, games, SRC and club events on campus — added by editors with their source.</p>
      <UpdatesTabs active="events" />
      {used.length > 1 && <div className="chips" style={{ marginBottom: 12 }}><button className="chip" aria-pressed={!cat} onClick={() => setCat(null)}>All</button>{used.map(c => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>{EVENT_CATS[c]}</button>)}</div>}
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      {rows && groups.length === 0 && <Empty icon="event" title="No upcoming events yet">When editors add campus events they'll appear here, with directions to the venue.</Empty>}
      {groups.map(([k, evs]) => (
        <section key={k}><div className="section-title">{dayLabel(k)}</div>
          <div className="list">{evs.map(e => { const s = new Date(e.starts_at); const v = venue(e); return (
            <article key={e.id} className={`event-card ${e.status === 'cancelled' ? 'cancelled' : ''}`}>
              <div className="event-time"><b>{s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b>{e.ends_at && <span>– {new Date(e.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row wrap" style={{ gap: 6 }}><span className="tag brand">{EVENT_CATS[e.category]}</span>{e.status === 'cancelled' && <span className="tag warn">Cancelled</span>}</div>
                <h3 style={{ margin: '6px 0 2px' }}>{e.title}</h3>
                {e.organiser && <div className="sub">By {e.organiser}</div>}
                {v && <div className="sub"><Icon name="pin" style={{ width: 13, verticalAlign: -2 }} /> {v}</div>}
                {e.description && <p className="event-desc">{e.description}</p>}
                <div className="row wrap" style={{ marginTop: 8 }}>
                  {e.location_id && <button className="btn small primary" onClick={() => goDirections(e.location_id!)}><Icon name="walk" />Directions</button>}
                  {e.location_id && <button className="btn small" onClick={() => { select(e.location_id); location.hash = '#/map'; }}><Icon name="map" />Map</button>}
                  {e.status !== 'cancelled' && <button className="btn small" onClick={() => icsFile({ uid: e.id, title: e.title, start: s, minutes: e.ends_at ? Math.max(15, (new Date(e.ends_at).getTime() - s.getTime()) / 6e4) : 60, location: v || undefined, description: e.description || undefined, alarmMin: 30 })}><Icon name="calendar" />Add to calendar</button>}
                </div>
                <div style={{ marginTop: 6 }}><SourceLink url={e.source_url} label={e.source_label} /></div>
              </div>
            </article>); })}</div>
        </section>
      ))}
    </div>
  );
}
