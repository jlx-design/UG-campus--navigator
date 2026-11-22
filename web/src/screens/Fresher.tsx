import React, { useEffect, useMemo, useState } from 'react';
import { track } from '../lib/track';
import { K } from '../lib/keys';
import { CAMPUS } from '../config';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { BackLink, Empty, Loading, Notice, SourceLink, VerificationTag, go } from '../components/common';
import type { ChecklistItem, FresherResource } from '../lib/types';
import { fmtDate } from '../lib/geo';
import { ForYou } from './ForYou';

export const SECTIONS: { key: string; label: string; icon: string; blurb: string }[] = [
  { key: 'getting_started', label: `New to ${CAMPUS.short}`, icon: 'gFirstSteps', blurb: 'First steps for freshers' },
  { key: 'registration', label: 'Registration', icon: 'gRegister', blurb: 'Verified registration guidance' },
  { key: 'orientation', label: 'Orientation', icon: 'gOrient', blurb: 'Orientation information' },
  { key: 'academic', label: 'Academic resources', icon: 'gAcademic', blurb: 'Libraries, portals, learning' },
  { key: 'facilities', label: 'Campus essentials', icon: 'gEssentials', blurb: 'Key places on campus' },
  { key: 'student_services', label: 'Student services', icon: 'gServices', blurb: 'Who can help with what' },
  { key: 'accommodation', label: 'Accommodation & halls', icon: 'gHalls', blurb: 'Halls and official contacts' },
  { key: 'navigation', label: 'Getting around', icon: 'gAround', blurb: 'Gates, transport, wayfinding' },
  { key: 'faq', label: 'FAQs', icon: 'gFaq', blurb: 'Common questions' },
  { key: 'terminology', label: `${CAMPUS.short} Explained`, icon: 'gTerms', blurb: 'University terms, explained' },
  { key: 'official_links', label: 'Official resources', icon: 'gOfficial', blurb: `Links to official ${CAMPUS.short} sites` },
];

