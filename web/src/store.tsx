import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { db } from './lib/api';
import { loadSession, onAuthChange, getRole, type Role } from './lib/auth';
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from './theme';
import type { Category, Location, RouteResult, SessionUser } from './lib/types';
import type { LatLng } from './lib/geo';

export type GeoState =
  | { status: 'idle' } | { status: 'requesting' }
  | { status: 'ok'; pos: LatLng; accuracy: number; at: number; heading: number | null }
  | { status: 'denied' } | { status: 'unavailable'; message: string };
export type Origin = { kind: 'gps' } | { kind: 'point'; pos: LatLng };
export interface ShuttlePos { vehicle_id: string; route_id: string | null; lat: number; lng: number; heading: number | null; updated_at: string }
export interface ShuttleRoute { id: string; name: string; color: string; description: string | null; hours: string | null }

interface Store {
  user: SessionUser | null; role: Role; authReady: boolean;
  locations: Location[]; categories: Category[]; locState: 'loading' | 'ready' | 'error'; locError: string | null; reloadLocations: () => void;
  byId: Map<string, Location>;
  selectedId: string | null; select: (id: string | null) => void;
  geo: GeoState; startGeo: () => void; stopGeo: () => void;
  route: RouteResult | null; setRoute: (r: RouteResult | null) => void;
  destId: string | null; setDestId: (id: string | null) => void;
  origin: Origin; setOrigin: (o: Origin) => void;
  pickingOrigin: boolean; setPickingOrigin: (b: boolean) => void;
  navigating: boolean; setNavigating: (b: boolean) => void;
  saved: Set<string>; toggleSaved: (id: string) => Promise<void>;
  shuttles: ShuttlePos[]; shuttleRoutes: ShuttleRoute[]; showShuttles: boolean; setShowShuttles: (b: boolean) => void;
  toast: (msg: string, kind?: 'ok' | 'error') => void; toastMsg: { msg: string; kind: string; id: number } | null;
  prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void;
  goDirections: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('store missing'); return s; };

