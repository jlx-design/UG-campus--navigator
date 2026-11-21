import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { Empty, Loading, Notice } from '../components/common';

interface Course { id: string; code: string; title: string | null; lecturer: string | null; credits: number | null; color: string; semester: string | null; notes: string | null }
interface Session { id: string; course_id: string; kind: string; weekday: number; starts_at: string; ends_at: string; location_id: string | null; venue_text: string | null }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const KINDS = ['lecture', 'tutorial', 'lab', 'seminar', 'exam', 'other'];
const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#475569'];
const todayIdx = () => ((new Date().getDay() + 6) % 7) + 1; // 1 = Monday
const hm = (t: string) => t.slice(0, 5);
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

function nextSession(sessions: Session[]) {
  const now = new Date(); const d = todayIdx(); const mins = now.getHours() * 60 + now.getMinutes();
  let best: { s: Session; inDays: number; startsIn: number; live: boolean } | null = null;
  for (const s of sessions) {
    let inDays = (s.weekday - d + 7) % 7;
    const live = inDays === 0 && toMin(s.starts_at) <= mins && toMin(s.ends_at) > mins;
    if (inDays === 0 && toMin(s.ends_at) <= mins) inDays = 7;
    const startsIn = inDays * 1440 + toMin(s.starts_at) - mins;
    if (!best || (live && !best.live) || (!best.live && startsIn < best.startsIn)) best = { s, inDays, startsIn, live };
  }
  return best;
}
const until = (m: number) => (m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.floor(m / 60)} h ${m % 60} min` : `in ${Math.round(m / 1440)} day${Math.round(m / 1440) > 1 ? 's' : ''}`);

export function Schedule() {
  const { user, authReady, byId, goDirections, select, toast } = useStore();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [day, setDay] = useState(todayIdx());
  const [editCourse, setEditCourse] = useState<Partial<Course> | null>(null);
  const [editSession, setEditSession] = useState<(Partial<Session> & { days?: number[] }) | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);

  const load = () => {
    setErr(null);
    Promise.all([db<Course[]>('courses', 'select=*&order=code.asc'), db<Session[]>('class_sessions', 'select=*&order=weekday.asc,starts_at.asc')])
      .then(([c, s]) => { setCourses(c); setSessions(s); }).catch(e => setErr(e.message));
  };
  useEffect(() => { if (user) load(); }, [user]);

  const courseById = useMemo(() => new Map((courses || []).map(c => [c.id, c])), [courses]);
  const next = useMemo(() => (sessions ? nextSession(sessions) : null), [sessions, tick]);
  const daySessions = (sessions || []).filter(s => s.weekday === day);
  const credits = (courses || []).reduce((a, c) => a + (c.credits || 0), 0);

  if (!authReady) return <div className="screen"><Loading /></div>;
  if (!user) return (
    <div className="screen">
      <header className="page-head"><h1>Schedule</h1><p className="lede">Your courses and lecture timetable, with one-tap directions to every venue.</p></header>
      <a className="tool-link" href="#/gpa"><span className="cat-ic"><Icon name="calc" /></span><div><b>GPA calculator</b><span>Semester GPA, CGPA and class of degree</span></div><Icon name="chevron" /></a>

      <div className="hero-card">
        <Icon name="calendar" style={{ width: 34, height: 34 }} />
        <h2>Plan your week</h2>
        <p>Add your courses and class times. We'll show what's next, where it is, and how long it takes to walk there. Your timetable is private to your account.</p>
        <div className="row wrap"><a className="btn primary" href="#/register">Create free account</a><a className="btn" href="#/login">Sign in</a></div>
      </div>
    </div>
  );

  const saveCourse = async () => {
    const c = editCourse!; const body = { code: c.code?.trim().toUpperCase(), title: c.title?.trim() || null, lecturer: c.lecturer?.trim() || null, credits: c.credits ? Number(c.credits) : null, color: c.color || COLORS[0], semester: c.semester?.trim() || null, notes: c.notes?.trim() || null };
    if (!body.code || body.code.length < 2) { toast('Enter a course code, e.g. UGRC 110', 'error'); return; }
    try {
      if (c.id) await db('courses', `id=eq.${c.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      else await db('courses', '', { method: 'POST', body, prefer: 'return=minimal' });
      setEditCourse(null); load(); toast('Course saved');
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const deleteCourse = async (c: Course) => {
    if (!confirm(`Delete ${c.code} and its class times?`)) return;
    try { await db('courses', `id=eq.${c.id}`, { method: 'DELETE', prefer: 'return=minimal' }); load(); toast('Course deleted'); } catch (e: any) { toast(e.message, 'error'); }
  };
  const saveSession = async () => {
    const s = editSession!; const days = s.id ? [s.weekday!] : (s.days || []);
    if (!s.course_id || !days.length || !s.starts_at || !s.ends_at) { toast('Choose a course, day(s) and times', 'error'); return; }
    if (s.ends_at <= s.starts_at) { toast('End time must be after start time', 'error'); return; }
    const base = { course_id: s.course_id, kind: s.kind || 'lecture', starts_at: s.starts_at, ends_at: s.ends_at, location_id: s.location_id || null, venue_text: s.location_id ? null : (s.venue_text?.trim() || null) };
    try {
      if (s.id) await db('class_sessions', `id=eq.${s.id}`, { method: 'PATCH', body: { ...base, weekday: s.weekday }, prefer: 'return=minimal' });
      else await db('class_sessions', '', { method: 'POST', body: days.map(weekday => ({ ...base, weekday })), prefer: 'return=minimal' });
      setEditSession(null); load(); toast('Class time saved');
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const deleteSession = async (s: Session) => { try { await db('class_sessions', `id=eq.${s.id}`, { method: 'DELETE', prefer: 'return=minimal' }); load(); } catch (e: any) { toast(e.message, 'error'); } };

  const venue = (s: Session) => (s.location_id ? byId.get(s.location_id)?.name : s.venue_text) || 'Venue not set';

  return (
    <div className="screen">
      <header className="page-head">
        <h1>Schedule</h1>
        <p className="lede">{DAY_FULL[todayIdx() - 1]}, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}{courses?.length ? ` · ${courses.length} course${courses.length > 1 ? 's' : ''}${credits ? ` · ${credits} credits` : ''}` : ''}</p>
      </header>
      <a className="tool-link" href="#/gpa"><span className="cat-ic"><Icon name="calc" /></span><div><b>GPA calculator</b><span>Semester GPA, CGPA and class of degree</span></div><Icon name="chevron" /></a>
      {err && <Notice kind="error">{err} <button className="btn small" onClick={load}>Retry</button></Notice>}
      {!courses && !err && <Loading />}

      {next && courseById.get(next.s.course_id) && (() => {
        const c = courseById.get(next.s.course_id)!;
        return (
          <div className="next-card" style={{ ['--c' as any]: c.color }}>
            <div className="next-top"><span className="pulse" />{next.live ? 'Happening now' : next.inDays === 0 ? `Next · ${until(next.startsIn)}` : `Next · ${DAY_FULL[next.s.weekday - 1]}`}</div>
            <div className="next-code">{c.code}</div>
            <div className="next-title">{c.title || next.s.kind}</div>
            <div className="next-meta"><Icon name="clock" />{fmt12(next.s.starts_at)} – {fmt12(next.s.ends_at)}<span>·</span><Icon name="pin" />{venue(next.s)}</div>
            {next.s.location_id && <div className="row" style={{ marginTop: 14 }}>
              <button className="btn on-color" onClick={() => goDirections(next.s.location_id!)}><Icon name="walk" />Directions</button>
              <button className="btn ghost-on-color" onClick={() => { select(next.s.location_id!); location.hash = '#/map'; }}><Icon name="map" />Map</button>
            </div>}
          </div>
        );
      })()}

      {courses && (
        <>
          <div className="day-tabs" role="tablist" aria-label="Day of week">
            {DAYS.map((d, i) => {
              const n = (sessions || []).filter(s => s.weekday === i + 1).length;
              return <button key={d} role="tab" aria-selected={day === i + 1} className={i + 1 === todayIdx() ? 'today' : ''} onClick={() => setDay(i + 1)}>{d}{n ? <i>{n}</i> : null}</button>;
            })}
          </div>
          {daySessions.length === 0 ? (
            <Empty icon="calendar" title={`Nothing on ${DAY_FULL[day - 1]}`}>{courses.length ? 'Add a class time for this day.' : 'Start by adding a course below.'}</Empty>
          ) : (
            <ol className="timeline">
              {daySessions.map(s => {
                const c = courseById.get(s.course_id);
                return (
                  <li key={s.id} style={{ ['--c' as any]: c?.color || COLORS[0] }}>
                    <div className="t-time">{hm(s.starts_at)}<small>{hm(s.ends_at)}</small></div>
                    <div className="t-card">
                      <div className="row"><b>{c?.code}</b><span className="tag">{s.kind}</span><span className="spacer" />
                        <button className="icon-btn sm" aria-label="Edit class time" onClick={() => setEditSession({ ...s })}><Icon name="edit" /></button>
                        <button className="icon-btn sm" aria-label="Delete class time" onClick={() => deleteSession(s)}><Icon name="trash" /></button></div>
                      {c?.title && <div className="sub">{c.title}</div>}
                      <div className="sub row" style={{ gap: 6, marginTop: 4 }}><Icon name="pin" style={{ width: 14 }} />{venue(s)}
                        {s.location_id && <button className="link-btn" onClick={() => goDirections(s.location_id!)}>Directions</button>}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="row" style={{ margin: '12px 0 4px' }}>
            <button className="btn primary" disabled={!courses.length} onClick={() => setEditSession({ days: [day], kind: 'lecture', course_id: courses[0]?.id, starts_at: '08:30', ends_at: '10:30' })}><Icon name="plus" />Add class time</button>
          </div>

          <div className="section-title">My courses</div>
          {courses.length === 0 && <Empty icon="book" title="No courses yet">Add the courses you're taking this semester.</Empty>}
          <div className="course-grid">
            {courses.map(c => (
              <div key={c.id} className="course" style={{ ['--c' as any]: c.color }}>
                <div className="row"><b>{c.code}</b>{c.credits ? <span className="tag">{c.credits} cr</span> : null}<span className="spacer" />
                  <button className="icon-btn sm" aria-label={`Edit ${c.code}`} onClick={() => setEditCourse({ ...c })}><Icon name="edit" /></button>
                  <button className="icon-btn sm" aria-label={`Delete ${c.code}`} onClick={() => deleteCourse(c)}><Icon name="trash" /></button></div>
                {c.title && <div className="sub">{c.title}</div>}
                {c.lecturer && <div className="sub">{c.lecturer}</div>}
                <div className="sub">{(sessions || []).filter(s => s.course_id === c.id).length} class time(s)/week</div>
              </div>
            ))}
            <button className="course add" onClick={() => setEditCourse({ color: COLORS[(courses.length) % COLORS.length] })}><Icon name="plus" />Add course</button>
          </div>
        </>
      )}

      {editCourse && (
        <div className="modal-back" onClick={() => setEditCourse(null)}>
          <div className="modal glass" role="dialog" aria-modal="true" aria-label="Course" onClick={e => e.stopPropagation()}>
            <h2>{editCourse.id ? 'Edit course' : 'New course'}</h2>
            <div className="row"><F label="Code"><input className="input" value={editCourse.code || ''} onChange={e => setEditCourse({ ...editCourse, code: e.target.value })} placeholder="e.g. UGRC 110" maxLength={20} autoFocus /></F>
              <F label="Credits"><input className="input" type="number" min={0} max={30} value={editCourse.credits ?? ''} onChange={e => setEditCourse({ ...editCourse, credits: e.target.value as any })} /></F></div>
            <F label="Title"><input className="input" value={editCourse.title || ''} onChange={e => setEditCourse({ ...editCourse, title: e.target.value })} maxLength={160} /></F>
            <F label="Lecturer"><input className="input" value={editCourse.lecturer || ''} onChange={e => setEditCourse({ ...editCourse, lecturer: e.target.value })} maxLength={120} /></F>
            <F label="Semester"><input className="input" value={editCourse.semester || ''} onChange={e => setEditCourse({ ...editCourse, semester: e.target.value })} placeholder="e.g. 2026/27 Sem 1" maxLength={40} /></F>
            <F label="Colour"><div className="swatches">{COLORS.map(col => <button key={col} className="swatch" style={{ background: col }} aria-pressed={editCourse.color === col} aria-label={col} onClick={() => setEditCourse({ ...editCourse, color: col })} />)}</div></F>
            <F label="Notes"><textarea className="input" value={editCourse.notes || ''} onChange={e => setEditCourse({ ...editCourse, notes: e.target.value })} maxLength={2000} /></F>
            <div className="row"><button className="btn primary" onClick={saveCourse}>Save</button><button className="btn ghost" onClick={() => setEditCourse(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {editSession && (
        <div className="modal-back" onClick={() => setEditSession(null)}>
          <div className="modal glass" role="dialog" aria-modal="true" aria-label="Class time" onClick={e => e.stopPropagation()}>
            <h2>{editSession.id ? 'Edit class time' : 'Add class time'}</h2>
            <F label="Course"><select className="input" value={editSession.course_id} onChange={e => setEditSession({ ...editSession, course_id: e.target.value })}>{courses?.map(c => <option key={c.id} value={c.id}>{c.code}{c.title ? ` — ${c.title}` : ''}</option>)}</select></F>
            <F label="Type"><div className="seg wrap">{KINDS.map(k => <button key={k} aria-pressed={(editSession.kind || 'lecture') === k} onClick={() => setEditSession({ ...editSession, kind: k })}>{k}</button>)}</div></F>
            {editSession.id ? (
              <F label="Day"><select className="input" value={editSession.weekday} onChange={e => setEditSession({ ...editSession, weekday: Number(e.target.value) })}>{DAY_FULL.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></F>
            ) : (
              <F label="Day(s)"><div className="seg wrap">{DAYS.map((d, i) => { const on = editSession.days?.includes(i + 1); return <button key={d} aria-pressed={!!on} onClick={() => setEditSession({ ...editSession, days: on ? editSession.days!.filter(x => x !== i + 1) : [...(editSession.days || []), i + 1] })}>{d}</button>; })}</div></F>
            )}
            <div className="row"><F label="Starts"><input className="input" type="time" value={editSession.starts_at?.slice(0, 5) || ''} onChange={e => setEditSession({ ...editSession, starts_at: e.target.value })} /></F>
              <F label="Ends"><input className="input" type="time" value={editSession.ends_at?.slice(0, 5) || ''} onChange={e => setEditSession({ ...editSession, ends_at: e.target.value })} /></F></div>
            <F label="Venue">
              {editSession.location_id ? (
                <div className="chip-sel"><Icon name="pin" />{byId.get(editSession.location_id)?.name}<button className="icon-btn sm" aria-label="Clear venue" onClick={() => setEditSession({ ...editSession, location_id: null })}><Icon name="close" /></button></div>
              ) : (
                <>
                  <SearchBox placeholder="Search campus places…" onPick={l => setEditSession({ ...editSession, location_id: l.id, venue_text: null })} />
                  <input className="input" style={{ marginTop: 8 }} placeholder="…or type the venue (e.g. JQB 23)" value={editSession.venue_text || ''} onChange={e => setEditSession({ ...editSession, venue_text: e.target.value })} maxLength={120} />
                  <span className="hint">Picking a place from the directory enables walking directions.</span>
                </>
              )}
            </F>
            <div className="row"><button className="btn primary" onClick={saveSession}>Save</button><button className="btn ghost" onClick={() => setEditSession(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field" style={{ flex: 1 }}><label>{label}</label>{children}</div>;
}
