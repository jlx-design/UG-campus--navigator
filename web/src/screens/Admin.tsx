import React, { useEffect, useState } from 'react';
import { APP_NAME } from '../config';
import { useStore } from '../store';
import { db, importOsm, rpc } from '../lib/api';
import { SearchBox } from '../components/SearchBox';
import { EVENT_CATS } from './Events';
import { Icon } from '../components/Icon';
import { BackLink, Empty, Loading, Notice, VerificationTag } from '../components/common';
import { SECTIONS } from './Fresher';
import { ANN_CATEGORIES } from './Updates';
import type { Announcement, ChecklistItem, FresherResource, Location, Report } from '../lib/types';
import { fmtDate } from '../lib/geo';

type Tab = 'overview' | 'insights' | 'locations' | 'rooms' | 'hours' | 'listings' | 'events' | 'announcements' | 'resources' | 'checklist' | 'emergency' | 'shuttles' | 'team' | 'reports' | 'audit';

export function Admin({ tab }: { tab: Tab }) {
  const { role, authReady, user } = useStore();
  if (!authReady) return <div className="screen"><Loading /></div>;
  if (!user || (role !== 'editor' && role !== 'admin'))
    return <div className="screen"><h1>Administration</h1><Notice kind="error">You need an editor or administrator role to view this area. Roles are granted by an administrator, not from inside the app.</Notice></div>;
  const tabs: [Tab, string][] = [['overview', 'Overview'], ['insights', 'Insights'], ['locations', 'Places'], ['rooms', 'Rooms'], ['hours', 'Opening hours'], ['listings', 'Business listings'], ['events', 'Events'], ['announcements', 'Announcements'], ['resources', 'Guide content'], ['checklist', 'Checklist'], ['emergency', 'Emergency'], ['shuttles', 'Shuttles'], ...(role === 'admin' ? [['team', 'Team'] as [Tab, string]] : []), ['reports', 'Reports'], ['audit', 'Audit log']];
  return (
    <div className="screen" style={{ maxWidth: 1000 }}>
      <BackLink href="#/me" label="Me" />
      <h1>Administration</h1>
      <p className="lede">Signed in as {role}. Every change here is enforced by database policies and recorded in the audit log.</p>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <a key={k} role="tab" aria-selected={tab === k} className="chip" aria-pressed={tab === k} href={`#/admin/${k}`}>{l}</a>)}</div>
      {tab === 'overview' && <Overview />}
      {tab === 'insights' && <Insights />}
      {tab === 'rooms' && <RoomsAdmin />}
      {tab === 'hours' && <HoursAdmin />}
      {tab === 'listings' && <ListingsAdmin />}
      {tab === 'events' && <EventsAdmin />}
      {tab === 'emergency' && <EmergencyAdmin />}
      {tab === 'shuttles' && <ShuttlesAdmin />}
      {tab === 'team' && role === 'admin' && <TeamAdmin />}
      {tab === 'locations' && <LocationsAdmin />}
      {tab === 'announcements' && <AnnouncementsAdmin />}
      {tab === 'resources' && <ResourcesAdmin />}
      {tab === 'checklist' && <ChecklistAdmin />}
      {tab === 'reports' && <ReportsAdmin />}
      {tab === 'audit' && <AuditAdmin />}
    </div>
  );
}

