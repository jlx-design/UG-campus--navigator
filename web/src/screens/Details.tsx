import React, { useEffect, useState } from 'react';
import { track } from '../lib/track';
import { db } from '../lib/api';
import { CAMPUS } from '../config';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { BackLink, Loading, Notice } from '../components/common';

export interface Details {
  display_name: string | null; affiliation: string | null; programme: string | null; college: string | null; department: string | null;
  level: string | null; hall_location_id: string | null; hall_name: string | null; residence: string | null;
  admission_year: number | null; graduation_year: number | null; emergency_contact_name: string | null; emergency_contact_phone: string | null;
}
const FIELDS = 'display_name,affiliation,programme,college,department,level,hall_location_id,hall_name,residence,admission_year,graduation_year,emergency_contact_name,emergency_contact_phone';
const LEVELS: [string, string][] = [['100', 'Level 100'], ['200', 'Level 200'], ['300', 'Level 300'], ['400', 'Level 400'], ['500', 'Level 500'], ['600', 'Level 600'], ['diploma', 'Diploma'], ['masters', "Master's"], ['mphil', 'MPhil'], ['phd', 'PhD'], ['other', 'Other']];
export const levelLabel = (l: string | null) => LEVELS.find(([k]) => k === l)?.[1] || '';

export function useDetails() {
  const { user } = useStore();
  const [d, setD] = useState<Details | null>(null);
  useEffect(() => { if (!user) { setD(null); return; } db<Details[]>('profiles', `select=${FIELDS}&user_id=eq.${user.id}`).then(r => setD(r[0] || null)).catch(() => setD(null)); }, [user?.id]);
  return d;
}

