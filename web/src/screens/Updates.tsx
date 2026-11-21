import React, { useEffect, useState } from 'react';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { BackLink, Empty, Loading, Notice, SourceLink, go } from '../components/common';
import type { Announcement } from '../lib/types';
import { fmtDate } from '../lib/geo';

export const ANN_CATEGORIES: Record<string, string> = {
  official: 'Official', registration: 'Registration', orientation: 'Orientation', accommodation: 'Accommodation',
  academic_calendar: 'Academic calendar', student_services: 'Student services', disruption: 'Campus disruption',
  industrial_action: 'Industrial action', deadline: 'Deadline', other: 'Other',
};

export function useAnnouncements() {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    setErr(null);
    db<Announcement[]>('announcements', 'select=*&status=eq.published&order=published_at.desc.nullslast&limit=100').then(setRows).catch(e => setErr(e.message));
  };
  useEffect(load, []);
  return { rows, err, load };
}

export function useUnread(rows: Announcement[] | null) {
  const { user } = useStore();
  const [read, setRead] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!user) { setRead(null); return; }
    db<{ announcement_id: string }[]>('announcement_reads', 'select=announcement_id').then(r => setRead(new Set(r.map(x => x.announcement_id)))).catch(() => setRead(null));
  }, [user]);
  const markRead = async (ids: string[]) => {
    if (!user || !read) return;
    const fresh = ids.filter(id => !read.has(id));
    if (!fresh.length) return;
    await db('announcement_reads', 'on_conflict=user_id,announcement_id', { method: 'POST', body: fresh.map(announcement_id => ({ announcement_id })), prefer: 'resolution=ignore-duplicates,return=minimal' }).catch(() => {});
    setRead(new Set([...read, ...fresh]));
  };
  const unread = rows && read ? rows.filter(r => !read.has(r.id)).length : 0;
  return { read, unread, markRead };
}

export function UpdatesList() {
  const { user } = useStore();
  const { rows, err, load } = useAnnouncements();
  const { read, unread, markRead } = useUnread(rows);
  const [cat, setCat] = useState<string | null>(null);
  const shown = rows?.filter(r => !cat || r.category === cat) ?? null;
  const usedCats = Object.keys(ANN_CATEGORIES).filter(c => rows?.some(r => r.category === c));

  return (
    <div className="screen">
      <h1>Updates</h1>
      <p className="lede">Announcements published by authorised editors, each linked to its original source.</p>
      {user && rows && rows.length > 0 && (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="sub">{unread ? `${unread} unread` : 'All caught up'}</span><span className="spacer" />
          {unread > 0 && <button className="btn small" onClick={() => markRead(rows.map(r => r.id))}><Icon name="check" />Mark all read</button>}
        </div>
      )}
      {usedCats.length > 1 && (
        <div className="tabs">
          <button className="chip" aria-pressed={!cat} onClick={() => setCat(null)}>All</button>
          {usedCats.map(c => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{ANN_CATEGORIES[c]}</button>)}
        </div>
      )}
      {err && <Notice kind="error">Could not load updates: {err} <button className="btn small" onClick={load}>Retry</button></Notice>}
      {!rows && !err && <Loading />}
      {shown && shown.length === 0 && <Empty icon="bell" title="No announcements right now">When editors publish verified updates, they will appear here.</Empty>}
      <div className="list">
        {shown?.map(a => {
          const isUnread = !!read && !read.has(a.id);
          return (
            <a key={a.id} href={`#/updates/${a.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', borderLeft: isUnread ? '3px solid var(--accent)' : undefined }}>
              <div className="row wrap"><span className="tag brand">{ANN_CATEGORIES[a.category]}</span><span className="sub">{a.source_org} · {fmtDate(a.published_at)}</span></div>
              <h3 style={{ marginTop: 8 }}>{a.title}</h3>
              <div className="sub" style={{ color: 'var(--text-2)' }}>{a.summary}</div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function UpdateDetail({ id }: { id: string }) {
  const { byId, select } = useStore();
  const [a, setA] = useState<Announcement | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const { markRead } = useUnread(a ? [a] : null);
  useEffect(() => { db<Announcement[]>('announcements', `select=*&id=eq.${id}`).then(r => setA(r[0] ?? null)).catch(e => setErr(e.message)); }, [id]);
  useEffect(() => { if (a) markRead([a.id]); }, [a?.id]);
  const loc = a?.location_id ? byId.get(a.location_id) : null;
  return (
    <div className="screen">
      <BackLink href="#/updates" label="Updates" />
      {err && <Notice kind="error">{err}</Notice>}
      {a === undefined && !err && <Loading />}
      {a === null && <Empty title="Announcement not found">It may have been unpublished or expired.</Empty>}
      {a && (
        <article>
          <span className="tag brand">{ANN_CATEGORIES[a.category]}</span>
          <h1 style={{ marginTop: 10 }}>{a.title}</h1>
          <div className="sub">Published by {a.source_org} on {fmtDate(a.published_at)}{a.updated_at && a.published_at && new Date(a.updated_at).getTime() - new Date(a.published_at).getTime() > 86400000 ? ` · updated in app ${fmtDate(a.updated_at)}` : ''}{a.expires_at ? ` · relevant until ${fmtDate(a.expires_at)}` : ''}</div>
          <p style={{ fontWeight: 600, marginTop: 16 }}>{a.summary}</p>
          {a.body && <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{a.body}</div>}
          <div className="row wrap" style={{ marginTop: 18 }}>
            {a.source_url && <a className="btn" href={a.source_url} target="_blank" rel="noopener noreferrer"><Icon name="external" />Read original</a>}
            {loc && <button className="btn" onClick={() => { select(loc.id); go('#/explore'); }}><Icon name="pin" />{loc.name}</button>}
            <a className="btn ghost small" href={`#/report?kind=outdated_announcement&announcement=${a.id}`}><Icon name="flag" />Report</a>
          </div>
          <div style={{ marginTop: 10 }}><SourceLink url={a.source_url} label={a.source_org} /></div>
        </article>
      )}
    </div>
  );
}

export function UpdatesRoute({ seg }: { seg: string[] }) {
  return seg[1] ? <UpdateDetail id={seg[1]} /> : <UpdatesList />;
}