function useResources() {
  const [rows, setRows] = useState<FresherResource[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => { setErr(null); db<FresherResource[]>('fresher_resources', 'select=*&is_published=eq.true&order=sort_order.asc,title.asc').then(setRows).catch(e => setErr(e.message)); };
  useEffect(load, []);
  return { rows, err, load };
}

export function FresherHome() {
  const { rows, err, load } = useResources();
  const { shuttles, categories, locations } = useStore();
  const counts = useMemo(() => { const m = new Map<string, number>(); rows?.forEach(r => m.set(r.section, (m.get(r.section) || 0) + 1)); return m; }, [rows]);
  const catCount = (slug: string) => locations.filter(l => l.category === slug).length;
  const browse = ['library', 'lecture_hall', 'food', 'health', 'sports', 'hall', 'bank', 'worship'].map(s => categories.find(c => c.slug === s)).filter(Boolean) as any[];
  return (
    <div className="screen">
      <header className="page-head"><h1>Campus Guide</h1><p className="lede">Everything about life at {CAMPUS.campusName} — for students, staff and visitors.</p></header>
      <ForYou />
      <a className="ai-hero" href="#/assistant">
        <div className="ai-orb"><Icon name="askAi" /></div>
        <div><b>Ask Campus AI</b><span>“Where is the main library?” · “How do I register?”</span></div>
        <Icon name="chevron" />
      </a>
      <div className="section-title">Everyone</div>
      <div className="quick-grid">
        <a className="quick q-red" href="#/emergency"><Icon name="sos" /><b>Emergency</b><span>Call for help</span></a>
        <a className="quick q-blue" href="#/shuttles"><Icon name="bus" /><b>Shuttles</b><span>{shuttles.length ? `${shuttles.length} live now` : 'Routes & live'}</span></a>
        <a className="quick q-green" href="#/schedule"><Icon name="calendar" /><b>Timetable</b><span>Your classes</span></a>
        <a className="quick q-gold" href="#/fresher/checklist"><Icon name="check" /><b>New to {CAMPUS.short}?</b><span>Starter checklist</span></a>
      </div>
      {browse.length > 0 && <>
        <div className="section-title">Find on campus</div>
        <div className="cat-scroller">{browse.map(c => (
          <a key={c.slug} className="cat-tile" href={`#/map?cat=${c.slug}`}><span className="cat-ic"><Icon name={c.icon} /></span><b>{c.label}</b>{catCount(c.slug) > 0 && <span>{catCount(c.slug)} place{catCount(c.slug) === 1 ? '' : 's'}</span>}</a>
        ))}</div>
      </>}
      <div className="section-title">Guides & resources</div>
      {err && <Notice kind="error">Could not load the guide: {err} <button className="btn small" onClick={load}>Retry</button></Notice>}
      <nav className="topic-index" aria-label="Guides and resources">
        {SECTIONS.map(s => { const n = counts.get(s.key) || 0; return (
          <a key={s.key} className="topic" href={`#/fresher/${s.key}`}>
            <span className="topic-ic"><Icon name={s.icon} /></span>
            <span className="topic-txt"><b>{s.label}</b><span>{s.blurb}</span></span>
            {n > 0 && <span className="topic-n" aria-label={`${n} item${n === 1 ? '' : 's'}`}>{n}</span>}
            <Icon name="chevron" className="topic-go" />
          </a>
        ); })}
      </nav>
    </div>
  );
}

export function FresherSection({ section }: { section: string }) {
  const { rows, err, load } = useResources();
  const { byId, select } = useStore();
  const meta = SECTIONS.find(s => s.key === section);
  const items = rows?.filter(r => r.section === section) ?? null;
  return (
    <div className="screen">
      <BackLink href="#/guide" label="Guide" />
      <h1>{meta?.label || 'Topic'}</h1>
      {section === 'terminology' && <p className="lede">Plain-language explanations. Entries marked “General guidance” are not official {CAMPUS.short} policy.</p>}
      {err && <Notice kind="error">{err} <button className="btn small" onClick={load}>Retry</button></Notice>}
      {!items && !err && <Loading />}
      {items && items.length === 0 && (
        <Empty icon="book" title="Nothing published here yet">
          Verified content for this topic hasn’t been added. For now, check the official {CAMPUS.short} website: <a href={CAMPUS.website} target="_blank" rel="noopener noreferrer">{CAMPUS.website.replace(/^https?:\/\/(www\.)?/, '')}</a>
        </Empty>
      )}
      <div className="list">
        {items?.map(r => {
          const loc = r.location_id ? byId.get(r.location_id) : null;
          return (
            <article key={r.id} className="card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <h3 style={{ flex: 1 }}>{r.title}</h3>
                {r.is_official ? <span className="tag ok"><Icon name="shield" />Official source</span> : <span className="tag">General guidance</span>}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)', margin: '8px 0' }}>{r.body}</div>
              {(r.opening_hours || r.contact_phone || r.contact_email) && (
                <div className="sub" style={{ display: 'grid', gap: 3, marginBottom: 8 }}>
                  {r.opening_hours && <span>Hours: {r.opening_hours}</span>}
                  {r.contact_phone && <span>Phone: <a href={`tel:${r.contact_phone.replace(/\s/g, '')}`}>{r.contact_phone}</a></span>}
                  {r.contact_email && <span>Email: <a href={`mailto:${r.contact_email}`}>{r.contact_email}</a></span>}
                </div>
              )}
              <div className="row wrap">
                <SourceLink url={r.source_url} label={r.source_label} date={r.source_updated_at ? fmtDate(r.source_updated_at) : null} />
                <span className="spacer" />
                {loc && <button className="btn small" onClick={() => { select(loc.id); go('#/map'); }}><Icon name="pin" />Show on map</button>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function Halls() {
  const { locations, locState, select, goDirections } = useStore();
  const halls = locations.filter(l => l.category === 'hall');
  return (
    <div className="screen">
      <BackLink href="#/guide" label="Guide" />
      <h1>Halls of residence</h1>
      <p className="lede">Locations from the campus directory. For room allocation, fees and availability, only the official {CAMPUS.short} accommodation channels are authoritative — this app does not have access to allocation records.</p>
      {locState === 'loading' && <Loading />}
      {locState === 'ready' && halls.length === 0 && <Empty icon="hall" title="No halls in the directory yet" />}
      <div className="list">
        {halls.map(h => (
          <div key={h.id} className="card">
            <div className="row"><h3 style={{ flex: 1 }}>{h.name}</h3><VerificationTag v={h.verification} /></div>
            {h.description && <p className="sub">{h.description}</p>}
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => { select(h.id); go('#/map'); }}><Icon name="pin" />Map</button>
              <button className="btn small primary" onClick={() => goDirections(h.id)}><Icon name="walk" />Directions</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const GUEST_PROGRESS_KEY = K('guest_checklist');

export function Checklist() {
  const { user, byId, select, toast } = useStore();
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    db<ChecklistItem[]>('checklist_items', 'select=*&is_published=eq.true&order=sort_order.asc').then(setItems).catch(e => setErr(e.message));
  }, []);
  useEffect(() => {
    if (!user) { try { setDone(new Set(JSON.parse(localStorage.getItem(GUEST_PROGRESS_KEY) || '[]'))); } catch { setDone(new Set()); } return; }
    db<{ item_id: string }[]>('checklist_progress', 'select=item_id').then(r => setDone(new Set(r.map(x => x.item_id)))).catch(() => {});
  }, [user]);

  const toggle = async (id: string) => {
    const has = done.has(id); setBusy(id);
    try {
      if (user) {
        if (has) await db('checklist_progress', `item_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
        else await db('checklist_progress', '', { method: 'POST', body: { item_id: id }, prefer: 'return=minimal' });
      }
      const next = new Set(done); has ? next.delete(id) : next.add(id); setDone(next); if (!has) track('checklist_done');
      if (!user) try { localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const total = items?.length || 0;
  const completed = items ? items.filter(i => done.has(i.id)).length : 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="screen">
      <BackLink href="#/guide" label="Guide" />
      <h1>My checklist</h1>
      <p className="lede">Tick items off as you complete them. <b>Official</b> items link to a {CAMPUS.short} source; <b>suggestions</b> are helpful tips, not requirements.</p>
      {!user && <Notice kind="info">You’re not signed in — progress is kept on this device only. <a href="#/login">Sign in</a> to sync it.</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
      {!items && !err && <Loading />}
      {items && total > 0 && (
        <div className="card" style={{ margin: '14px 0' }}>
          <div className="row"><b>{completed} of {total} done</b><span className="spacer" /><span className="sub">{pct}%</span></div>
          <div className="progress" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {items && total === 0 && <Empty icon="check" title="No checklist items published yet">Editors add items once they are confirmed against official {CAMPUS.short} sources.</Empty>}
      <div className="list">
        {items?.map(i => {
          const loc = i.related_location_id ? byId.get(i.related_location_id) : null;
          return (
            <div key={i.id} className="card check">
              <input type="checkbox" checked={done.has(i.id)} disabled={busy === i.id} onChange={() => toggle(i.id)} aria-label={`Mark “${i.title}” as done`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row wrap"><b style={{ textDecoration: done.has(i.id) ? 'line-through' : undefined }}>{i.title}</b>
                  {i.kind === 'official' ? <span className="tag ok">Official</span> : <span className="tag">Suggestion</span>}
                  {i.deadline && <span className="tag warn">Deadline {fmtDate(i.deadline)}</span>}
                </div>
                {i.explanation && <div className="sub" style={{ marginTop: 4 }}>{i.explanation}</div>}
                <div className="row wrap" style={{ marginTop: 6 }}>
                  <SourceLink url={i.source_url} label={i.source_label} />
                  {loc && <button className="btn small ghost" onClick={() => { select(loc.id); go('#/map'); }}><Icon name="pin" />{loc.name}</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FresherRoute({ seg }: { seg: string[] }) {
  if (!seg[1]) return <FresherHome />;
  if (seg[1] === 'checklist') return <Checklist />;
  if (seg[1] === 'halls') return <Halls />;
  return <FresherSection section={seg[1]} />;
}
