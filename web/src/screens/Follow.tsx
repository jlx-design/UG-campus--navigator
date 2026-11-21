import React, { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/api';
import { Icon } from '../components/Icon';
import type { MapApi } from '../components/MapView';
import { fmtDuration } from '../lib/geo';

interface Share { sharer_name: string | null; dest_name: string | null; dest_lat: number | null; dest_lng: number | null; lat: number | null; lng: number | null; accuracy: number | null; heading: number | null; eta_s: number | null; status: string; updated_at: string; expires_at: string }
const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };

/** "Walk with me" viewer: shows a friend's live position from a share link. Read-only, time-limited. */
export function FollowOverlay({ mapApi, token }: { mapApi: React.MutableRefObject<MapApi | null>; token: string }) {
  const [s, setS] = useState<Share | null>(null); const [err, setErr] = useState(''); const first = useRef(true); const [, tick] = useState(0);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try { const r = await rpc<Share[]>('get_live_share', { p_token: token }); if (stop) return; if (!r.length) { setErr('This trip link is not valid.'); return; } setS(r[0]); setErr(''); }
      catch (e: any) { if (!stop) setErr(e.message); }
    };
    poll(); const i = setInterval(poll, 5000); const t = setInterval(() => tick(n => n + 1), 5000);
    return () => { stop = true; clearInterval(i); clearInterval(t); mapApi.current?.setFollow(null, null); };
  }, [token]);
  useEffect(() => {
    if (!s || s.lat == null || s.lng == null) return;
    mapApi.current?.setFollow({ lat: s.lat, lng: s.lng, heading: s.heading, name: s.sharer_name || 'Friend' }, s.dest_lat != null ? { lat: s.dest_lat, lng: s.dest_lng! } : null);
    if (first.current) { first.current = false; mapApi.current?.flyTo([s.lat, s.lng], 17); }
  }, [s]);
  const name = s?.sharer_name || 'Your friend';
  const stale = s && Date.now() - new Date(s.updated_at).getTime() > 90_000;
  return (
    <div className="follow-card glass" role="status" aria-live="polite">
      <div className="row"><span className={`follow-dot ${s?.status === 'active' && !stale ? 'live' : ''}`} /><b style={{ flex: 1 }}>{err ? 'Trip unavailable' : !s ? 'Loading trip…' : s.status === 'arrived' ? `${name} has arrived` : s.status === 'stopped' ? `${name} stopped sharing` : s.status === 'expired' ? 'This share has expired' : `${name} is walking${s.dest_name ? ` to ${s.dest_name}` : ''}`}</b></div>
      {err && <p className="sub">{err}</p>}
      {s && s.status === 'active' && (
        <p className="sub" style={{ margin: '6px 0 0' }}>{s.lat == null ? 'Waiting for their first GPS position…' : <>Updated {ago(s.updated_at)}{s.eta_s != null ? ` · about ${fmtDuration(s.eta_s)} to go` : ''}{s.accuracy ? ` · ±${Math.round(s.accuracy)} m` : ''}</>}{stale ? ' · signal may be lost' : ''}</p>
      )}
      {s?.lat != null && <button className="btn small" style={{ marginTop: 8 }} onClick={() => mapApi.current?.flyTo([s.lat!, s.lng!], 17.5)}><Icon name="locate" />Show {name.split(' ')[0]}</button>}
      <p className="hint" style={{ marginBottom: 0 }}>Shared location ends automatically on arrival or after 2 hours.</p>
    </div>
  );
}