function useRows<T>(table: string, query: string) {
  const [rows, setRows] = useState<T[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = () => { setErr(null); db<T[]>(table, query).then(setRows).catch(e => setErr(e.message)); };
  useEffect(load, [table, query]);
  return { rows, err, load };
}

function Input({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div className="field"><label>{label}</label><input className="input" {...p} /></div>;
}
function Text({ label, ...p }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <div className="field"><label>{label}</label><textarea className="input" {...p} /></div>;
}
const blank = (v: string) => (v.trim() === '' ? null : v.trim());

// ───────── Locations ─────────
function LocationsAdmin() {
  const { role, categories, reloadLocations, toast } = useStore();
  const [filter, setFilter] = useState<'all' | 'unverified' | 'verified'>('unverified');
  const [q, setQ] = useState('');
  const query = `select=*&order=name.asc&limit=500${filter === 'verified' ? '&verification=eq.verified' : filter === 'unverified' ? '&verification=neq.verified' : ''}${q.trim().length >= 2 ? `&name=ilike.*${encodeURIComponent(q.trim())}*` : ''}`;
  const { rows, err, load } = useRows<Location>('locations', query);
  const [edit, setEdit] = useState<Partial<Location> | null>(null);
  const [importing, setImporting] = useState(false);

  const save = async () => {
    if (!edit) return;
    const body = {
      name: edit.name?.trim(), category: edit.category, description: blank(edit.description || ''), lat: Number(edit.lat), lng: Number(edit.lng),
      location_context: blank(edit.location_context || ''), alt_names: (edit.alt_names || []).map(s => s.trim()).filter(Boolean),
      accessibility: blank(edit.accessibility || ''), source_label: edit.source_label?.trim() || `${APP_NAME} editors`, source_url: blank(edit.source_url || ''),
      verification: edit.verification, is_published: edit.is_published ?? true,
      last_verified_at: edit.verification === 'verified' ? new Date().toISOString() : edit.last_verified_at ?? null,
    };
    if (!body.name || !body.category || !Number.isFinite(body.lat) || !Number.isFinite(body.lng)) { toast('Name, category and valid coordinates are required', 'error'); return; }
    try {
      if (edit.id) await db('locations', `id=eq.${edit.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      else await db('locations', '', { method: 'POST', body, prefer: 'return=minimal' });
      toast('Location saved'); setEdit(null); load(); reloadLocations();
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const verify = async (l: Location) => {
    try { await db('locations', `id=eq.${l.id}`, { method: 'PATCH', body: { verification: 'verified', last_verified_at: new Date().toISOString() }, prefer: 'return=minimal' }); toast(`${l.name} marked verified`); load(); reloadLocations(); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  const runImport = async () => {
    setImporting(true);
    try { const r = await importOsm(); toast(`OpenStreetMap import: ${r.inserted} new, ${r.updated} updated`); load(); reloadLocations(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setImporting(false); }
  };

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="seg">{(['unverified', 'verified', 'all'] as const).map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>
        <input className="input" style={{ width: 200 }} placeholder="Filter by name" value={q} onChange={e => setQ(e.target.value)} />
        <span className="spacer" />
        <button className="btn" onClick={() => setEdit({ verification: 'verified', is_published: true, alt_names: [], category: 'academic', source_label: '' })}><Icon name="plus" />Add place</button>
        {role === 'admin' && <button className="btn" onClick={runImport} disabled={importing}>{importing ? <span className="spinner" /> : <Icon name="refresh" />}Import from OpenStreetMap</button>}
      </div>
      <p className="hint">OpenStreetMap imports arrive as “unverified”. Verify a place only after checking it on the ground or against an official UG source. Imports never overwrite verified records.</p>
      {edit && (
        <div className="card" style={{ margin: '12px 0' }}>
          <h3>{edit.id ? 'Edit place' : 'New place'}</h3>
          <Input label="Official / verified name" value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} />
          <div className="field"><label>Category</label><select className="input" value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>{categories.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select></div>
          <div className="row"><Input label="Latitude" inputMode="decimal" value={edit.lat ?? ''} onChange={e => setEdit({ ...edit, lat: e.target.value as any })} /><Input label="Longitude" inputMode="decimal" value={edit.lng ?? ''} onChange={e => setEdit({ ...edit, lng: e.target.value as any })} /></div>
          <Input label="Alternative names (comma-separated)" value={(edit.alt_names || []).join(', ')} onChange={e => setEdit({ ...edit, alt_names: e.target.value.split(',') })} />
          <Text label="Description" value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} />
          <Input label="Location context (e.g. near which landmark)" value={edit.location_context || ''} onChange={e => setEdit({ ...edit, location_context: e.target.value })} />
          <Input label="Accessibility (verified facts only)" value={edit.accessibility || ''} onChange={e => setEdit({ ...edit, accessibility: e.target.value })} />
          <div className="row"><Input label="Source label" value={edit.source_label || ''} onChange={e => setEdit({ ...edit, source_label: e.target.value })} /><Input label="Source URL" type="url" value={edit.source_url || ''} onChange={e => setEdit({ ...edit, source_url: e.target.value })} /></div>
          <div className="row wrap">
            <div className="field"><label>Verification</label><select className="input" value={edit.verification} onChange={e => setEdit({ ...edit, verification: e.target.value as any })}><option value="verified">Verified</option><option value="unverified">Unverified</option><option value="osm_imported">OSM imported</option></select></div>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={edit.is_published ?? true} onChange={e => setEdit({ ...edit, is_published: e.target.checked })} />Published</label>
          </div>
          <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      {rows && rows.length === 0 && <Empty title="No places match" />}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>Name</th><th>Category</th><th>Status</th><th>Coordinates</th><th></th></tr></thead><tbody>
          {rows.map(l => (
            <tr key={l.id}>
              <td><b>{l.name}</b>{!l.is_published && <span className="tag" style={{ marginLeft: 6 }}>hidden</span>}<div className="sub">{l.source_url ? <a href={l.source_url} target="_blank" rel="noopener noreferrer">{l.source_label}</a> : l.source_label}</div></td>
              <td>{categories.find(c => c.slug === l.category)?.label}</td>
              <td><VerificationTag v={l.verification} /></td>
              <td className="sub">{l.lat.toFixed(5)}, {l.lng.toFixed(5)}<br /><a href={`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=19/${l.lat}/${l.lng}`} target="_blank" rel="noopener noreferrer">check on OSM</a></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn small" onClick={() => setEdit(l)}><Icon name="edit" /></button>{' '}
                {l.verification !== 'verified' && <button className="btn small" onClick={() => verify(l)}><Icon name="check" />Verify</button>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </>
  );
}

// ───────── Announcements ─────────
function AnnouncementsAdmin() {
  const { role, toast, locations } = useStore();
  const { rows, err, load } = useRows<Announcement>('announcements', 'select=*&order=updated_at.desc&limit=200');
  const [edit, setEdit] = useState<Partial<Announcement> | null>(null);
  const save = async (status?: Announcement['status']) => {
    if (!edit) return;
    const body: any = { title: edit.title?.trim(), summary: edit.summary?.trim(), body: blank(edit.body || ''), category: edit.category, source_org: edit.source_org?.trim(),
      source_url: blank(edit.source_url || ''), location_id: edit.location_id || null, published_at: edit.published_at || null, expires_at: edit.expires_at || null, status: status || edit.status || 'draft' };
    if (!body.title || !body.summary || !body.source_org) { toast('Title, summary and source organisation are required', 'error'); return; }
    if (body.status === 'published' && !body.source_url) { toast('Add a link to the original source before publishing', 'error'); return; }
    try {
      if (edit.id) await db('announcements', `id=eq.${edit.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      else await db('announcements', '', { method: 'POST', body, prefer: 'return=minimal' });
      toast(status === 'published' ? 'Published' : 'Saved'); setEdit(null); load();
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const setStatus = async (a: Announcement, status: Announcement['status']) => {
    try { await db('announcements', `id=eq.${a.id}`, { method: 'PATCH', body: { status }, prefer: 'return=minimal' }); toast(`Marked ${status}`); load(); } catch (e: any) { toast(e.message, 'error'); }
  };
  const dt = (v?: string | null) => (v ? v.slice(0, 10) : '');
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="sub">Editors draft and submit; administrators publish. Every announcement needs its original source.</span><span className="spacer" />
        <button className="btn" onClick={() => setEdit({ category: 'official', status: 'draft' })}><Icon name="plus" />New announcement</button></div>
      {edit && (
        <div className="card" style={{ marginBottom: 12 }}>
          <Input label="Title" value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} maxLength={200} />
          <Text label="Summary" value={edit.summary || ''} onChange={e => setEdit({ ...edit, summary: e.target.value })} maxLength={600} />
          <Text label="Full text (optional — prefer linking the source)" value={edit.body || ''} onChange={e => setEdit({ ...edit, body: e.target.value })} />
          <div className="row wrap">
            <div className="field"><label>Category</label><select className="input" value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>{Object.entries(ANN_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <Input label="Source organisation" value={edit.source_org || ''} onChange={e => setEdit({ ...edit, source_org: e.target.value })} />
          </div>
          <Input label="Original source URL" type="url" value={edit.source_url || ''} onChange={e => setEdit({ ...edit, source_url: e.target.value })} />
          <div className="row wrap">
            <Input label="Source publication date" type="date" value={dt(edit.published_at)} onChange={e => setEdit({ ...edit, published_at: e.target.value || null })} />
            <Input label="Expires (optional)" type="date" value={dt(edit.expires_at)} onChange={e => setEdit({ ...edit, expires_at: e.target.value || null })} />
          </div>
          <div className="field"><label>Related place (optional)</label><select className="input" value={edit.location_id || ''} onChange={e => setEdit({ ...edit, location_id: e.target.value || null })}><option value="">None</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="row wrap"><button className="btn" onClick={() => save('draft')}>Save draft</button><button className="btn" onClick={() => save('pending')}>Submit for approval</button>
            {role === 'admin' && <button className="btn primary" onClick={() => save('published')}>Publish</button>}<button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      {rows?.length === 0 && <Empty icon="bell" title="No announcements yet" />}
      <div className="list">
        {rows?.map(a => (
          <div key={a.id} className="card">
            <div className="row wrap"><span className={`tag ${a.status === 'published' ? 'ok' : a.status === 'pending' ? 'warn' : ''}`}>{a.status}</span><span className="sub">{ANN_CATEGORIES[a.category]} · {a.source_org} · source date {fmtDate(a.published_at)}</span></div>
            <h3 style={{ marginTop: 6 }}>{a.title}</h3>
            <div className="row wrap">
              <button className="btn small" onClick={() => setEdit(a)}><Icon name="edit" />Edit</button>
              {role === 'admin' && a.status !== 'published' && <button className="btn small" onClick={() => setStatus(a, 'published')}>Publish</button>}
              {a.status === 'published' && <button className="btn small" onClick={() => setStatus(a, 'unpublished')}>Unpublish</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ───────── Fresher resources ─────────
function ResourcesAdmin() {
  const { toast, locations } = useStore();
  const { rows, err, load } = useRows<FresherResource>('fresher_resources', 'select=*&order=section.asc,sort_order.asc');
  const [edit, setEdit] = useState<Partial<FresherResource> | null>(null);
  const save = async () => {
    if (!edit) return;
    const body = { section: edit.section, title: edit.title?.trim(), body: edit.body?.trim(), is_official: !!edit.is_official, source_label: blank(edit.source_label || ''), source_url: blank(edit.source_url || ''),
      source_updated_at: edit.source_updated_at || null, location_id: edit.location_id || null, contact_phone: blank(edit.contact_phone || ''), contact_email: blank(edit.contact_email || ''),
      opening_hours: blank(edit.opening_hours || ''), sort_order: Number(edit.sort_order ?? 100), is_published: !!edit.is_published };
    if (!body.title || !body.body) { toast('Title and text are required', 'error'); return; }
    if (body.is_official && !body.source_url) { toast('Official content must link to its UG source', 'error'); return; }
    try {
      if (edit.id) await db('fresher_resources', `id=eq.${edit.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      else await db('fresher_resources', '', { method: 'POST', body, prefer: 'return=minimal' });
      toast('Saved'); setEdit(null); load();
    } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="sub">Only mark content “official” when it restates an authoritative UG source you link to.</span><span className="spacer" />
        <button className="btn" onClick={() => setEdit({ section: 'getting_started', is_official: false, is_published: false, sort_order: 100 })}><Icon name="plus" />New item</button></div>
      {edit && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="field"><label>Section</label><select className="input" value={edit.section} onChange={e => setEdit({ ...edit, section: e.target.value })}>{SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          <Input label="Title" value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} />
          <Text label="Text" value={edit.body || ''} onChange={e => setEdit({ ...edit, body: e.target.value })} />
          <div className="row wrap"><Input label="Source label" value={edit.source_label || ''} onChange={e => setEdit({ ...edit, source_label: e.target.value })} /><Input label="Source URL" type="url" value={edit.source_url || ''} onChange={e => setEdit({ ...edit, source_url: e.target.value })} /><Input label="Source last updated" type="date" value={edit.source_updated_at || ''} onChange={e => setEdit({ ...edit, source_updated_at: e.target.value })} /></div>
          <div className="row wrap"><Input label="Phone (verified)" value={edit.contact_phone || ''} onChange={e => setEdit({ ...edit, contact_phone: e.target.value })} /><Input label="Email (verified)" value={edit.contact_email || ''} onChange={e => setEdit({ ...edit, contact_email: e.target.value })} /><Input label="Opening hours (verified)" value={edit.opening_hours || ''} onChange={e => setEdit({ ...edit, opening_hours: e.target.value })} /></div>
          <div className="field"><label>Related place</label><select className="input" value={edit.location_id || ''} onChange={e => setEdit({ ...edit, location_id: e.target.value || null })}><option value="">None</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="row wrap"><Input label="Sort order" type="number" value={edit.sort_order ?? 100} onChange={e => setEdit({ ...edit, sort_order: Number(e.target.value) })} />
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!edit.is_official} onChange={e => setEdit({ ...edit, is_official: e.target.checked })} />Official UG information</label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!edit.is_published} onChange={e => setEdit({ ...edit, is_published: e.target.checked })} />Published</label></div>
          <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      {rows?.length === 0 && <Empty icon="book" title="No guide content yet" />}
      <div className="list">{rows?.map(r => (
        <div key={r.id} className="card row"><div style={{ flex: 1, minWidth: 0 }}><b>{r.title}</b><div className="sub">{SECTIONS.find(s => s.key === r.section)?.label} · {r.is_official ? 'official' : 'guidance'} · {r.is_published ? 'published' : 'draft'}</div></div><button className="btn small" onClick={() => setEdit(r)}><Icon name="edit" /></button></div>
      ))}</div>
    </>
  );
}

// ───────── Checklist ─────────
function ChecklistAdmin() {
  const { toast } = useStore();
  const { rows, err, load } = useRows<ChecklistItem>('checklist_items', 'select=*&order=sort_order.asc');
  const [edit, setEdit] = useState<Partial<ChecklistItem> | null>(null);
  const save = async () => {
    if (!edit) return;
    const body = { title: edit.title?.trim(), explanation: blank(edit.explanation || ''), kind: edit.kind, source_label: blank(edit.source_label || ''), source_url: blank(edit.source_url || ''),
      deadline: edit.deadline || null, sort_order: Number(edit.sort_order ?? 100), is_published: !!edit.is_published };
    if (!body.title) { toast('Title is required', 'error'); return; }
    if ((body.kind === 'official' || body.deadline) && !body.source_url) { toast('Official items and deadlines must link to their source', 'error'); return; }
    try {
      if (edit.id) await db('checklist_items', `id=eq.${edit.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      else await db('checklist_items', '', { method: 'POST', body, prefer: 'return=minimal' });
      toast('Saved'); setEdit(null); load();
    } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="spacer" /><button className="btn" onClick={() => setEdit({ kind: 'suggestion', is_published: false, sort_order: 100 })}><Icon name="plus" />New item</button></div>
      {edit && (
        <div className="card" style={{ marginBottom: 12 }}>
          <Input label="Task" value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} />
          <Text label="Explanation" value={edit.explanation || ''} onChange={e => setEdit({ ...edit, explanation: e.target.value })} />
          <div className="row wrap"><div className="field"><label>Type</label><select className="input" value={edit.kind} onChange={e => setEdit({ ...edit, kind: e.target.value as any })}><option value="suggestion">Suggestion</option><option value="official">Official requirement</option></select></div>
            <Input label="Deadline (only if published by UG)" type="date" value={edit.deadline || ''} onChange={e => setEdit({ ...edit, deadline: e.target.value })} /></div>
          <div className="row wrap"><Input label="Source label" value={edit.source_label || ''} onChange={e => setEdit({ ...edit, source_label: e.target.value })} /><Input label="Source URL" type="url" value={edit.source_url || ''} onChange={e => setEdit({ ...edit, source_url: e.target.value })} /></div>
          <div className="row wrap"><Input label="Sort order" type="number" value={edit.sort_order ?? 100} onChange={e => setEdit({ ...edit, sort_order: Number(e.target.value) })} />
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!edit.is_published} onChange={e => setEdit({ ...edit, is_published: e.target.checked })} />Published</label></div>
          <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      {rows?.length === 0 && <Empty icon="check" title="No checklist items yet" />}
      <div className="list">{rows?.map(r => (
        <div key={r.id} className="card row"><div style={{ flex: 1 }}><b>{r.title}</b><div className="sub">{r.kind} · {r.is_published ? 'published' : 'draft'}{r.deadline ? ` · due ${fmtDate(r.deadline)}` : ''}</div></div><button className="btn small" onClick={() => setEdit(r)}><Icon name="edit" /></button></div>
      ))}</div>
    </>
  );
}

// ───────── Reports ─────────
function ReportsAdmin() {
  const { toast, byId } = useStore();
  const [status, setStatusF] = useState('open');
  const { rows, err, load } = useRows<Report>('reports', `select=*&status=eq.${status}&order=created_at.desc&limit=200`);
  const update = async (r: Report, s: Report['status']) => {
    const note = s === 'rejected' || s === 'resolved' ? prompt('Reviewer note (optional)') ?? '' : '';
    try { await db('reports', `id=eq.${r.id}`, { method: 'PATCH', body: { status: s, reviewer_note: note || r.reviewer_note }, prefer: 'return=minimal' }); toast(`Report ${s}`); load(); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <>
      <div className="seg" style={{ marginBottom: 12 }}>{['open', 'reviewing', 'resolved', 'rejected'].map(s => <button key={s} aria-pressed={status === s} onClick={() => setStatusF(s)}>{s}</button>)}</div>
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      {rows?.length === 0 && <Empty icon="flag" title={`No ${status} reports`} />}
      <div className="list">{rows?.map(r => (
        <div key={r.id} className="card">
          <div className="row wrap"><span className="tag">{r.kind.replace(/_/g, ' ')}</span><span className="sub">{fmtDate(r.created_at, true)}</span>{r.location_id && <span className="sub">· {byId.get(r.location_id)?.name || 'place'}</span>}</div>
          <p style={{ margin: '8px 0' }}>{r.message}</p>
          {r.reviewer_note && <p className="sub">Note: {r.reviewer_note}</p>}
          <div className="row wrap">{status !== 'reviewing' && <button className="btn small" onClick={() => update(r, 'reviewing')}>Reviewing</button>}<button className="btn small" onClick={() => update(r, 'resolved')}>Resolve</button><button className="btn small" onClick={() => update(r, 'rejected')}>Reject</button></div>
        </div>
      ))}</div>
    </>
  );
}

function AuditAdmin() {
  const { rows, err } = useRows<any>('audit_log', 'select=id,actor_id,table_name,row_id,action,at,new_data&order=at.desc&limit=100');
  return (
    <>
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      {rows?.length === 0 && <Empty title="No audit entries yet" />}
      {rows && rows.length > 0 && <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>When</th><th>Action</th><th>Table</th><th>Record</th><th>Actor</th></tr></thead><tbody>
        {rows.map((r: any) => <tr key={r.id}><td className="sub">{fmtDate(r.at, true)}</td><td>{r.action}</td><td>{r.table_name}</td><td className="sub">{r.new_data?.name || r.new_data?.title || r.row_id || (r.action === 'OSM_IMPORT' ? JSON.stringify(r.new_data) : '')}</td><td className="sub">{r.actor_id ? r.actor_id.slice(0, 8) : 'system'}</td></tr>)}
      </tbody></table></div>}
    </>
  );
}


// ───────── Overview ─────────
function Overview() {
  const [st, setSt] = useState<Record<string, number> | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { rpc<any>('admin_stats', {}).then(setSt).catch(e => setErr(e.message)); }, []);
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!st) return <Loading />;
  const tiles: [string, string, string, string][] = [
    ['Users', `${st.users}`, `${st.verified_users} verified`, '#/admin/team'], ['Places', `${st.locations}`, `${st.verified_locations} verified`, '#/admin/locations'],
    ['Open reports', `${st.open_reports}`, 'awaiting review', '#/admin/reports'], ['Announcements', `${st.published_announcements}`, `${st.pending_announcements} pending approval`, '#/admin/announcements'],
    ['Guide items', `${st.guide_items}`, 'published', '#/admin/resources'], ['Shuttles', `${st.live_shuttles} live`, `${st.shuttle_routes} active routes`, '#/admin/shuttles'],
    ['Timetable courses', `${st.courses}`, 'added by students', '#/admin/overview'],
  ];
  return (
    <>
      <div className="stat-grid">{tiles.map(([l, v, sub, href]) => <a key={l} className="stat" href={href}><span>{l}</span><b>{v}</b><small>{sub}</small></a>)}</div>
      {st.locations === 0 && <Notice kind="info">The campus directory is empty. Go to <a href="#/admin/locations">Places</a> → “Import from OpenStreetMap” to load named campus buildings, then verify them.</Notice>}
    </>
  );
}

// ───────── Emergency contacts ─────────
function EmergencyAdmin() {
  const { toast } = useStore();
  const { rows, err, load } = useRows<any>('emergency_contacts', 'select=*&order=sort_order.asc');
  const [edit, setEdit] = useState<any | null>(null);
  const save = async () => {
    const e = edit; const body = { name: e.name?.trim(), category: e.category, phone: blank(e.phone || ''), is_emergency: !!e.is_emergency, description: blank(e.description || ''), source_label: e.source_label?.trim(), source_url: e.source_url?.trim(), checked_at: e.checked_at || new Date().toISOString().slice(0, 10), sort_order: Number(e.sort_order ?? 100), is_published: e.is_published ?? true };
    if (!body.name || !body.source_label || !body.source_url) { toast('Name and a source (label + URL) are required', 'error'); return; }
    try { if (e.id) await db('emergency_contacts', `id=eq.${e.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); else await db('emergency_contacts', '', { method: 'POST', body, prefer: 'return=minimal' }); setEdit(null); load(); toast('Saved'); } catch (x: any) { toast(x.message, 'error'); }
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="sub">Every number must cite the page you checked it against.</span><span className="spacer" /><button className="btn" onClick={() => setEdit({ category: 'campus', is_emergency: true, is_published: true, sort_order: 100 })}><Icon name="plus" />Add contact</button></div>
      {edit && (
        <div className="card" style={{ marginBottom: 12 }}>
          <Input label="Name" value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} />
          <div className="row wrap"><div className="field"><label>Category</label><select className="input" value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>{['national', 'medical', 'security', 'counselling', 'campus', 'other'].map(c => <option key={c}>{c}</option>)}</select></div>
            <Input label="Phone" value={edit.phone || ''} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></div>
          <Text label="Description" value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} />
          <div className="row wrap"><Input label="Source label" value={edit.source_label || ''} onChange={e => setEdit({ ...edit, source_label: e.target.value })} /><Input label="Source URL" type="url" value={edit.source_url || ''} onChange={e => setEdit({ ...edit, source_url: e.target.value })} /><Input label="Checked on" type="date" value={edit.checked_at || ''} onChange={e => setEdit({ ...edit, checked_at: e.target.value })} /></div>
          <div className="row wrap"><label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!edit.is_emergency} onChange={e => setEdit({ ...edit, is_emergency: e.target.checked })} />Emergency line</label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={edit.is_published ?? true} onChange={e => setEdit({ ...edit, is_published: e.target.checked })} />Published</label>
            <Input label="Order" type="number" value={edit.sort_order ?? 100} onChange={e => setEdit({ ...edit, sort_order: e.target.value })} /></div>
          <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      <div className="list">{rows?.map(r => <div key={r.id} className="card row"><div style={{ flex: 1 }}><b>{r.name}</b> {r.phone && <span className="tag">{r.phone}</span>}<div className="sub">{r.category} · {r.is_emergency ? 'emergency' : 'info line'} · {r.is_published ? 'published' : 'hidden'} · {r.source_label}</div></div><button className="btn small" onClick={() => setEdit(r)}><Icon name="edit" /></button></div>)}</div>
    </>
  );
}

// ───────── Shuttles ─────────
function ShuttlesAdmin() {
  const { toast, geo, startGeo } = useStore();
  const routes = useRows<any>('shuttle_routes', 'select=*&order=name.asc');
  const vehicles = useRows<any>('shuttle_vehicles', 'select=*&order=label.asc');
  const stops = useRows<any>('shuttle_stops', 'select=*&order=route_id.asc,seq.asc');
  const [r, setR] = useState<any | null>(null); const [v, setV] = useState<any | null>(null); const [st, setSt] = useState<any | null>(null);
  const saveRoute = async () => { const body = { name: r.name?.trim(), color: r.color || '#0ea5e9', description: blank(r.description || ''), hours: blank(r.hours || ''), source_label: blank(r.source_label || ''), source_url: blank(r.source_url || ''), is_active: r.is_active ?? true };
    if (!body.name) return toast('Route name required', 'error');
    try { if (r.id) await db('shuttle_routes', `id=eq.${r.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); else await db('shuttle_routes', '', { method: 'POST', body, prefer: 'return=minimal' }); setR(null); routes.load(); toast('Route saved'); } catch (e: any) { toast(e.message, 'error'); } };
  const saveVehicle = async () => { const body = { label: v.label?.trim(), route_id: v.route_id || null, is_active: v.is_active ?? true };
    if (!body.label) return toast('Vehicle label required', 'error');
    try { if (v.id) await db('shuttle_vehicles', `id=eq.${v.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); else await db('shuttle_vehicles', '', { method: 'POST', body, prefer: 'return=minimal' }); setV(null); vehicles.load(); toast('Vehicle saved'); } catch (e: any) { toast(e.message, 'error'); } };
  const saveStop = async () => { const body = { route_id: st.route_id, seq: Number(st.seq), name: st.name?.trim(), lat: Number(st.lat), lng: Number(st.lng) };
    if (!body.route_id || !body.name || !Number.isFinite(body.lat) || !Number.isFinite(body.lng)) return toast('Route, name and coordinates required', 'error');
    try { if (st.id) await db('shuttle_stops', `id=eq.${st.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); else await db('shuttle_stops', '', { method: 'POST', body, prefer: 'return=minimal' }); setSt(null); stops.load(); toast('Stop saved'); } catch (e: any) { toast(e.message, 'error'); } };
  const del = async (table: string, id: string, reload: () => void) => { if (!confirm('Delete this item?')) return; try { await db(table, `id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  return (
    <>
      <p className="hint">Enter routes and stops only as confirmed with the UG transport office. Drivers are granted the <b>driver</b> role in the Team tab, then share their live position from Shuttles → Driver mode.</p>
      <div className="section-title row">Routes<span className="spacer" /><button className="btn small" onClick={() => setR({ color: '#0ea5e9', is_active: true })}><Icon name="plus" />Route</button></div>
      {r && <div className="card"><Input label="Route name" value={r.name || ''} onChange={e => setR({ ...r, name: e.target.value })} /><div className="row wrap"><div className="field"><label>Colour</label><input className="input" type="color" value={r.color || '#0ea5e9'} onChange={e => setR({ ...r, color: e.target.value })} /></div><Input label="Hours (verified)" value={r.hours || ''} onChange={e => setR({ ...r, hours: e.target.value })} /></div>
        <Text label="Description" value={r.description || ''} onChange={e => setR({ ...r, description: e.target.value })} /><div className="row wrap"><Input label="Source label" value={r.source_label || ''} onChange={e => setR({ ...r, source_label: e.target.value })} /><Input label="Source URL" value={r.source_url || ''} onChange={e => setR({ ...r, source_url: e.target.value })} /></div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={r.is_active ?? true} onChange={e => setR({ ...r, is_active: e.target.checked })} />Active</label>
        <div className="row"><button className="btn primary" onClick={saveRoute}>Save</button><button className="btn ghost" onClick={() => setR(null)}>Cancel</button></div></div>}
      <div className="list">{routes.rows?.map(x => <div key={x.id} className="card row"><span className="route-dot" style={{ ['--c' as any]: x.color }} /><b style={{ flex: 1 }}>{x.name}</b><button className="btn small" onClick={() => setR(x)}><Icon name="edit" /></button><button className="btn small" onClick={() => del('shuttle_routes', x.id, routes.load)}><Icon name="trash" /></button></div>)}</div>
      {routes.rows?.length === 0 && <Empty icon="bus" title="No routes yet" />}

      <div className="section-title row">Stops<span className="spacer" /><button className="btn small" disabled={!routes.rows?.length} onClick={() => setSt({ route_id: routes.rows?.[0]?.id, seq: (stops.rows?.length || 0) + 1 })}><Icon name="plus" />Stop</button></div>
      {st && <div className="card"><div className="row wrap"><div className="field"><label>Route</label><select className="input" value={st.route_id} onChange={e => setSt({ ...st, route_id: e.target.value })}>{routes.rows?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><Input label="Order" type="number" value={st.seq} onChange={e => setSt({ ...st, seq: e.target.value })} /></div>
        <Input label="Stop name" value={st.name || ''} onChange={e => setSt({ ...st, name: e.target.value })} />
        <div className="row wrap"><Input label="Latitude" value={st.lat ?? ''} onChange={e => setSt({ ...st, lat: e.target.value })} /><Input label="Longitude" value={st.lng ?? ''} onChange={e => setSt({ ...st, lng: e.target.value })} />
          <button className="btn small" style={{ alignSelf: 'center' }} onClick={() => { startGeo(); if (geo.status === 'ok') setSt({ ...st, lat: geo.pos[0].toFixed(6), lng: geo.pos[1].toFixed(6) }); else toast('Getting your GPS position… tap again in a moment'); }}><Icon name="locate" />Use my position</button></div>
        <div className="row"><button className="btn primary" onClick={saveStop}>Save</button><button className="btn ghost" onClick={() => setSt(null)}>Cancel</button></div></div>}
      <div className="list">{stops.rows?.map(x => <div key={x.id} className="card row"><span className="tag">{x.seq}</span><b style={{ flex: 1 }}>{x.name}</b><span className="sub">{routes.rows?.find(r2 => r2.id === x.route_id)?.name}</span><button className="btn small" onClick={() => setSt(x)}><Icon name="edit" /></button><button className="btn small" onClick={() => del('shuttle_stops', x.id, stops.load)}><Icon name="trash" /></button></div>)}</div>

      <div className="section-title row">Vehicles<span className="spacer" /><button className="btn small" onClick={() => setV({ is_active: true, route_id: routes.rows?.[0]?.id })}><Icon name="plus" />Vehicle</button></div>
      {v && <div className="card"><Input label="Label (e.g. fleet no.)" value={v.label || ''} onChange={e => setV({ ...v, label: e.target.value })} /><div className="field"><label>Route</label><select className="input" value={v.route_id || ''} onChange={e => setV({ ...v, route_id: e.target.value })}><option value="">None</option>{routes.rows?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={v.is_active ?? true} onChange={e => setV({ ...v, is_active: e.target.checked })} />Active</label>
        <div className="row"><button className="btn primary" onClick={saveVehicle}>Save</button><button className="btn ghost" onClick={() => setV(null)}>Cancel</button></div></div>}
      <div className="list">{vehicles.rows?.map(x => <div key={x.id} className="card row"><Icon name="bus" style={{ width: 18 }} /><b style={{ flex: 1 }}>{x.label}</b><span className="sub">{routes.rows?.find(r2 => r2.id === x.route_id)?.name || 'no route'}</span><button className="btn small" onClick={() => setV(x)}><Icon name="edit" /></button><button className="btn small" onClick={() => del('shuttle_vehicles', x.id, vehicles.load)}><Icon name="trash" /></button></div>)}</div>
    </>
  );
}

// ───────── Team (admins only) ─────────
function TeamAdmin() {
  const { toast } = useStore();
  const [team, setTeam] = useState<any[] | null>(null);
  const invites = useRows<any>('admin_invites', 'select=*&order=created_at.desc');
  const [email, setEmail] = useState(''); const [role, setRole] = useState('editor');
  const load = () => rpc<any[]>('admin_team', {}).then(setTeam).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);
  const invite = async () => {
    const em = email.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Enter a valid email', 'error');
    try { await db('admin_invites', 'on_conflict=email', { method: 'POST', body: { email: em, role }, prefer: 'resolution=merge-duplicates,return=minimal' }); setEmail(''); invites.load(); toast(`${em} will become ${role} after they verify their email and sign in`); } catch (e: any) { toast(e.message, 'error'); }
  };
  const setUserRole = async (user_id: string, r: string | null) => {
    try { if (r) await db('app_roles', `user_id=eq.${user_id}`, { method: 'PATCH', body: { role: r }, prefer: 'return=minimal' }); else await db('app_roles', `user_id=eq.${user_id}`, { method: 'DELETE', prefer: 'return=minimal' }); load(); toast('Role updated'); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <>
      <div className="card">
        <h3>Grant a role</h3>
        <p className="sub">The person gets the role automatically once they sign in with this email and verify it.</p>
        <div className="row wrap"><input className="input" style={{ flex: 2, minWidth: 200 }} type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <select className="input" style={{ flex: 1, minWidth: 120 }} value={role} onChange={e => setRole(e.target.value)}><option value="editor">Editor</option><option value="driver">Shuttle driver</option><option value="admin">Admin</option></select>
          <button className="btn primary" onClick={invite}>Grant</button></div>
      </div>
      <div className="section-title">Team</div>
      {!team && <Loading />}
      <div className="list">{team?.map(t => (
        <div key={t.user_id} className="card row"><div style={{ flex: 1, minWidth: 0 }}><b>{t.name || t.email}</b><div className="sub">{t.email}</div></div>
          <select className="input" style={{ width: 'auto' }} value={t.role} onChange={e => setUserRole(t.user_id, e.target.value)}><option value="editor">Editor</option><option value="driver">Driver</option><option value="admin">Admin</option></select>
          <button className="btn small" onClick={() => setUserRole(t.user_id, null)} aria-label="Remove role"><Icon name="trash" /></button></div>
      ))}</div>
      <div className="section-title">Pending grants</div>
      <div className="list">{invites.rows?.map(i => <div key={i.email} className="card row"><b style={{ flex: 1 }}>{i.email}</b><span className="tag">{i.role}</span>
        <button className="btn small" onClick={async () => { await db('admin_invites', `email=eq.${encodeURIComponent(i.email)}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {}); invites.load(); }}><Icon name="trash" /></button></div>)}</div>
    </>
  );
}


// ───────── Place picker used by the editors below ─────────
function PlacePick({ value, onChange, label = 'Building / place' }: { value: string | null; onChange: (id: string | null) => void; label?: string }) {
  const { byId } = useStore();
  return <div className="field"><label>{label}</label>{value ? <div className="chip-sel"><Icon name="pin" />{byId.get(value)?.name || 'Selected place'}<button className="icon-btn sm" aria-label="Clear" onClick={() => onChange(null)}><Icon name="close" /></button></div> : <SearchBox onPick={l => onChange(l.id)} placeholder="Search the directory…" />}</div>;
}
const SRC = ({ v, set }: { v: any; set: (x: any) => void }) => (
  <div className="row wrap"><Input label="Source label (required)" value={v.source_label || ''} onChange={e => set({ ...v, source_label: e.target.value })} /><Input label="Source URL" type="url" value={v.source_url || ''} onChange={e => set({ ...v, source_url: e.target.value })} /></div>
);

// ───────── Insights (aggregate counts only) ─────────
function Insights() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [days, setDays] = useState(30);
  useEffect(() => { setD(null); rpc<any>('admin_insights', { p_days: days }).then(setD).catch(e => setErr(e.message)); }, [days]);
  if (err) return <Notice kind="error">{err}</Notice>;
  const totals: Record<string, number> = {}; for (const r of d?.daily || []) totals[r.event] = (totals[r.event] || 0) + r.n;
  const opens = (d?.daily || []).filter((r: any) => r.event === 'app_open'); const max = Math.max(1, ...opens.map((r: any) => r.n));
  const L: Record<string, string> = { app_open: 'App opens', search: 'Searches', place_view: 'Places viewed', route: 'Routes planned', nav_start: 'Navigations started', nav_arrive: 'Arrivals', ai_question: 'AI questions', install: 'Installs' };
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="sub">Anonymous daily counts — no personal data or search text is stored.</span><span className="spacer" /><div className="seg">{[7, 30, 90].map(n => <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>{n}d</button>)}</div></div>
      {!d ? <Loading /> : <>
        <div className="stat-grid">{Object.keys(L).map(k => <div key={k} className="stat"><span>{L[k]}</span><b>{totals[k] || 0}</b></div>)}</div>
        <div className="card"><h3>App opens per day</h3>{opens.length === 0 ? <p className="sub">No data yet.</p> : <div className="bars">{opens.map((r: any) => <div key={r.day} title={`${r.day}: ${r.n}`}><i style={{ height: `${(r.n / max) * 100}%` }} /></div>)}</div>}</div>
        <div className="row wrap" style={{ alignItems: 'stretch', marginTop: 10 }}>
          {[['Top destinations (routes)', d.top_destinations], ['Most viewed places', d.top_viewed]].map(([t, list]: any) => (
            <div key={t} className="card" style={{ flex: 1, minWidth: 240, marginTop: 0 }}><h3>{t}</h3>{list.length === 0 ? <p className="sub">No data yet.</p> : <ol className="rank">{list.map((x: any) => <li key={x.name}><span>{x.name}</span><b>{x.n}</b></li>)}</ol>}</div>))}
        </div>
      </>}
    </>
  );
}

// ───────── Rooms ─────────
function RoomsAdmin() {
  const { toast, byId } = useStore();
  const { rows, err, load } = useRows<any>('rooms', 'select=*&order=code.asc&limit=1000');
  const [e, setE] = useState<any | null>(null); const [q, setQ] = useState('');
  const save = async () => {
    const body = { location_id: e.location_id, code: e.code?.trim(), name: blank(e.name || ''), floor: blank(e.floor || ''), capacity: e.capacity ? Number(e.capacity) : null, directions: blank(e.directions || ''),
      source_label: e.source_label?.trim(), source_url: blank(e.source_url || ''), verification: e.verification || 'unverified', is_published: e.is_published ?? true };
    if (!body.location_id || !body.code || !body.source_label) return toast('Building, room code and source are required', 'error');
    try { if (e.id) await db('rooms', `id=eq.${e.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); else await db('rooms', '', { method: 'POST', body, prefer: 'return=minimal' }); setE(null); load(); toast('Room saved'); } catch (x: any) { toast(x.message, 'error'); }
  };
  const shown = (rows || []).filter(r => !q || `${r.code} ${r.name || ''} ${byId.get(r.location_id)?.name || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><input className="input" style={{ flex: 1 }} placeholder="Filter rooms…" value={q} onChange={x => setQ(x.target.value)} /><button className="btn" onClick={() => setE({ verification: 'unverified', is_published: true })}><Icon name="plus" />Room</button></div>
      {e && <div className="card" style={{ marginBottom: 12 }}>
        <PlacePick value={e.location_id || null} onChange={id => setE({ ...e, location_id: id })} />
        <div className="row wrap"><Input label="Room code" placeholder="e.g. JQB 23" value={e.code || ''} onChange={x => setE({ ...e, code: x.target.value })} /><Input label="Name (optional)" value={e.name || ''} onChange={x => setE({ ...e, name: x.target.value })} /></div>
        <div className="row wrap"><Input label="Floor" placeholder="e.g. First floor" value={e.floor || ''} onChange={x => setE({ ...e, floor: x.target.value })} /><Input label="Capacity" type="number" value={e.capacity || ''} onChange={x => setE({ ...e, capacity: x.target.value })} /></div>
        <Text label="How to find it inside" value={e.directions || ''} onChange={x => setE({ ...e, directions: x.target.value })} />
        <SRC v={e} set={setE} />
        <div className="row wrap"><label className="row" style={{ gap: 8 }}><input type="checkbox" checked={e.verification === 'verified'} onChange={x => setE({ ...e, verification: x.target.checked ? 'verified' : 'unverified' })} />Verified on site</label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={e.is_published ?? true} onChange={x => setE({ ...e, is_published: x.target.checked })} />Published</label></div>
        <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn ghost" onClick={() => setE(null)}>Cancel</button></div></div>}
      {err && <Notice kind="error">{err}</Notice>}{!rows && !err && <Loading />}
      {rows?.length === 0 && <Empty icon="door" title="No rooms yet">Add lecture rooms so students can search “JQB 23” and get directions to the right building.</Empty>}
      <div className="list">{shown.slice(0, 300).map(r => <div key={r.id} className="card row"><div style={{ flex: 1, minWidth: 0 }}><b>{r.code}</b>{r.name ? ` · ${r.name}` : ''}<div className="sub">{byId.get(r.location_id)?.name}{r.floor ? ` · ${r.floor}` : ''} · {r.verification}{r.is_published ? '' : ' · hidden'}</div></div>
        <button className="btn small" onClick={() => setE(r)}><Icon name="edit" /></button><button className="btn small" onClick={async () => { if (confirm(`Delete ${r.code}?`)) { await db('rooms', `id=eq.${r.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(x => toast(x.message, 'error')); load(); } }}><Icon name="trash" /></button></div>)}</div>
    </>
  );
}

// ───────── Opening hours ─────────
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function HoursAdmin() {
  const { toast } = useStore();
  const [loc, setLoc] = useState<string | null>(null); const [rows, setRows] = useState<any[] | null>(null);
  const [form, setForm] = useState<any>({ days: [1, 2, 3, 4, 5], opens: '08:00', closes: '17:00', checked_at: new Date().toISOString().slice(0, 10) });
  const load = (id: string) => db<any[]>('location_hours', `select=*&location_id=eq.${id}&order=weekday.asc,opens.asc`).then(setRows).catch(e => toast(e.message, 'error'));
  useEffect(() => { if (loc) load(loc); else setRows(null); }, [loc]);
  const add = async () => {
    if (!loc || !form.days.length || !form.source_label?.trim()) return toast('Pick a place, days and a source', 'error');
    if (form.closes <= form.opens) return toast('Closing time must be after opening time', 'error');
    try { await db('location_hours', '', { method: 'POST', prefer: 'return=minimal', body: form.days.map((d: number) => ({ location_id: loc, weekday: d, opens: form.opens, closes: form.closes, note: blank(form.note || ''), source_label: form.source_label.trim(), source_url: blank(form.source_url || ''), checked_at: form.checked_at })) }); load(loc); toast('Hours added'); } catch (x: any) { toast(x.message, 'error'); }
  };
  return (
    <>
      <p className="hint">Only enter hours you've confirmed (signage, official page, or the office itself), and cite where they came from. Students see “Open now” on the place card.</p>
      <PlacePick value={loc} onChange={setLoc} label="Place" />
      {loc && <div className="card">
        <div className="field"><label>Days</label><div className="seg wrap">{WD.map((d, i) => <button key={d} aria-pressed={form.days.includes(i + 1)} onClick={() => setForm({ ...form, days: form.days.includes(i + 1) ? form.days.filter((x: number) => x !== i + 1) : [...form.days, i + 1] })}>{d}</button>)}</div></div>
        <div className="row wrap"><Input label="Opens" type="time" value={form.opens} onChange={e => setForm({ ...form, opens: e.target.value })} /><Input label="Closes" type="time" value={form.closes} onChange={e => setForm({ ...form, closes: e.target.value })} /><Input label="Checked on" type="date" value={form.checked_at} onChange={e => setForm({ ...form, checked_at: e.target.value })} /></div>
        <Input label="Note (optional)" placeholder="e.g. semester time only" value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })} />
        <SRC v={form} set={setForm} />
        <button className="btn primary" onClick={add}>Add hours</button>
      </div>}
      {rows && <div className="list" style={{ marginTop: 10 }}>{rows.length === 0 && <p className="sub">No hours yet for this place.</p>}{rows.map(r => <div key={r.id} className="card row"><b style={{ width: 44 }}>{WD[r.weekday - 1]}</b><span style={{ flex: 1 }}>{r.opens.slice(0, 5)}–{r.closes.slice(0, 5)}{r.note ? ` · ${r.note}` : ''}<div className="sub">{r.source_label} · {r.checked_at}</div></span>
        <button className="btn small" onClick={async () => { await db('location_hours', `id=eq.${r.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(x => toast(x.message, 'error')); load(loc!); }}><Icon name="trash" /></button></div>)}</div>}
    </>
  );
}

// ───────── Business listings (clearly separated from university facilities) ─────────
function ListingsAdmin() {
  const { toast, reloadLocations } = useStore();
  const { rows, err, load } = useRows<any>('locations', 'select=*&is_listing=eq.true&order=name.asc');
  const [e, setE] = useState<any | null>(null);
  const save = async () => {
    const lat = Number(e.lat), lng = Number(e.lng);
    const body = { name: e.name?.trim(), category: 'business', description: blank(e.description || ''), lat, lng, is_listing: true, is_sponsored: !!e.is_sponsored, listing_phone: blank(e.listing_phone || ''), listing_website: blank(e.listing_website || ''),
      source_label: e.source_label?.trim() || 'Business owner', source_url: blank(e.source_url || ''), verification: e.verification || 'unverified', is_published: e.is_published ?? true, alt_names: [] };
    if (!body.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return toast('Name and map position are required', 'error');
    if (body.listing_website && !/^https:\/\//.test(body.listing_website)) return toast('Website must start with https://', 'error');
    try { if (e.id) await db('locations', `id=eq.${e.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); else await db('locations', '', { method: 'POST', body, prefer: 'return=minimal' }); setE(null); load(); reloadLocations(); toast('Listing saved'); } catch (x: any) { toast(x.message, 'error'); }
  };
  return (
    <>
      <p className="hint">Listings (shops, eateries, printing, salons…) show a “Business listing” or “Sponsored” label and are never mixed with official university information. Verify the business exists before publishing.</p>
      <button className="btn" style={{ marginBottom: 12 }} onClick={() => setE({ is_published: true })}><Icon name="plus" />New listing</button>
      {e && <div className="card" style={{ marginBottom: 12 }}>
        <Input label="Business name" value={e.name || ''} onChange={x => setE({ ...e, name: x.target.value })} />
        <Text label="What they offer" value={e.description || ''} onChange={x => setE({ ...e, description: x.target.value })} />
        <div className="row wrap"><Input label="Latitude" value={e.lat ?? ''} onChange={x => setE({ ...e, lat: x.target.value })} /><Input label="Longitude" value={e.lng ?? ''} onChange={x => setE({ ...e, lng: x.target.value })} /></div>
        <div className="row wrap"><Input label="Phone" type="tel" value={e.listing_phone || ''} onChange={x => setE({ ...e, listing_phone: x.target.value })} /><Input label="Website (https://)" value={e.listing_website || ''} onChange={x => setE({ ...e, listing_website: x.target.value })} /></div>
        <SRC v={e} set={setE} />
        <div className="row wrap"><label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!e.is_sponsored} onChange={x => setE({ ...e, is_sponsored: x.target.checked })} />Sponsored (paid)</label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={e.verification === 'verified'} onChange={x => setE({ ...e, verification: x.target.checked ? 'verified' : 'unverified' })} />Verified it exists</label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={e.is_published ?? true} onChange={x => setE({ ...e, is_published: x.target.checked })} />Published</label></div>
        <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn ghost" onClick={() => setE(null)}>Cancel</button></div></div>}
      {err && <Notice kind="error">{err}</Notice>}{!rows && !err && <Loading />}
      {rows?.length === 0 && <Empty icon="shop" title="No business listings yet" />}
      <div className="list">{rows?.map(r => <div key={r.id} className="card row"><div style={{ flex: 1, minWidth: 0 }}><b>{r.name}</b> {r.is_sponsored && <span className="tag warn">Sponsored</span>}<div className="sub">{r.listing_phone || 'no phone'} · {r.is_published ? 'published' : 'hidden'}</div></div><button className="btn small" onClick={() => setE(r)}><Icon name="edit" /></button></div>)}</div>
    </>
  );
}

// ───────── Events ─────────
function EventsAdmin() {
  const { toast, byId } = useStore();
  const { rows, err, load } = useRows<any>('events', 'select=*&order=starts_at.desc&limit=300');
  const [e, setE] = useState<any | null>(null);
  const local = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const save = async () => {
    const body = { title: e.title?.trim(), description: blank(e.description || ''), starts_at: e.starts ? new Date(e.starts).toISOString() : null, ends_at: e.ends ? new Date(e.ends).toISOString() : null,
      location_id: e.location_id || null, venue_text: e.location_id ? null : blank(e.venue_text || ''), organiser: blank(e.organiser || ''), category: e.category || 'general',
      source_label: e.source_label?.trim(), source_url: blank(e.source_url || ''), status: e.status || 'draft' };
    if (!body.title || !body.starts_at || !body.source_label) return toast('Title, start time and source are required', 'error');
    try { if (e.id) await db('events', `id=eq.${e.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); else await db('events', '', { method: 'POST', body, prefer: 'return=minimal' }); setE(null); load(); toast('Event saved'); } catch (x: any) { toast(x.message, 'error'); }
  };
  return (
    <>
      <button className="btn" style={{ marginBottom: 12 }} onClick={() => setE({ category: 'general', status: 'draft' })}><Icon name="plus" />New event</button>
      {e && <div className="card" style={{ marginBottom: 12 }}>
        <Input label="Title" value={e.title || ''} onChange={x => setE({ ...e, title: x.target.value })} />
        <div className="row wrap"><Input label="Starts" type="datetime-local" value={e.starts ?? local(e.starts_at)} onChange={x => setE({ ...e, starts: x.target.value })} /><Input label="Ends (optional)" type="datetime-local" value={e.ends ?? local(e.ends_at)} onChange={x => setE({ ...e, ends: x.target.value })} /></div>
        <div className="row wrap"><div className="field"><label>Category</label><select className="input" value={e.category} onChange={x => setE({ ...e, category: x.target.value })}>{Object.entries(EVENT_CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div><Input label="Organiser" value={e.organiser || ''} onChange={x => setE({ ...e, organiser: x.target.value })} /></div>
        <PlacePick value={e.location_id || null} onChange={id => setE({ ...e, location_id: id })} label="Venue (from directory)" />
        {!e.location_id && <Input label="…or venue text" value={e.venue_text || ''} onChange={x => setE({ ...e, venue_text: x.target.value })} />}
        <Text label="Description" value={e.description || ''} onChange={x => setE({ ...e, description: x.target.value })} />
        <SRC v={e} set={setE} />
        <div className="field"><label>Status</label><div className="seg">{['draft', 'published', 'cancelled'].map(st => <button key={st} aria-pressed={e.status === st} onClick={() => setE({ ...e, status: st })}>{st}</button>)}</div></div>
        <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn ghost" onClick={() => setE(null)}>Cancel</button></div></div>}
      {err && <Notice kind="error">{err}</Notice>}{!rows && !err && <Loading />}
      {rows?.length === 0 && <Empty icon="event" title="No events yet" />}
      <div className="list">{rows?.map(r => <div key={r.id} className="card row"><div style={{ flex: 1, minWidth: 0 }}><b>{r.title}</b><div className="sub">{new Date(r.starts_at).toLocaleString()} · {(r.location_id && byId.get(r.location_id)?.name) || r.venue_text || 'no venue'} · <b>{r.status}</b></div></div><button className="btn small" onClick={() => setE(r)}><Icon name="edit" /></button>
        <button className="btn small" onClick={async () => { if (confirm('Delete this event?')) { await db('events', `id=eq.${r.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(x => toast(x.message, 'error')); load(); } }}><Icon name="trash" /></button></div>)}</div>
    </>
  );
}
