import React, { useEffect, useMemo, useState } from 'react';
import { CAMPUS } from '../config';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { useAudience, AUDIENCE_LABEL, type AudienceState } from '../lib/audience';
import { K } from '../lib/keys';
import { fmtDate } from '../lib/geo';
import { nextSession, fmt12, until } from './Schedule';
import { countdown } from './Exams';
import type { Announcement, ChecklistItem } from '../lib/types';

const FRESHER_CATS = ['registration', 'orientation', 'accommodation', 'academic_calendar', 'deadline', 'official'];
const LEVEL_TEXT = (s: AudienceState) => (s.level && /^\d00$/.test(s.level) ? `Level ${s.level}` : s.level === 'masters' ? "Master's" : s.level === 'mphil' ? 'MPhil' : s.level === 'phd' ? 'PhD' : '');

function useLatest(cats: string[] | null, n = 3) {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  useEffect(() => {
    const f = cats ? `&category=in.(${cats.join(',')})` : '';
    db<Announcement[]>('announcements', `select=id,title,summary,category,published_at,source_org&status=eq.published${f}&order=published_at.desc.nullslast&limit=${n}`).then(setRows).catch(() => setRows([]));
  }, [cats?.join(',')]);
  return rows;
}

function UpdatesCard({ title, cats }: { title: string; cats: string[] | null }) {
  const rows = useLatest(cats);
  return (<>
    <div className="section-title row"><span style={{ flex: 1 }}>{title}</span><a className="link-btn" href="#/updates">All updates</a></div>
    {rows === null ? <div className="card"><span className="spinner" /></div>
      : rows.length === 0 ? <div className="card sub">Nothing published yet. Editors post here only from official {CAMPUS.short} sources.</div>
      : <div className="list">{rows.map(a => (
        <a key={a.id} className="card nav-row row" href={`#/updates/${a.id}`}>
          <div style={{ minWidth: 0, flex: 1 }}><b>{a.title}</b><div className="sub">{a.source_org}{a.published_at ? ` · ${fmtDate(a.published_at)}` : ''}</div></div>
          <Icon name="chevron" style={{ width: 18, color: 'var(--text-3)' }} />
        </a>))}</div>}
  </>);
}

/** Starter checklist progress + the next few things to do. Guests' ticks live on this device. */
function FirstSteps() {
  const { user } = useStore();
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => { db<ChecklistItem[]>('checklist_items', 'select=id,title,kind&is_published=eq.true&order=sort_order.asc').then(setItems).catch(() => setItems([])); }, []);
  useEffect(() => {
    if (!user) { try { setDone(new Set(JSON.parse(localStorage.getItem(K('guest_checklist')) || '[]'))); } catch { setDone(new Set()); } return; }
    db<{ item_id: string }[]>('checklist_progress', 'select=item_id').then(r => setDone(new Set(r.map(x => x.item_id)))).catch(() => {});
  }, [user?.id]);
  if (items === null) return <div className="card"><span className="spinner" /></div>;
  if (items.length === 0) return <a className="card nav-row row" href="#/fresher/checklist"><span className="cat-ic"><Icon name="check" /></span><div style={{ flex: 1 }}><b>Starter checklist</b><div className="sub">Editors are still confirming items against official sources.</div></div></a>;
  const left = items.filter(i => !done.has(i.id)); const pct = Math.round(((items.length - left.length) / items.length) * 100);
  return (
    <a className="card nav-row" href="#/fresher/checklist" style={{ display: 'block' }}>
      <div className="row"><b style={{ flex: 1 }}>Things to do</b><span className="sub">{items.length - left.length} of {items.length} done</span></div>
      <div className="progress" style={{ margin: '8px 0 10px' }}><i style={{ width: `${pct}%` }} /></div>
      {left.length === 0 ? <div className="sub">All done — well done!</div> : left.slice(0, 3).map(i => (
        <div key={i.id} className="row todo-line"><span className="todo-dot" /><span style={{ flex: 1 }}>{i.title}</span>{i.kind === 'official' && <span className="pill">Official</span>}</div>
      ))}
    </a>
  );
}

