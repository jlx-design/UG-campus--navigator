import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { Empty, Loading, Notice } from '../components/common';
import { ScheduleTabs, RemindersCard } from '../components/ScheduleTabs';
import { icsFile } from '../lib/ics';

interface Exam { id: string; course_code: string; course_title: string | null; starts_at: string; duration_min: number; location_id: string | null; venue_text: string | null; seat_note: string | null }
const pad = (n: number) => String(n).padStart(2, '0');
function countdown(ms: number) {
  if (ms <= 0) return 'Now';
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export function Exams() {
  const { user, authReady, byId, toast, goDirections } = useStore();
  const [rows, setRows] = useState<Exam[] | null>(null); const [err, setErr] = useState('');
  const [edit, setEdit] = useState<any | null>(null); const [, tick] = useState(0);
  const load = () => db<Exam[]>('exams', 'select=*&order=starts_at.asc').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { if (user) load(); }, [user?.id]);
  useEffect(() => { const i = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(i); }, []);
  const now = Date.now();
  const upcoming = useMemo(() => (rows || []).filter(e => new Date(e.starts_at).getTime() + e.duration_min * 6e4 > now), [rows, now]);
  const past = useMemo(() => (rows || []).filter(e => new Date(e.starts_at).getTime() + e.duration_min * 6e4 <= now), [rows, now]);
  const venue = (e: Exam) => (e.location_id && byId.get(e.location_id)?.name) || e.venue_text || 'Venue not set';

  const save = async () => {
    const e = edit; if (!e.course_code?.trim() || !e.date || !e.time) return toast('Course code, date and time are required', 'error');
    const starts = new Date(`${e.date}T${e.time}`); if (isNaN(starts.getTime())) return toast('Check the date and time', 'error');
    const body = { course_code: e.course_code.trim().toUpperCase(), course_title: e.course_title?.trim() || null, starts_at: starts.toISOString(), duration_min: Number(e.duration_min) || 120,
      location_id: e.location_id || null, venue_text: e.location_id ? null : e.venue_text?.trim() || null, seat_note: e.seat_note?.trim() || null };
    try { if (e.id) await db('exams', `id=eq.${e.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); else await db('exams', '', { method: 'POST', body, prefer: 'return=minimal' }); setEdit(null); load(); toast('Exam saved'); }
    catch (x: any) { toast(x.message, 'error'); }
  };
  const del = async (e: Exam) => { if (!confirm(`Delete ${e.course_code}?`)) return; await db('exams', `id=eq.${e.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(x => toast(x.message, 'error')); load(); };
  const openEdit = (e?: Exam) => { if (!e) return setEdit({ duration_min: 120, time: '09:00' }); const d = new Date(e.starts_at); setEdit({ ...e, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }); };

  if (authReady && !user) return (
    <div className="screen"><header className="page-head"><h1>Exams</h1></header><ScheduleTabs active="exams" />
      <div className="hero-card"><Icon name="event" /><h2>Your exam timetable</h2><p>Add each paper, get a countdown, a reminder the day before and just before it starts, and directions to the hall.</p>
        <div className="row wrap"><a className="btn primary" href="#/register">Create free account</a><a className="btn" href="#/login">Sign in</a></div></div></div>
  );
  return (
    <div className="screen">
      <header className="page-head"><h1>Exams</h1><p className="lede">Your exam timetable with countdowns, reminders and directions.</p></header>
      <ScheduleTabs active="exams" />
      <RemindersCard />
      {err && <Notice kind="error">{err}</Notice>}
      {!rows && !err && <Loading />}
      {rows && upcoming.length === 0 && <Empty icon="event" title="No upcoming exams">Add each paper from your official exam timetable.</Empty>}
      <div className="exam-list">
        {upcoming.map((e, i) => {
          const start = new Date(e.starts_at); const ms = start.getTime() - now;
          return (
            <article key={e.id} className={`exam-card ${i === 0 ? 'next' : ''} ${ms <= 0 ? 'live' : ''}`}>
              <div className="exam-count"><b>{countdown(ms)}</b><span>{ms <= 0 ? 'in progress' : 'to go'}</span></div>
              <div className="exam-body">
                <div className="row"><b className="exam-code">{e.course_code}</b><span className="spacer" />
                  <button className="icon-btn sm" aria-label="Edit" onClick={() => openEdit(e)}><Icon name="edit" /></button>
                  <button className="icon-btn sm" aria-label="Delete" onClick={() => del(e)}><Icon name="trash" /></button></div>
                {e.course_title && <div className="sub">{e.course_title}</div>}
                <div className="exam-meta"><Icon name="calendar" />{start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {Math.round(e.duration_min / 6) / 10} h</div>
                <div className="exam-meta"><Icon name="pin" />{venue(e)}{e.seat_note ? ` · ${e.seat_note}` : ''}</div>
                <div className="row wrap" style={{ marginTop: 8 }}>
                  {e.location_id && <button className="btn small primary" onClick={() => goDirections(e.location_id!)}><Icon name="walk" />Directions</button>}
                  <button className="btn small" onClick={() => icsFile({ uid: e.id, title: `${e.course_code} exam`, start, minutes: e.duration_min, location: venue(e), alarmMin: 60 })}><Icon name="calendar" />Add to calendar</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => openEdit()}><Icon name="plus" />Add exam</button>
      {past.length > 0 && <><div className="section-title">Done</div><div className="list">{past.slice(-6).reverse().map(e => <div key={e.id} className="card row"><Icon name="check" style={{ width: 18, color: 'var(--ok)' }} /><b style={{ flex: 1 }}>{e.course_code}</b><span className="sub">{new Date(e.starts_at).toLocaleDateString()}</span><button className="icon-btn sm" aria-label="Delete" onClick={() => del(e)}><Icon name="trash" /></button></div>)}</div></>}

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Exam" onClick={x => x.stopPropagation()}>
            <h2>{edit.id ? 'Edit exam' : 'Add exam'}</h2>
            <div className="row wrap">
              <div className="field"><label>Course code</label><input className="input" value={edit.course_code || ''} onChange={x => setEdit({ ...edit, course_code: x.target.value })} placeholder="e.g. UGRC 110" /></div>
              <div className="field"><label>Title (optional)</label><input className="input" value={edit.course_title || ''} onChange={x => setEdit({ ...edit, course_title: x.target.value })} /></div>
            </div>
            <div className="row wrap">
              <div className="field"><label>Date</label><input className="input" type="date" value={edit.date || ''} onChange={x => setEdit({ ...edit, date: x.target.value })} /></div>
              <div className="field"><label>Start</label><input className="input" type="time" value={edit.time || ''} onChange={x => setEdit({ ...edit, time: x.target.value })} /></div>
              <div className="field" style={{ maxWidth: 120 }}><label>Minutes</label><input className="input" type="number" min={10} max={600} value={edit.duration_min} onChange={x => setEdit({ ...edit, duration_min: x.target.value })} /></div>
            </div>
            <div className="field"><label>Venue</label>
              {edit.location_id ? <div className="chip-sel"><Icon name="pin" />{byId.get(edit.location_id)?.name}<button className="icon-btn sm" aria-label="Clear venue" onClick={() => setEdit({ ...edit, location_id: null })}><Icon name="close" /></button></div>
                : <><SearchBox onPick={l => setEdit({ ...edit, location_id: l.id, venue_text: null })} placeholder="Find the exam hall…" /><input className="input" style={{ marginTop: 8 }} placeholder="…or type it" value={edit.venue_text || ''} onChange={x => setEdit({ ...edit, venue_text: x.target.value })} /></>}
            </div>
            <div className="field"><label>Seat / index note (optional)</label><input className="input" maxLength={120} placeholder="e.g. Block B" value={edit.seat_note || ''} onChange={x => setEdit({ ...edit, seat_note: x.target.value })} /><span className="hint">Don't enter your student ID or index number.</span></div>
            <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={save}>Save</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
