import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { getRoute, ApiError } from '../lib/api';
import { Icon, maneuverIcon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { Notice, VerificationTag } from '../components/common';
import type { MapApi } from '../components/MapView';
import { cumulative, fmtDistance, fmtDuration, haversine, inServiceArea, snapToRoute, type LatLng } from '../lib/geo';

const OFF_ROUTE_MIN_M = 25;       // never treat less than this as off-route
const OFF_ROUTE_FIXES = 3;        // consecutive fixes required
const REROUTE_COOLDOWN_MS = 20000;
const ARRIVE_M = 20;
const POOR_ACCURACY_M = 60;

export function NavigateOverlay({ mapApi }: { mapApi: React.MutableRefObject<MapApi | null> }) {
  const s = useStore();
  const { byId, destId, setDestId, route, setRoute, origin, setOrigin, geo, startGeo, navigating, setNavigating, pickingOrigin, setPickingOrigin, saved, toast } = s;
  const dest = destId ? byId.get(destId) : null;
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<{ msg: string; code: string } | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [arrived, setArrived] = useState(false);
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  const wakeLock = useRef<any>(null);

  const originPos: LatLng | null = origin.kind === 'point' ? origin.pos : geo.status === 'ok' ? geo.pos : null;

  useEffect(() => { if (origin.kind === 'gps' && dest) startGeo(); }, [origin.kind, dest?.id]);

  const request = useCallback(async (from: LatLng, isReroute = false) => {
    if (!dest) return;
    if (!inServiceArea(from)) { setState('error'); setError({ msg: 'Your starting point is outside the Legon campus area this app covers. Pick a start point on the map instead.', code: 'outside' }); return; }
    isReroute ? setRerouting(true) : setState('loading');
    setError(null);
    try {
      const r = await getRoute(from, [dest.lat, dest.lng]);
      setRoute(r); setState('idle'); offCount.current = 0; lastReroute.current = Date.now();
    } catch (e: any) {
      const err = e as ApiError;
      if (isReroute) toast('Could not recalculate the route. Keep following the current route or try again.', 'error');
      else { setState('error'); setError({ msg: err.message, code: err.code }); }
    } finally { setRerouting(false); }
  }, [dest, setRoute, toast]);

  // Request route automatically once origin + destination are known (preview only).
  const reqKey = dest && originPos ? `${dest.id}|${origin.kind === 'point' ? origin.pos.join(',') : 'gps'}` : '';
  const lastKey = useRef('');
  useEffect(() => {
    if (!reqKey || navigating || reqKey === lastKey.current || !originPos) return;
    lastKey.current = reqKey; request(originPos);
  }, [reqKey, !!originPos]);

  const cum = useMemo(() => (route ? cumulative(route.coordinates) : []), [route]);
  const total = cum.length ? cum[cum.length - 1] : 0;

  // Live progress from genuine GPS fixes
  const progress = useMemo(() => {
    if (!navigating || !route || geo.status !== 'ok') return null;
    const snap = snapToRoute(geo.pos, route.coordinates);
    const stepIdx = Math.max(0, route.steps.findIndex(st => snap.segmentIndex < st.way_points[1]));
    const step = route.steps[stepIdx] ?? route.steps[route.steps.length - 1];
    const next = route.steps[stepIdx + 1];
    const toManeuver = Math.max(0, (cum[step?.way_points[1] ?? 0] ?? total) - snap.alongM);
    const remaining = Math.max(0, total - snap.alongM);
    return { snap, step, next, toManeuver, remaining, remainingS: total ? route.duration_s * (remaining / total) : 0 };
  }, [navigating, route, geo, cum, total]);

  // Off-route detection, rerouting and arrival
  useEffect(() => {
    if (!progress || geo.status !== 'ok' || !dest) return;
    if (haversine(geo.pos, [dest.lat, dest.lng]) <= Math.max(ARRIVE_M, Math.min(geo.accuracy, 40)) || progress.remaining < 10) { setArrived(true); return; }
    if (geo.accuracy > POOR_ACCURACY_M) return; // too imprecise to judge
    const threshold = Math.max(OFF_ROUTE_MIN_M, geo.accuracy * 1.5);
    if (progress.snap.offRouteM > threshold) offCount.current++; else offCount.current = 0;
    if (offCount.current >= OFF_ROUTE_FIXES && Date.now() - lastReroute.current > REROUTE_COOLDOWN_MS && !rerouting) {
      toast('Off route — recalculating…'); request(geo.pos, true);
    }
  }, [progress]);

  // Keep the screen on while navigating where supported
  useEffect(() => {
    if (!navigating) { wakeLock.current?.release?.().catch(() => {}); wakeLock.current = null; return; }
    const req = () => (navigator as any).wakeLock?.request('screen').then((l: any) => { wakeLock.current = l; }).catch(() => {});
    req();
    const onVis = () => { if (document.visibilityState === 'visible' && navigating) req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [navigating]);

  const start = () => {
    setOrigin({ kind: 'gps' }); startGeo(); setArrived(false); setNavigating(true); offCount.current = 0;
    if (geo.status === 'ok' && route) {
      const off = snapToRoute(geo.pos, route.coordinates).offRouteM;
      if (off > 60) request(geo.pos, true); // route was planned from elsewhere
    }
  };
  const stop = () => { setNavigating(false); setArrived(false); mapApi.current?.fitRoute(); };
  const clearAll = () => { setNavigating(false); setRoute(null); setDestId(null); setState('idle'); setError(null); lastKey.current = ''; setOrigin({ kind: 'gps' }); };

  // ── Active navigation ──
  if (navigating && route && dest) {
    const stale = geo.status === 'ok' && Date.now() - geo.at > 20000;
    return (
      <>
        <div className="hud" role="status" aria-live="polite">
          {arrived ? (
            <div className="maneuver"><Icon name="arrive" /><div><div className="dist">You’ve arrived</div><div className="instr">{dest.name}</div></div></div>
          ) : progress ? (
            <div className="maneuver">
              <Icon name={maneuverIcon(progress.next?.type ?? progress.step?.type ?? 6)} />
              <div style={{ minWidth: 0 }}>
                <div className="dist">{fmtDistance(progress.toManeuver)}</div>
                <div className="instr">{progress.next?.instruction || progress.step?.instruction || 'Continue'}</div>
              </div>
            </div>
          ) : (
            <div className="maneuver"><span className="spinner" /><div className="instr">{geo.status === 'denied' ? 'Location permission is blocked — live guidance needs your location.' : geo.status === 'unavailable' ? geo.message : 'Waiting for your GPS position…'}</div></div>
          )}
          {(rerouting || stale || (geo.status === 'ok' && geo.accuracy > POOR_ACCURACY_M)) && (
            <div className="hud-status">
              {rerouting ? <><span className="spinner" />Recalculating route…</> : stale ? <><Icon name="alert" style={{ width: 16 }} />GPS signal lost — showing last known position</> : <><Icon name="alert" style={{ width: 16 }} />Weak GPS (±{Math.round((geo as any).accuracy)} m) — guidance may lag</>}
            </div>
          )}
        </div>
        <div className="nav-bottom glass">
          <div>
            <div className="big">{progress ? fmtDuration(progress.remainingS) : fmtDuration(route.duration_s)}</div>
            <div className="sub">{progress ? fmtDistance(progress.remaining) : fmtDistance(route.distance_m)} · to {dest.name}</div>
          </div>
          <span className="spacer" />
          <button className="btn small" onClick={() => mapApi.current?.fitRoute()} aria-label="Route overview"><Icon name="map" /></button>
          <button className="btn small danger" onClick={stop}>{arrived ? 'Done' : 'Exit'}</button>
        </div>
      </>
    );
  }

  // ── Planning ──
  return (
    <>
      <div className="map-overlay-top">
        {!dest ? (
          <>
            <SearchBox onPick={l => { setDestId(l.id); setRoute(null); lastKey.current = ''; }} placeholder="Where do you want to go?" />
            {saved.size > 0 && (
              <div className="chips">
                {[...saved].map(id => byId.get(id)).filter(Boolean).slice(0, 8).map(l => (
                  <button key={l!.id} className="chip glass" onClick={() => { setDestId(l!.id); setRoute(null); lastKey.current = ''; }}><Icon name="starFill" />{l!.name}</button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="glass" style={{ borderRadius: 16, padding: '10px 12px' }}>
            <div className="row"><span className="sub" style={{ width: 44 }}>From</span>
              <b style={{ flex: 1, minWidth: 0 }}>{origin.kind === 'gps' ? (geo.status === 'ok' ? 'Your location' : geo.status === 'requesting' ? 'Finding your location…' : 'Your location (unavailable)') : 'Point on map'}</b>
              <button className="btn small" onClick={() => setPickingOrigin(!pickingOrigin)} aria-pressed={pickingOrigin}>{pickingOrigin ? 'Tap the map…' : 'Pick on map'}</button>
              {origin.kind === 'point' && <button className="btn small ghost" onClick={() => { setOrigin({ kind: 'gps' }); lastKey.current = ''; }}>Use GPS</button>}
            </div>
            <div className="row" style={{ marginTop: 6 }}><span className="sub" style={{ width: 44 }}>To</span>
              <b style={{ flex: 1, minWidth: 0 }}>{dest.name}</b>
              <button className="icon-btn" onClick={clearAll} aria-label="Change destination"><Icon name="close" /></button>
            </div>
          </div>
        )}
        {dest && origin.kind === 'gps' && geo.status === 'denied' && <Notice>Location permission is blocked, so the route can’t start from where you are. Tap “Pick on map” to choose a starting point, or allow location for this site in your browser settings.</Notice>}
        {dest && origin.kind === 'gps' && geo.status === 'unavailable' && <Notice>{geo.message} You can tap “Pick on map” instead.</Notice>}
        {dest && dest.verification !== 'verified' && <Notice kind="info">This destination’s position comes from {dest.source_label} and is not yet verified by the app’s editors.</Notice>}
      </div>

      {!dest && (
        <section className="sheet glass">
          <h2>Walking directions</h2>
          <p>Search for a destination above, or pick a place on the Explore map and tap Directions. Routes come from a pedestrian routing service using OpenStreetMap paths.</p>
        </section>
      )}

      {dest && (
        <section className="sheet glass" aria-label="Route preview">
          <div className="grab" />
          {state === 'loading' && <div className="row"><span className="spinner" /> Calculating walking route…</div>}
          {state === 'error' && error && (
            <>
              <Notice kind="error">{error.msg}</Notice>
              <div className="row wrap" style={{ marginTop: 10 }}>
                {error.code !== 'routing_not_configured' && originPos && <button className="btn" onClick={() => request(originPos)}><Icon name="refresh" />Try again</button>}
                <button className="btn" onClick={() => setPickingOrigin(true)}>Pick a different start</button>
              </div>
            </>
          )}
          {state === 'idle' && !route && !originPos && <p>Waiting for a starting point…</p>}
          {route && state !== 'loading' && (
            <>
              <div className="row">
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtDuration(route.duration_s)}</div>
                  <div className="sub">{fmtDistance(route.distance_m)} walk · {dest.name}</div>
                </div>
                <span className="spacer" />
                <VerificationTag v={dest.verification} />
              </div>
              <div className="row wrap" style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={start}><Icon name="navigate" />Start</button>
                <button className="btn" onClick={() => setShowSteps(!showSteps)} aria-expanded={showSteps}><Icon name="list" />{showSteps ? 'Hide steps' : `${route.steps.length} steps`}</button>
              </div>
              {showSteps && (
                <ol className="steps">
                  {route.steps.map((st, i) => (
                    <li key={i}><Icon name={maneuverIcon(st.type)} /><span>{st.instruction}</span><span className="d">{st.distance_m > 0 ? fmtDistance(st.distance_m) : ''}</span></li>
                  ))}
                </ol>
              )}
              <p className="hint" style={{ marginTop: 10 }}>Route accessibility (steps, ramps) is not verified. {route.attribution}</p>
            </>
          )}
        </section>
      )}
    </>
  );
}