/** "My details" — what the person chooses to tell the app. Never asks for student ID or index numbers. */
export function MyDetails() {
  const { user, authReady, locations, toast, goDirections } = useStore();
  const [d, setD] = useState<Details | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (user) db<Details[]>('profiles', `select=${FIELDS}&user_id=eq.${user.id}`).then(r => setD(r[0] || ({} as Details))).catch(e => setErr(e.message)); }, [user?.id]);
  if (!authReady) return <div className="screen"><Loading /></div>;
  if (!user) return <div className="screen"><BackLink href="#/me" label="Me" /><h1>My details</h1><Notice kind="info">Sign in to save your details. <a href="#/login">Sign in</a></Notice></div>;
  if (!d) return <div className="screen"><Loading /></div>;
  const halls = locations.filter(l => l.category === 'hall').sort((a, b) => a.name.localeCompare(b.name));
  const set = (k: keyof Details, v: any) => setD({ ...d, [k]: v === '' ? null : v });
  const year = new Date().getFullYear();
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const phone = d.emergency_contact_phone?.trim() || null;
    if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone)) { setErr('Emergency contact phone should contain only digits, spaces, +, ( ) or -.'); setBusy(false); return; }
    const body = { ...d, emergency_contact_phone: phone, admission_year: d.admission_year ? Number(d.admission_year) : null, graduation_year: d.graduation_year ? Number(d.graduation_year) : null,
      hall_name: d.hall_location_id ? null : d.hall_name };
    try { await db('profiles', `user_id=eq.${user.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); toast('Details saved'); track('details_saved'); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const student = d.affiliation === 'student';
  return (
    <form className="screen" onSubmit={save}>
      <BackLink href="#/me" label="Me" />
      <header className="page-head"><h1>My details</h1><p className="lede">Helps the app personalise your timetable, guide and AI answers. Everything is optional and only visible to you.</p></header>
      <div className="privacy-note"><Icon name="shield" /><span>We never ask for your <b>student ID</b>, <b>index number</b> or passwords for {CAMPUS.short} systems. Don't type them anywhere in this app.</span></div>

      <div className="section-title">About you</div>
      <div className="card">
        <div className="field"><label htmlFor="dn">Name</label><input id="dn" className="input" maxLength={80} value={d.display_name || ''} onChange={e => set('display_name', e.target.value)} autoComplete="name" /></div>
        <div className="field"><label>I am a…</label>
          <div className="seg wrap">{[['student', 'Student'], ['staff', 'Staff'], ['visitor', 'Visitor'], ['other', 'Other']].map(([k, l]) => <button type="button" key={k} aria-pressed={d.affiliation === k} onClick={() => set('affiliation', d.affiliation === k ? null : k)}>{l}</button>)}</div></div>
      </div>

      {(student || d.programme || d.level) && (<>
        <div className="section-title">Studies</div>
        <div className="card">
          <div className="field"><label htmlFor="pg">Programme</label><input id="pg" className="input" maxLength={120} placeholder="e.g. BSc Computer Science" value={d.programme || ''} onChange={e => set('programme', e.target.value)} /></div>
          <div className="row wrap">
            <div className="field"><label htmlFor="co">College / School</label><input id="co" className="input" maxLength={120} value={d.college || ''} onChange={e => set('college', e.target.value)} /></div>
            <div className="field"><label htmlFor="de">Department</label><input id="de" className="input" maxLength={120} value={d.department || ''} onChange={e => set('department', e.target.value)} /></div>
          </div>
          <div className="field"><label>Level</label><div className="seg wrap">{LEVELS.map(([k, l]) => <button type="button" key={k} aria-pressed={d.level === k} onClick={() => set('level', d.level === k ? null : k)}>{l}</button>)}</div></div>
          <div className="row wrap">
            <div className="field"><label htmlFor="ay">Year admitted</label><input id="ay" className="input" type="number" inputMode="numeric" min={1948} max={year + 1} value={d.admission_year ?? ''} onChange={e => set('admission_year', e.target.value)} /></div>
            <div className="field"><label htmlFor="gy">Expected to graduate</label><input id="gy" className="input" type="number" inputMode="numeric" min={1948} max={year + 10} value={d.graduation_year ?? ''} onChange={e => set('graduation_year', e.target.value)} /></div>
          </div>
        </div>
      </>)}

      <div className="section-title">Where you stay</div>
      <div className="card">
        <div className="field"><label>Residence</label><div className="seg">{[['resident', 'On campus'], ['non_resident', 'Off campus']].map(([k, l]) => <button type="button" key={k} aria-pressed={d.residence === k} onClick={() => set('residence', d.residence === k ? null : k)}>{l}</button>)}</div></div>
        <div className="field"><label htmlFor="hall">Hall {student ? '(affiliation or residence)' : ''}</label>
          <select id="hall" className="input" value={d.hall_location_id || (d.hall_name ? '__other' : '')} onChange={e => { const v = e.target.value; setD({ ...d, hall_location_id: v && v !== '__other' ? v : null, hall_name: v === '__other' ? d.hall_name || '' : null }); }}>
            <option value="">Not set</option>
            {halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            <option value="__other">Not listed — type it</option>
          </select>
          {halls.length === 0 && <span className="hint">The hall list fills in once halls are added to the campus directory.</span>}
        </div>
        {!d.hall_location_id && d.hall_name !== null && <div className="field"><label htmlFor="hn">Hall name</label><input id="hn" className="input" maxLength={120} value={d.hall_name || ''} onChange={e => setD({ ...d, hall_name: e.target.value })} /></div>}
        {d.hall_location_id && <button type="button" className="btn small" onClick={() => goDirections(d.hall_location_id!)}><Icon name="walk" />Directions to my hall</button>}
      </div>

      <div className="section-title">Emergency contact</div>
      <div className="card">
        <p className="sub" style={{ marginTop: 0 }}>Someone we show a one-tap call button for on the Emergency screen. Stored privately in your account.</p>
        <div className="row wrap">
          <div className="field"><label htmlFor="en">Name</label><input id="en" className="input" maxLength={80} value={d.emergency_contact_name || ''} onChange={e => set('emergency_contact_name', e.target.value)} /></div>
          <div className="field"><label htmlFor="ep">Phone</label><input id="ep" className="input" type="tel" inputMode="tel" maxLength={20} placeholder="+233…" value={d.emergency_contact_phone || ''} onChange={e => set('emergency_contact_phone', e.target.value)} /></div>
        </div>
      </div>

      {err && <p className="error-text" role="alert">{err}</p>}
      <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="check" />}Save details</button>
    </form>
  );
}
