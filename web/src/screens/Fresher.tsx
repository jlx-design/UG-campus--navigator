import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { BackLink, Empty, Loading, Notice, SourceLink, VerificationTag, go } from '../components/common';
import type { ChecklistItem, FresherResource } from '../lib/types';
import { fmtDate } from '../lib/geo';

export const SECTIONS: { key: string; label: string; icon: string; blurb: string }[] = [
  { key: 'getting_started', label: 'Getting started', icon: 'sparkle', blurb: 'First steps after admission' },
  { key: 'registration', label: 'Registration', icon: 'edit', blurb: 'Verified registration guidance' },
  { key: 'orientation', label: 'Orientation', icon: 'navigate', blurb: 'Orientation information' },
  { key: 'academic', label: 'Academic resources', icon: 'book', blurb: 'Libraries, portals, learning' },
  { key: 'facilities', label: 'Campus essentials', icon: 'campus', blurb: 'Key places on campus' },
  { key: 'student_services', label: 'Student services', icon: 'services', blurb: 'Who can help with what' },
  { key: 'accommodation', label: 'Accommodation & halls', icon: 'hall', blurb: 'Halls and official contacts' },
  { key: 'navigation', label: 'Getting around', icon: 'walk', blurb: 'Gates, transport, wayfinding' },
  { key: 'faq', label: 'FAQs', icon: 'chat', blurb: 'Common questions' },
  { key: 'terminology', label: 'UG Explained', icon: 'info', blurb: 'University terms, explained' },
  { key: 'official_links', label: 'Official resources', icon: 'link', blurb: 'Links to official UG sites' },
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
  const counts = useMemo(() => { const m = new Map<string, number>(); rows?.forEach(r => m.set(r.section, (m.get(r.section) || 0) + 1)); return m; }, [rows]);
  return (
    <div className="screen">
      <h1>Fresher Hub</h1>
      <p className="lede">Your guide to starting at the University of Ghana. Official requirements are always linked to their UG source.</p>
      <div className="tiles" style={{ marginBottom: 10 }}>
        <a className="tile" href="#/fresher/checklist"><Icon name="check" /><b>My checklist</b><span>Track your first-weeks tasks</span></a>
        <a className="tile" href="#/assistant"><Icon name="chat" /><b>Ask the assistant</b><span>Questions in plain language</span></a>
        <a className="tile" href="#/fresher/halls"><Icon name="hall" /><b>Halls of residence</b><span>Find and get directions</span></a>
        <a className="tile" href="#/updates"><Icon name="bell" /><b>Announcements</b><span>Verified campus updates</span></a>
      </div>
      <div className="section-title">Browse topics</div>
      {err && <Notice kind="error">Could not load the hub: {err} <button className="btn small" onClick={load}>Retry</button></Notice>}
      {!rows && !err && <Loading />}
      <div className="list">
        {SECTIONS.map(s => (
          <a key={s.key} className="card row" href={`#/fresher/${s.key}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="cat-ic" style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}><Icon name={s.icon} style={{ width: 20, height: 20, color: 'var(--brand)' }} /></span>
            <div style={{ minWidth: 0 }}><h3>{s.label}</h3><div className="sub">{s.blurb}{rows ? ` · ${counts.get(s.key) || 0} item${counts.get(s.key) === 1 ? '' : 's'}` : ''}</div></div>
            <span className="spacer" /><Icon name="chevron" style={{ width: 18, color: 'var(--text-3)' }} />
          </a>
        ))}
      </div>
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
      <BackLink href="#/fresher" label="Fresher Hub" />
      <h1>{meta?.label || 'Topic'}</h1>
      {section === 'terminology' && <p className="lede">Plain-language explanations. Entries marked “General guidance” are not official UG policy.</p>}
      {err && <Notice kind="error">{err} <button className="btn small" onClick={load}>Retry</button></Notice>}
      {!items && !err && <Loading />}
      {items && items.length === 0 && (
        <Empty icon="book" title="Nothing published here yet">
          Verified content for this topic hasn’t been added. For now, check the official UG website: <a href="https://www.ug.edu.gh" target="_blank" rel="noopener noreferrer">ug.edu.gh</a>
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
                {loc && <button className="btn small" onClick={() => { select(loc.id); go('#/explore'); }}><Icon name="pin" />Show on map</button>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function Halls() {
  const { locations, locState, select, setDestId, setRoute } = useStore();
  const halls = locations.filter(l => l.category === 'hall');
  return (
    <div className="screen">
      <BackLink href="#/fresher" label="Fresher Hub" />
      <h1>Halls of residence</h1>
      <p className="lede">Locations from the campus directory. For room allocation, fees and availability, only the official UG accommodation channels are authoritative — this app does not have access to allocation records.</p>
      {locState === 'loading' && <Loading />}
      {locState === 'ready' && halls.length === 0 && <Empty icon="hall" title="No halls in the directory yet" />}
      <div className="list">
        {halls.map(h => (
          <div key={h.id} className="card">
            <div className="row"><h3 style={{ flex: 1 }}>{h.name}</h3><VerificationTag v={h.verification} /></div>
            {h.description && <p className="sub">{h.description}</p>}
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => { select(h.id); go('#/explore'); }}><Icon name="pin" />Map</button>
              <button className="btn small primary" onClick={() => { setRoute(null); setDestId(h.id); go('#/navigate'); }}><Icon name="walk" />Directions</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const GUEST_PROGRESS_KEY = 'ugnav.guest_checklist';

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
      const next = new Set(done); has ? next.delete(id) : next.add(id); setDone(next);
      if (!user) try { localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const total = items?.length || 0;
  const completed = items ? items.filter(i => done.has(i.id)).length : 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="screen">
      <BackLink href="#/fresher" label="Fresher Hub" />
      <h1>My checklist</h1>
      <p className="lede">Tick items off as you complete them. <b>Official</b> items link to a UG source; <b>suggestions</b> are helpful tips, not requirements.</p>
      {!user && <Notice kind="info">You’re not signed in — progress is kept on this device only. <a href="#/login">Sign in</a> to sync it.</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
      {!items && !err && <Loading />}
      {items && total > 0 && (
        <div className="card" style={{ margin: '14px 0' }}>
          <div className="row"><b>{completed} of {total} done</b><span className="spacer" /><span className="sub">{pct}%</span></div>
          <div className="progress" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {items && total === 0 && <Empty icon="check" title="No checklist items published yet">Editors add items once they are confirmed against official UG sources.</Empty>}
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
                  {loc && <button className="btn small ghost" onClick={() => { select(loc.id); go('#/explore'); }}><Icon name="pin" />{loc.name}</button>}
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