const GUEST_SAVED_KEY = 'ugnav.guest_saved';
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<Role>('user');
  const [authReady, setAuthReady] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locState, setLocState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [locError, setLocError] = useState<string | null>(null);
  const [selectedId, select] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' });
  const watchRef = useRef<number | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin>({ kind: 'gps' });
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [shuttles, setShuttles] = useState<ShuttlePos[]>([]);
  const [shuttleRoutes, setShuttleRoutes] = useState<ShuttleRoute[]>([]);
  const [showShuttles, setShowShuttles] = useState(true);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: string; id: number } | null>(null);
  const toastTimer = useRef<number>();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    setToastMsg({ msg, kind, id: Date.now() }); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3600);
  }, []);

  // ── Appearance ──
  useEffect(() => {
    applyPrefs(prefs);
    if (prefs.mode !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyPrefs(prefs);
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, [prefs]);
  const syncTimer = useRef<number>();
  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState(prev => {
      const next = { ...prev, ...patch }; savePrefs(next);
      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        if (user) db('profiles', `user_id=eq.${user.id}`, { method: 'PATCH', body: { prefs: next, theme: next.mode === 'amoled' ? 'dark' : next.mode }, prefer: 'return=minimal' }).catch(() => {});
      }, 600);
      return next;
    });
  }, [user]);

  // ── Auth ──
  useEffect(() => {
    const off = onAuthChange((u, r) => { setUser(u); setRole(r); });
    loadSession().finally(() => { setRole(getRole()); setAuthReady(true); });
    const onFocus = () => { if (document.visibilityState === 'visible') loadSession(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { off(); document.removeEventListener('visibilitychange', onFocus); };
  }, []);

  // ── Profile bootstrap, synced prefs, saved places ──
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      try { setSaved(new Set(JSON.parse(readLS(GUEST_SAVED_KEY) || '[]'))); } catch { setSaved(new Set()); }
      return;
    }
    (async () => {
      try {
        const prof = await db<any[]>('profiles', `select=prefs&user_id=eq.${user.id}`);
        if (!prof.length) await db('profiles', '', { method: 'POST', body: { display_name: user.name?.slice(0, 80) || null, prefs }, prefer: 'return=minimal' });
        else if (prof[0].prefs && Object.keys(prof[0].prefs).length && !cancelled) { const p = { ...loadPrefs(), ...prof[0].prefs }; savePrefs(p); setPrefsState(p); }
      } catch { /* profile optional */ }
      try {
        const rows = await db<{ location_id: string }[]>('saved_places', 'select=location_id');
        if (!cancelled) {
          // Move any device-only favourites into the account once.
          const local: string[] = JSON.parse(readLS(GUEST_SAVED_KEY) || '[]');
          const have = new Set(rows.map(r => r.location_id));
          const toAdd = local.filter(id => !have.has(id));
          if (toAdd.length) { await db('saved_places', 'on_conflict=user_id,location_id', { method: 'POST', body: toAdd.map(location_id => ({ location_id })), prefer: 'resolution=ignore-duplicates,return=minimal' }).catch(() => {}); writeLS(GUEST_SAVED_KEY, '[]'); toAdd.forEach(id => have.add(id)); }
          setSaved(have);
        }
      } catch { if (!cancelled) setSaved(new Set()); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const toggleSaved = useCallback(async (id: string) => {
    const has = saved.has(id);
    const next = new Set(saved); has ? next.delete(id) : next.add(id);
    if (!user) { setSaved(next); writeLS(GUEST_SAVED_KEY, JSON.stringify([...next])); toast(has ? 'Removed' : 'Saved on this device · sign in to sync'); return; }
    try {
      if (has) await db('saved_places', `location_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
      else await db('saved_places', '', { method: 'POST', body: { location_id: id }, prefer: 'return=minimal' });
      setSaved(next); toast(has ? 'Removed from saved places' : 'Saved to your account');
    } catch (e: any) { toast(e.message || 'Could not update saved places', 'error'); }
  }, [saved, user, toast]);

  // ── Campus directory (single source for map, search, assistant, guide, timetable venues) ──
  const reloadLocations = useCallback(() => {
    setLocState('loading'); setLocError(null);
    Promise.all([
      db<Location[]>('locations', 'select=id,name,category,description,lat,lng,location_context,alt_names,accessibility,source_label,source_url,verification,last_verified_at,is_published,updated_at&is_published=eq.true&order=name.asc&limit=3000'),
      db<Category[]>('location_categories', 'select=*&order=sort_order.asc'),
    ]).then(([l, c]) => { setLocations(l); setCategories(c); setLocState('ready'); })
      .catch(e => { setLocState('error'); setLocError(e.message); });
  }, []);
  useEffect(() => { reloadLocations(); }, [reloadLocations, role]);
  const byId = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);

  // ── Live shuttles: poll every 10 s while the page is visible ──
  useEffect(() => {
    db<ShuttleRoute[]>('shuttle_routes', 'select=id,name,color,description,hours&is_active=eq.true&order=name.asc').then(setShuttleRoutes).catch(() => {});
    let t: number | undefined; let stop = false;
    const poll = async () => {
      if (document.visibilityState === 'visible') {
        try { const rows = await db<ShuttlePos[]>('shuttle_positions', 'select=vehicle_id,route_id,lat,lng,heading,updated_at'); if (!stop) setShuttles(rows); } catch { /* keep last */ }
      }
      if (!stop) t = window.setTimeout(poll, 10000);
    };
    poll();
    return () => { stop = true; window.clearTimeout(t); };
  }, []);

  // ── Geolocation (only when a feature needs it) ──
  const startGeo = useCallback(() => {
    if (!('geolocation' in navigator)) { setGeo({ status: 'unavailable', message: 'This browser does not support location.' }); return; }
    if (watchRef.current !== null) return;
    setGeo(g => (g.status === 'ok' ? g : { status: 'requesting' }));
    watchRef.current = navigator.geolocation.watchPosition(
      p => setGeo({ status: 'ok', pos: [p.coords.latitude, p.coords.longitude], accuracy: p.coords.accuracy, at: p.timestamp, heading: p.coords.heading ?? null }),
      err => {
        if (err.code === err.PERMISSION_DENIED) { setGeo({ status: 'denied' }); if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
        else setGeo(g => (g.status === 'ok' ? g : { status: 'unavailable', message: err.code === err.TIMEOUT ? 'Finding your location is taking long. Move to an open area and try again.' : 'Your location is unavailable right now.' }));
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
  }, []);
  const stopGeo = useCallback(() => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }, []);

  const goDirections = useCallback((id: string) => { setRoute(null); setNavigating(false); setDestId(id); select(id); location.hash = '#/navigate'; }, []);

  const value: Store = {
    user, role, authReady, locations, categories, locState, locError, reloadLocations, byId,
    selectedId, select, geo, startGeo, stopGeo, route, setRoute, destId, setDestId, origin, setOrigin,
    pickingOrigin, setPickingOrigin, navigating, setNavigating, saved, toggleSaved,
    shuttles, shuttleRoutes, showShuttles, setShowShuttles, toast, toastMsg, prefs, setPrefs, goDirections,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
