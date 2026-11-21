import React, { useEffect, useRef, useState } from 'react';
import { db, rpc } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { Empty, Notice } from '../components/common';

interface Vehicle { id: string; label: string; route_id: string | null }
interface Stop { id: string; route_id: string; seq: number; name: string; lat: number; lng: number }

export function Shuttles() {
  const { shuttles, shuttleRoutes, role, user, setShowShuttles } = useStore();
  const [stops, setStops] = useState<Stop[]>([]);
  useEffect(() => { db<Stop[]>('shuttle_stops', 'select=*&order=route_id.asc,seq.asc').then(setStops).catch(() => {}); }, []);
  const ago = (iso: string) => { const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };
  return (
    <div className="screen">
      <header className="page-head"><h1>Campus shuttles</h1><p className="lede">Live positions are shared by shuttle drivers using this app. If a bus isn't on the map, its driver isn't sharing right now.</p></header>
      <a className="btn primary block" href="#/map" onClick={() => setShowShuttles(true)}><Icon name="map" />See shuttles on the map{shuttles.length ? ` (${shuttles.length} live)` : ''}</a>
      <div className="section-title">Routes</div>
      {shuttleRoutes.length === 0 && <Empty icon="bus" title="No shuttle routes published yet">Routes and stops are added by administrators once confirmed with the transport office.</Empty>}
      <div className="list">
        {shuttleRoutes.map(r => {
          const live = shuttles.filter(p => p.route_id === r.id);
          const rs = stops.filter(s => s.route_id === r.id);
          return (
            <div key={r.id} className="card route-card" style={{ ['--c' as any]: r.color }}>
              <div className="row"><span className="route-dot" /><h3 style={{ flex: 1 }}>{r.name}</h3>{live.length ? <span className="tag ok"><span className="pulse" />{live.length} live · {ago(live[0].updated_at)}</span> : <span className="tag">not live</span>}</div>
              {r.description && <p className="sub">{r.description}</p>}
              {r.hours && <p className="sub"><Icon name="clock" style={{ width: 14 }} /> {r.hours}</p>}
              {rs.length > 0 && <ol className="stops">{rs.map(s => <li key={s.id}>{s.name}</li>)}</ol>}
            </div>
          );
        })}
      </div>
      {(role === 'driver' || role === 'admin') && user && <DriverMode />}
    </div>
  );
}

function DriverMode() {
  const { toast } = useStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicle, setVehicle] = useState('');
  const [sharing, setSharing] = useState(false);
  const [last, setLast] = useState<{ at: number; acc: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const watch = useRef<number | null>(null); const lastSent = useRef(0); const wake = useRef<any>(null);
  useEffect(() => { db<Vehicle[]>('shuttle_vehicles', 'select=id,label,route_id&is_active=eq.true&order=label.asc').then(v => { setVehicles(v); if (v[0]) setVehicle(v[0].id); }).catch(e => setErr(e.message)); }, []);
  const stop = async () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null;
    wake.current?.release?.().catch(() => {}); setSharing(false);
    if (vehicle) await rpc('stop_shuttle_sharing', { p_vehicle: vehicle }).catch(() => {});
  };
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);
  const start = () => {
    if (!vehicle) return; setErr(null); setSharing(true);
    (navigator as any).wakeLock?.request('screen').then((l: any) => { wake.current = l; }).catch(() => {});
    watch.current = navigator.geolocation.watchPosition(async p => {
      if (Date.now() - lastSent.current < 4000) return; lastSent.current = Date.now();
      try {
        await rpc('report_shuttle_position', { p_vehicle: vehicle, p_lat: p.coords.latitude, p_lng: p.coords.longitude, p_heading: p.coords.heading, p_speed: p.coords.speed, p_accuracy: p.coords.accuracy });
        setLast({ at: Date.now(), acc: p.coords.accuracy });
      } catch (e: any) { setErr(e.message); }
    }, e => { setErr(e.code === e.PERMISSION_DENIED ? 'Location permission is blocked.' : 'GPS unavailable.'); if (e.code === e.PERMISSION_DENIED) stop(); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    toast('Sharing shuttle location');
  };
  return (
    <>
      <div className="section-title">Driver mode</div>
      <div className="card">
        {vehicles.length === 0 ? <p className="sub">No active vehicles. An administrator adds vehicles in Admin → Shuttles.</p> : (
          <>
            <div className="field"><label>Vehicle</label><select className="input" value={vehicle} disabled={sharing} onChange={e => setVehicle(e.target.value)}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></div>
            {sharing ? <button className="btn danger block" onClick={stop}><span className="pulse" />Stop sharing</button> : <button className="btn primary block" onClick={start}><Icon name="steering" />Start sharing my location</button>}
            {sharing && last && <p className="sub" style={{ marginTop: 8 }}>Last update {Math.round((Date.now() - last.at) / 1000)}s ago · ±{Math.round(last.acc)} m</p>}
            <p className="hint" style={{ marginTop: 8 }}>Keep this screen open while driving — phones pause GPS for background web pages. Positions disappear from the public map 3 minutes after the last update.</p>
          </>
        )}
        {err && <Notice kind="error">{err}</Notice>}
      </div>
    </>
  );
}