function NextUp() {
  const { user, byId } = useStore();
  const [sessions, setSessions] = useState<any[] | null>(null);
  const [courses, setCourses] = useState<Map<string, any>>(new Map());
  const [exam, setExam] = useState<any | null | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    Promise.all([db<any[]>('courses', 'select=id,code,title,color'), db<any[]>('class_sessions', 'select=*')]).then(([c, s]) => { setCourses(new Map(c.map(x => [x.id, x]))); setSessions(s); }).catch(() => setSessions([]));
    db<any[]>('exams', `select=*&starts_at=gte.${new Date(Date.now() - 3 * 36e5).toISOString()}&order=starts_at.asc&limit=1`).then(r => setExam(r[0] || null)).catch(() => setExam(null));
  }, [user?.id]);
  const next = useMemo(() => (sessions ? nextSession(sessions) : null), [sessions]);
  if (!user) return (
    <div className="hero-card"><Icon name="calendar" style={{ width: 30, height: 30 }} /><h2>Your week, in one place</h2>
      <p>Sign in to add your timetable and exams. We'll show your next class, where it is and how long the walk takes.</p>
      <div className="row wrap"><a className="btn primary" href="#/register">Create free account</a><a className="btn" href="#/login">Sign in</a></div></div>);
  const c = next ? courses.get(next.s.course_id) : null;
  const venue = next ? ((next.s.location_id && byId.get(next.s.location_id)?.name) || next.s.venue_text) : null;
  return (<div className="list">
    <a className="card nav-row row" href="#/schedule">
      <span className="cat-ic" style={c ? { background: c.color, color: '#fff' } : undefined}><Icon name="lecture" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>{sessions === null ? <span className="spinner" /> : next && c ? <><b>{next.live ? 'Now' : 'Next'}: {c.code}</b><div className="sub">{fmt12(next.s.starts_at)}{venue ? ` · ${venue}` : ''} · {next.live ? 'in progress' : until(next.startsIn)}</div></> : <><b>No classes yet</b><div className="sub">Add your courses and class times</div></>}</div>
      <Icon name="chevron" style={{ width: 18, color: 'var(--text-3)' }} />
    </a>
    <a className="card nav-row row" href="#/schedule/exams">
      <span className="cat-ic"><Icon name="clock" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>{exam === undefined ? <span className="spinner" /> : exam ? <><b>{exam.course_code} exam</b><div className="sub">{new Date(exam.starts_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {countdown(new Date(exam.starts_at).getTime() - Date.now())}</div></> : <><b>No upcoming exams</b><div className="sub">Add exam dates for a countdown and reminders</div></>}</div>
      <Icon name="chevron" style={{ width: 18, color: 'var(--text-3)' }} />
    </a>
  </div>);
}

/** The top of the Guide tab, shaped by who the person said they are. */
export function ForYou() {
  const { user, locations } = useStore();
  const a = useAudience(user);
  const halls = locations.filter(l => l.category === 'lecture_hall').length;
  if (!a) return (
    <a className="card nav-row row for-you-ask" href="#/welcome"><span className="cat-ic"><Icon name="user" /></span>
      <div style={{ flex: 1 }}><b>Make this guide yours</b><div className="sub">Tell us if you're a fresher, continuing student, staff or visitor.</div></div><Icon name="chevron" style={{ width: 18 }} /></a>);
  const badge = <div className="row" style={{ marginBottom: 10 }}><span className="pill">{AUDIENCE_LABEL[a.aud]}{LEVEL_TEXT(a) && a.aud !== 'fresher' ? ` · ${LEVEL_TEXT(a)}` : ''}</span><span className="spacer" /><a className="link-btn" href="#/welcome">Change</a></div>;

  if (a.aud === 'fresher') return (
    <section aria-label="For freshers">
      <h2 className="for-you-h">Your first year at {CAMPUS.short}</h2>{badge}
      <FirstSteps />
      <div className="quick-grid" style={{ marginTop: 12 }}>
        <a className="quick q-blue" href="#/fresher/registration"><Icon name="edit" /><b>Registration</b><span>How to register</span></a>
        <a className="quick q-green" href="#/fresher/orientation"><Icon name="navigate" /><b>Orientation</b><span>What to expect</span></a>
        <a className="quick q-gold" href="#/map?cat=lecture_hall"><Icon name="lecture" /><b>Lecture halls</b><span>{halls ? `${halls} on the map` : 'Find on the map'}</span></a>
        <a className="quick q-red" href="#/fresher/accommodation"><Icon name="hall" /><b>Halls</b><span>Accommodation info</span></a>
        <a className="quick q-blue" href="#/fresher/terminology"><Icon name="info" /><b>{CAMPUS.short} explained</b><span>Terms you'll hear</span></a>
        <a className="quick q-green" href="#/schedule"><Icon name="calendar" /><b>Timetable</b><span>Add your classes</span></a>
      </div>
      <UpdatesCard title="Updates for freshers" cats={FRESHER_CATS} />
    </section>);

  if (a.aud === 'continuing' || a.aud === 'postgrad') return (
    <section aria-label="Your semester">
      <h2 className="for-you-h">Your semester</h2>{badge}
      <NextUp />
      <div className="quick-grid" style={{ marginTop: 12 }}>
        <a className="quick q-blue" href="#/schedule"><Icon name="calendar" /><b>Timetable</b><span>Classes & venues</span></a>
        <a className="quick q-red" href="#/schedule/exams"><Icon name="clock" /><b>Exams</b><span>Countdowns</span></a>
        <a className="quick q-gold" href="#/gpa"><Icon name="calc" /><b>{(CAMPUS.grading.mode as string) === 'cwa' ? 'CWA' : 'GPA'}</b><span>Class of degree</span></a>
        <a className="quick q-green" href="#/updates/events"><Icon name="event" /><b>Events</b><span>What's on</span></a>
      </div>
      <UpdatesCard title="Latest updates" cats={null} />
    </section>);

  return (
    <section aria-label="For you">
      <h2 className="for-you-h">{a.aud === 'staff' ? 'For staff' : `Visiting ${CAMPUS.short}`}</h2>{badge}
      <div className="quick-grid">
        <a className="quick q-blue" href="#/map"><Icon name="map" /><b>Find a place</b><span>Walking directions</span></a>
        <a className="quick q-green" href="#/updates/events"><Icon name="event" /><b>Events</b><span>What's on</span></a>
        <a className="quick q-gold" href="#/shuttles"><Icon name="bus" /><b>Shuttles</b><span>Getting around</span></a>
        <a className="quick q-red" href="#/emergency"><Icon name="sos" /><b>Emergency</b><span>Call for help</span></a>
      </div>
      <UpdatesCard title="Latest updates" cats={null} />
    </section>);
}
