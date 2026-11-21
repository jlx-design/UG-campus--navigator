import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { K } from '../lib/keys';
import { APP_NAME } from '../config';
import { useStore } from '../store';
import { getRoute, ApiError, db } from '../lib/api';
import { track } from '../lib/track';
import { Icon, maneuverIcon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { Notice, VerificationTag } from '../components/common';
import type { MapApi } from '../components/MapView';
import { cumulative, fmtDistance, fmtDuration, haversine, inServiceArea, routeBearingAhead, snapToRoute, spokenDistance, type LatLng } from '../lib/geo';

const OFF_ROUTE_MIN_M = 25;       // never treat less than this as off-route
const OFF_ROUTE_FIXES = 3;        // consecutive fixes required
const REROUTE_COOLDOWN_MS = 20000;
const ARRIVE_M = 20;
const POOR_ACCURACY_M = 60;
const NEAR_M = 40;                // "In 40 metres, turn left"
const NOW_M = 12;                 // "Turn left now"
const VOICE_KEY = K('voice.v1');

/** Spoken guidance via the browser's built-in speech engine (works offline on most phones). */
function useVoice() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(VOICE_KEY) !== '0'; } catch { return true; } });
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const speak = useCallback((text: string, interrupt = false) => {
    if (!supported || !on) return;
    try { if (interrupt) speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = 1; speechSynthesis.speak(u); } catch { /* ignore */ }
  }, [on, supported]);
  const toggle = () => { const v = !on; setOn(v); try { localStorage.setItem(VOICE_KEY, v ? '1' : '0'); } catch { /* ignore */ } if (!v && supported) speechSynthesis.cancel(); };
  return { on, supported, speak, toggle };
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const say = (instr: string) => instr.replace(/\s+/g, ' ').trim().replace(/\.$/, '');

