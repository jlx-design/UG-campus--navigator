import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { db, importOsm } from '../lib/api';
import { Icon } from '../components/Icon';
import { BackLink, Empty, Loading, Notice, VerificationTag } from '../components/common';
import { SECTIONS } from './Fresher';
import { ANN_CATEGORIES } from './Updates';
import type { Announcement, ChecklistItem, FresherResource, Location, Report } from '../lib/types';
import { fmtDate } from '../lib/geo';

type Tab = 'locations' | 'announcements' | 'resources' | 'checklist' | 'reports' | 'audit';

export function Admin({ tab }: { tab: Tab }) {
  const { role, authReady, user } = useStore();
  if (!authReady) return <div className="screen"><Loading /></div>;
  if (!user || (role !== 'editor' && role !== 'admin'))
    return <div className="screen"><h1>Administration</h1><Notice kind="error">You need an editor or administrator role to view this area. Roles are granted by an administrator, not from inside the app.</Notice></div>;
  const tabs: [Tab, string][] = [['locations', 'Locations'], ['announcements', 'Announcements'], ['resources', 'Fresher content'], ['checklist', 'Checklist'], ['reports', 'Reports'], ['audit', 'Audit log']];
  return (
    <div className="screen" style={{ maxWidth: 1000 }}>
      <BackLink href="#/profile" label="Profile" />
      <h1>Administration</h1>
      <p className="lede">Signed in as {role}. Every change here is enforced by database policies and recorded in the audit log.</p>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <a key={k} role="tab" aria-selected={tab === k} className="chip" aria-pressed={tab === k} href={`#/admin/${k}`}>{l}</a>)}</div>
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
      accessibility: blank(edit.accessibility || ''), source_label: edit.source_label?.trim() || 'UG Campus Navigator editors', source_url: blank(edit.source_url || ''),
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
      {rows?.length === 0 && <Empty icon="book" title="No Fresher Hub content yet" />}
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
