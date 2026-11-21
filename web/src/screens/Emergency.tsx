import React, { useEffect, useState } from 'react';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { Loading, Notice } from '../components/common';
import { fmtDate } from '../lib/geo';

interface Contact { id: string; name: string; category: string; phone: string | null; is_emergency: boolean; description: string | null; location_id: string | null; source_label: string; source_url: string; checked_at: string }
const CACHE = 'ugnav.emergency.v1';

export function Emergency() {
  const { byId, goDirections, geo, startGeo } = useStore();
  // Cached copy so the numbers are still there with no signal.
  const [rows, setRows] = useState<Contact[] | null>(() => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; } });
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    db<Contact[]>('emergency_contacts', 'select=*&is_published=eq.true&order=sort_order.asc')
      .then(r => { setRows(r); try { localStorage.setItem(CACHE, JSON.stringify(r)); } catch { /* ignore */ } })
      .catch(e => setErr(e.message));
  }, []);
  const urgent = rows?.filter(r => r.is_emergency) ?? [];
  const info = rows?.filter(r => !r.is_emergency) ?? [];
  const shareLocation = async () => {
    startGeo();
    if (geo.status !== 'ok') return;
    const txt = `My location: https://www.openstreetmap.org/?mlat=${geo.pos[0].toFixed(6)}&mlon=${geo.pos[1].toFixed(6)}#map=19/${geo.pos[0].toFixed(6)}/${geo.pos[1].toFixed(6)} (±${Math.round(geo.accuracy)} m)`;
    try { if (navigator.share) await navigator.share({ text: txt }); else { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2500); } } catch { /* cancelled */ }
  };
  return (
    <div className="screen">
      <header className="page-head danger"><div className="sos-badge"><Icon name="sos" /></div><h1>Emergency</h1>
        <p className="lede">Tap a number to call. Every number is linked to the source it was checked against.</p></header>
      {err && !rows && <Notice kind="error">Could not load contacts: {err}</Notice>}
      {!rows && !err && <Loading />}
      {urgent.length > 0 && (
        <div className="sos-grid">
          {urgent.map(c => (
            <div key={c.id} className={`sos-card ${c.category}`}>
              <div className="row"><b>{c.name}</b><span className="spacer" />{c.phone && <a className="call-btn" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${c.name} ${c.phone}`}><Icon name="phone" />{c.phone}</a>}</div>
              {c.description && <p>{c.description}</p>}
              <div className="row wrap sub">
                {c.location_id && byId.get(c.location_id) && <button className="link-btn" onClick={() => goDirections(c.location_id!)}>Directions</button>}
                <span>Source: <a href={c.source_url} target="_blank" rel="noopener noreferrer">{c.source_label}</a> · checked {fmtDate(c.checked_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row"><Icon name="locate" style={{ width: 20, color: 'var(--accent)' }} /><b style={{ flex: 1 }}>Share my location</b>
          <button className="btn small" onClick={shareLocation}>{geo.status === 'ok' ? (copied ? 'Copied' : 'Share') : geo.status === 'requesting' ? <span className="spinner" /> : 'Get location'}</button></div>
        <p className="sub" style={{ margin: '6px 0 0' }}>Sends a map link of your current GPS position via your phone's share sheet, so you can tell responders or friends exactly where you are.</p>
        {geo.status === 'denied' && <p className="error-text">Location permission is blocked for this site.</p>}
      </div>
      {info.length > 0 && (<>
        <div className="section-title">Information lines (not emergency)</div>
        <div className="list">{info.map(c => (
          <div key={c.id} className="card"><div className="row"><b style={{ flex: 1 }}>{c.name}</b>{c.phone && <a className="btn small" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" />{c.phone}</a>}</div>
            {c.description && <p className="sub">{c.description}</p>}
            <span className="sub">Source: <a href={c.source_url} target="_blank" rel="noopener noreferrer">{c.source_label}</a></span></div>
        ))}</div>
      </>)}
      <p className="hint" style={{ marginTop: 16 }}>Campus security and counselling lines will be added once confirmed from official UG sources. Know a verified number? <a href="#/report?kind=wrong_info">Tell us</a>.</p>
    </div>
  );
}