export function NavigateOverlay({ mapApi }: { mapApi: React.MutableRefObject<MapApi | null> }) {
  const s = useStore();
  const { byId, destId, setDestId, route, setRoute, origin, setOrigin, geo, startGeo, navigating, setNavigating, pickingOrigin, setPickingOrigin, saved, toast, user } = s;
  // Deep link from a reminder notification: #/navigate?to=<place id>
  useEffect(() => { const to = new URLSearchParams(location.hash.split('?')[1] || '').get('to'); if (to && byId.has(to) && to !== destId) { setRoute(null); setDestId(to); } }, [byId.size]);
  const dest = destId ? byId.get(destId) : null;
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<{ msg: string; code: string } | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [arrived, setArrived] = useState(false);
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  const wakeLock = useRef<any>(null);
  const [follow, setFollow] = useState(true);
  const [askLoc, setAskLoc] = useState(false);
  const askedLoc = useRef(false);
  const spoken = useRef(new Set<string>());
  const voice = useVoice();
  // "Walk with me": time-limited live location shared by link.
  const [shareToken, setShareToken] = useState<string | null>(null);
  const lastShare = useRef(0);
  const shareTrip = async () => {
    if (!user) { toast('Sign in to share your trip with a friend', 'error'); return; }
    try {
      let token = shareToken;
      if (!token) {
        const rows = await db<any[]>('live_shares', '', { method: 'POST', prefer: 'return=representation', body: { sharer_name: (user.name || 'A friend').slice(0, 60), dest_location_id: dest && dest.id !== 'pin' ? dest.id : null } });
        token = rows[0].token as string; setShareToken(token); lastShare.current = 0;
      }
      const url = `${location.origin}${location.pathname}#/follow/${token}`;
      const text = `Follow my walk${dest ? ` to ${dest.name}` : ''} live (ends when I arrive):`;
      if (navigator.share) await navigator.share({ title: 'Walk with me', text, url }).catch(() => {});
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied — send it to a friend'); }
      track('share_trip');
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const endShare = (status: 'arrived' | 'stopped') => { if (shareToken) db('live_shares', `token=eq.${shareToken}`, { method: 'PATCH', body: { status }, prefer: 'return=minimal' }).catch(() => {}); setShareToken(null); };

  const originPos: LatLng | null = origin.kind === 'point' ? origin.pos : geo.status === 'ok' ? geo.pos : null;

  // Ask before using the person's location (unless they've already granted it to this site).
  useEffect(() => {
    if (!dest || origin.kind !== 'gps' || geo.status !== 'idle' || askedLoc.current) return;
    askedLoc.current = true;
    const perm = (navigator as any).permissions?.query?.({ name: 'geolocation' });
    if (perm) perm.then((r: any) => { if (r.state === 'granted') startGeo(); else setAskLoc(true); }).catch(() => setAskLoc(true));
    else setAskLoc(true);
  }, [dest?.id, origin.kind, geo.status]);
  useEffect(() => { if (geo.status !== 'idle') setAskLoc(false); }, [geo.status]);

  const request = useCallback(async (from: LatLng, isReroute = false) => {
    if (!dest) return;
    if (!inServiceArea(from)) { setState('error'); setError({ msg: 'Your starting point is outside the campus area this app covers. Pick a start point on the map instead.', code: 'outside' }); return; }
    isReroute ? setRerouting(true) : setState('loading');
    setError(null);
    try {
      const r = await getRoute(from, [dest.lat, dest.lng]);
      setRoute(r); setState('idle'); offCount.current = 0; if (!isReroute) track('route', dest.id); lastReroute.current = isReroute ? Date.now() : 0;
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
    let stepIdx = route.steps.findIndex(st => snap.segmentIndex >= st.way_points[0] && snap.segmentIndex < st.way_points[1]);
    if (stepIdx < 0) stepIdx = route.steps.length - 1;
    const step = route.steps[stepIdx];
    const nextIdx = Math.min(stepIdx + 1, route.steps.length - 1);
    const next = route.steps[nextIdx];
    const then = route.steps[nextIdx + 1];
    const toManeuver = Math.max(0, (cum[step?.way_points[1] ?? 0] ?? total) - snap.alongM);
    const remaining = Math.max(0, total - snap.alongM);
    return { snap, stepIdx, step, nextIdx, next, then, toManeuver, remaining, remainingS: total ? route.duration_s * (remaining / total) : 0 };
  }, [navigating, route, geo, cum, total]);

  // Camera: follow the person, heading-up, like a car/walking sat-nav.
  useEffect(() => {
    if (!navigating || !route || geo.status !== 'ok' || !follow || !progress) return;
    const onRoute = progress.snap.offRouteM < Math.max(25, geo.accuracy);
    const pos: LatLng = onRoute ? progress.snap.point : geo.pos;
    const usableHeading = geo.heading !== null && !Number.isNaN(geo.heading) && geo.accuracy < 30;
    const b = onRoute || !usableHeading ? routeBearingAhead(route.coordinates, progress.snap.segmentIndex, progress.snap.point) : geo.heading!;
    mapApi.current?.navCamera(pos, b);
  }, [progress, follow]);

  // Keep the shared trip up to date (at most every 8 s).
  useEffect(() => {
    if (!shareToken || geo.status !== 'ok' || Date.now() - lastShare.current < 8000) return;
    lastShare.current = Date.now();
    db('live_shares', `token=eq.${shareToken}`, { method: 'PATCH', prefer: 'return=minimal', body: { lat: geo.pos[0], lng: geo.pos[1], accuracy: Math.round(geo.accuracy), heading: geo.heading, eta_s: progress ? Math.round(progress.remainingS) : null, updated_at: new Date().toISOString() } }).catch(() => {});
  }, [geo, shareToken]);

  // Grey out the walked part of the line.
  useEffect(() => {
    if (!navigating || !route || !progress) { mapApi.current?.setRouteProgress(null); return; }
    mapApi.current?.setRouteProgress([...route.coordinates.slice(0, progress.snap.segmentIndex + 1), progress.snap.point]);
  }, [progress, navigating]);

  // Pause following when the person pans/rotates the map themselves.
  useEffect(() => {
    if (!navigating) return;
    mapApi.current?.onUserMove(() => setFollow(false));
    return () => mapApi.current?.onUserMove(null);
  }, [navigating]);

  // Spoken + haptic turn-by-turn prompts.
  useEffect(() => {
    if (!progress || !dest || arrived) return;
    const { nextIdx, next, toManeuver, step } = progress;
    if (!next) return;
    const instr = say(next.instruction);
    const key = (stage: string) => `${route?.duration_s}|${nextIdx}|${stage}`;
    const once = (stage: string, text: string, buzz = false) => {
      if (spoken.current.has(key(stage))) return; spoken.current.add(key(stage));
      voice.speak(text, buzz); if (buzz) navigator.vibrate?.([120, 60, 120]);
    };
    const stepLen = step?.distance_m ?? 0;
    if (toManeuver <= NOW_M) { if (next.type !== 10) once('now', instr, true); }
    else if (toManeuver <= NEAR_M && stepLen > NEAR_M + 20) once('near', `In ${spokenDistance(toManeuver)}, ${instr.charAt(0).toLowerCase() + instr.slice(1)}`);
    else if (toManeuver > NEAR_M) once('far', toManeuver > 120 ? `Continue for ${spokenDistance(toManeuver)}` : `In ${spokenDistance(toManeuver)}, ${instr.charAt(0).toLowerCase() + instr.slice(1)}`);
  }, [progress?.nextIdx, progress ? Math.round(progress.toManeuver / 5) : 0, arrived]);

  useEffect(() => { if (arrived) { setShowSteps(false); track('nav_arrive', dest?.id || ''); endShare('arrived'); } if (arrived && dest) { voice.speak(`You have arrived at ${dest.name}`, true); navigator.vibrate?.([200, 80, 200, 80, 200]); } }, [arrived]);

  // Off-route detection, rerouting and arrival
  useEffect(() => {
    if (!progress || geo.status !== 'ok' || !dest) return;
    if (haversine(geo.pos, [dest.lat, dest.lng]) <= Math.max(ARRIVE_M, Math.min(geo.accuracy, 40)) || (progress.remaining < 10 && progress.snap.offRouteM < 30)) { setArrived(true); return; }
    if (geo.accuracy > POOR_ACCURACY_M) return; // too imprecise to judge
    const threshold = Math.max(OFF_ROUTE_MIN_M, geo.accuracy * 1.5);
    if (progress.snap.offRouteM > threshold) offCount.current++; else offCount.current = 0;
    if (offCount.current >= OFF_ROUTE_FIXES && Date.now() - lastReroute.current > REROUTE_COOLDOWN_MS && !rerouting) {
      toast('Off route — recalculating…'); voice.speak('Rerouting', true); request(geo.pos, true);
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
    track('nav_start', dest?.id || ''); setShowSteps(false); setOrigin({ kind: 'gps' }); startGeo(); setArrived(false); setNavigating(true); offCount.current = 0; setFollow(true); spoken.current.clear();
    // Speaking inside the tap also unlocks speech on iOS for the rest of the trip.
    if (route && dest) voice.speak(`Starting route to ${dest.name}. ${fmtDuration(route.duration_s).replace('min', 'minutes')} walk. ${route.steps[0] ? say(route.steps[0].instruction) : ''}`);
    if (geo.status === 'ok' && route) mapApi.current?.navCamera(geo.pos, routeBearingAhead(route.coordinates, snapToRoute(geo.pos, route.coordinates).segmentIndex, geo.pos));
    if (geo.status === 'ok' && route) {
      const off = snapToRoute(geo.pos, route.coordinates).offRouteM;
      if (off > 60) request(geo.pos, true); // route was planned from elsewhere
    }
  };
  const stop = () => { if (shareToken) endShare(arrived ? 'arrived' : 'stopped'); setNavigating(false); setArrived(false); setShowSteps(false); if ('speechSynthesis' in window) speechSynthesis.cancel(); mapApi.current?.setRouteProgress(null); mapApi.current?.fitRoute(); };
  const clearAll = () => { setNavigating(false); setRoute(null); setDestId(null); setState('idle'); setError(null); lastKey.current = ''; setOrigin({ kind: 'gps' }); };

  // ── Active navigation ──
  if (navigating && route && dest) {
    const stale = geo.status === 'ok' && Date.now() - geo.at > 20000;
    const weak = geo.status === 'ok' && geo.accuracy > POOR_ACCURACY_M;
    const p = progress;
    const remainingS = p ? p.remainingS : route.duration_s;
    return (
      <>
        <div className="nav-top">
          <div className={`hud ${arrived ? 'arrived' : ''}`} role="status" aria-live="polite">
            {arrived ? (
              <div className="maneuver"><span className="m-ic"><Icon name="arrive" /></span><div><div className="dist">{'You’ve arrived'}</div><div className="instr">{dest.name}</div></div></div>
            ) : p && p.next ? (
              <div className="maneuver">
                <span className="m-ic"><Icon name={maneuverIcon(p.next.type)} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="dist">{fmtDistance(p.toManeuver)}</div>
                  <div className="instr">{p.next.instruction}</div>
                </div>
              </div>
            ) : (
              <div className="maneuver"><span className="m-ic"><span className="spinner" /></span><div className="instr">{geo.status === 'denied' ? 'Location is blocked — allow location for this site to get live directions.' : geo.status === 'unavailable' ? geo.message : 'Finding your position…'}</div></div>
            )}
          </div>
          {!arrived && p?.then && p.next && p.next.distance_m < 150 && (
            <div className="hud-then"><span>Then</span><Icon name={maneuverIcon(p.then.type)} /></div>
          )}
          {(rerouting || stale || weak) && (
            <div className="hud-status glass">
              {rerouting ? <><span className="spinner" />Rerouting…</> : stale ? <><Icon name="alert" />GPS signal lost — showing last known position</> : <><Icon name="alert" />Weak GPS (±{Math.round((geo as any).accuracy)} m) — directions may lag</>}
            </div>
          )}
        </div>

        {shareToken && !arrived && <div className="sharing-pill glass"><span className="follow-dot live" />Sharing live location<button className="link-btn" onClick={() => endShare('stopped')}>Stop</button></div>}
        {!follow && !arrived && (
          <button className="recenter glass" onClick={() => setFollow(true)}><Icon name="recenter" />{'Re-centre'}</button>
        )}

        {showSteps && (
          <section className="sheet glass nav-steps" aria-label="All steps">
            <div className="row"><h2 style={{ flex: 1 }}>Steps</h2><button className="icon-btn" onClick={() => setShowSteps(false)} aria-label="Close"><Icon name="close" /></button></div>
            <ol className="steps">
              {route.steps.map((st, i) => (
                <li key={i} className={p && i < p.nextIdx ? 'done' : p && i === p.nextIdx ? 'current' : ''}><Icon name={maneuverIcon(st.type)} /><span>{st.instruction}</span><span className="d">{st.distance_m > 0 ? fmtDistance(st.distance_m) : ''}</span></li>
              ))}
            </ol>
          </section>
        )}

        <div className="nav-bottom glass">
          <button className="round-btn danger" onClick={stop} aria-label={arrived ? 'Finish' : 'Exit navigation'}><Icon name={arrived ? 'check' : 'close'} /></button>
          <div className="eta">
            {arrived ? <><div className="big">Arrived</div><div className="sub">{dest.name}</div></> : <>
              <div className="big">{fmtDuration(remainingS)}</div>
              <div className="sub">{fmtDistance(p ? p.remaining : route.distance_m)} · {clock(Date.now() + remainingS * 1000)}</div>
            </>}
          </div>
          {!arrived && <button className="round-btn" onClick={shareTrip} aria-pressed={!!shareToken} aria-label={shareToken ? 'Sharing your trip — share link again' : 'Share my trip live with a friend'}><Icon name="share2" /></button>}
          {voice.supported && <button className="round-btn" onClick={voice.toggle} aria-pressed={voice.on} aria-label={voice.on ? 'Mute voice guidance' : 'Turn on voice guidance'}><Icon name={voice.on ? 'volume' : 'volumeOff'} /></button>}
          <button className="round-btn" onClick={() => setShowSteps(v => !v)} aria-pressed={showSteps} aria-label="All steps"><Icon name="list" /></button>
          <button className="round-btn" onClick={() => { setFollow(false); mapApi.current?.fitRoute(); }} aria-label="Route overview"><Icon name="map" /></button>
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
              <b style={{ flex: 1, minWidth: 0 }}>{origin.kind === 'gps' ? (geo.status === 'ok' ? 'Your location' : geo.status === 'requesting' ? 'Finding your location…' : geo.status === 'idle' ? <button className="link-btn" onClick={() => setAskLoc(true)}>Use my location</button> : 'Your location (unavailable)') : 'Point on map'}</b>
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
        {dest && dest.id !== 'pin' && dest.verification !== 'verified' && <Notice kind="info">This destination’s position comes from {dest.source_label} and is not yet verified by the app’s editors.</Notice>}
      </div>

      {askLoc && dest && (
        <div className="modal-back" onClick={() => setAskLoc(false)}>
          <div className="modal loc-ask" role="dialog" aria-modal="true" aria-labelledby="loc-ask-t" onClick={e => e.stopPropagation()}>
            <div className="loc-ask-ic"><Icon name="locate" /></div>
            <h2 id="loc-ask-t">{'Use your current location?'}</h2>
            <p>To guide you step by step to <b>{dest.name}</b>, {APP_NAME} needs your location. It stays on your phone and is only used while you get directions.</p>
            <button className="btn primary block" onClick={() => { setAskLoc(false); startGeo(); }}><Icon name="locate" />{'Use my location'}</button>
            <button className="btn block" style={{ marginTop: 8 }} onClick={() => { setAskLoc(false); setPickingOrigin(true); toast('Tap the map where you are starting from'); }}>Choose a starting point on the map</button>
          </div>
        </div>
      )}

      {!dest && (
        <section className="sheet glass">
          <h2>Walking directions</h2>
          <p>Search for a destination above, or pick a place on the Explore map and tap Directions. You can also <b>press and hold</b> anywhere on the map to drop a pin and walk there. Routes follow OpenStreetMap footpaths and roads.</p>
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
                {dest.id !== 'pin' && <VerificationTag v={dest.verification} />}
              </div>
              <div className="row wrap" style={{ marginTop: 12 }}>
                <button className="btn primary start-btn" onClick={start}><Icon name="navigate" />{'Start'}</button>
                {route.steps.length > 3 && <button className="btn" onClick={() => setShowSteps(!showSteps)} aria-expanded={showSteps}><Icon name="list" />{showSteps ? 'Fewer steps' : `All ${route.steps.length} steps`}</button>}
              </div>
              {route.steps.length > 0 && (
                <ol className="steps" aria-label="Step-by-step directions">
                  {(showSteps ? route.steps : route.steps.slice(0, 3)).map((st, i) => (
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
