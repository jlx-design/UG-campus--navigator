import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { db } from './lib/api';
import { loadSession, onAuthChange } from './lib/auth';
import type { Category, Location, RouteResult, SessionUser } from './lib/types';
import type { LatLng } from './lib/geo';

export type GeoState =
  | { status: 'idle' } | { status: 'requesting' }
  | { status: 'ok'; pos: LatLng; accuracy: number; at: number; heading: number | null }
  | { status: 'denied' } | { status: 'unavailable'; message: string };


interface Store {
  user: SessionUser | null; role: 'user' | 'editor' | 'admin'; authReady: boolean;
  locations: Location[]; categories: Category[]; locState: 'loading' | 'ready' | 'error'; locError: string | null; reloadLocations: () => void;
  byId: Map<string, Location>;
  selectedId: string | null; select: (id: string | null) => void;
  geo: GeoState; startGeo: () => void; stopGeo: () => void;
  route: RouteResult | null; setRoute: (r: RouteResult | null) => void;
  destId: string | null; setDestId: (id: string | null) => void;
  origin: { kind: 'gps' } | { kind: 'point'; pos: LatLng }; setOrigin: (o: { kind: 'gps' } | { kind: 'point'; pos: LatLng }) => void;
  pickingOrigin: boolean; setPickingOrigin: (b: boolean) => void;
  navigating: boolean; setNavigating: (b: boolean) => void;
  saved: Set<string>; toggleSaved: (id: string) => Promise<void>; savedReady: boolean;
  toast: (msg: string, kind?: 'ok' | 'error') => void; toastMsg: { msg: string; kind: string } | null;
  theme: 'light' | 'dark' | 'system'; setTheme: (t: 'light' | 'dark' | 'system') => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('store missing'); return s; };

const GUEST_SAVED_KEY = 'ugnav.guest_saved';
const THEME_KEY = 'ugnav.theme';
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } };

export function applyTheme(t: 'light' | 'dark' | 'system') {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1220' : '#0b2a5b');
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<'user' | 'editor' | 'admin'>('user');
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locState, setLocState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [locError, setLocError] = useState<string | null>(null);
  const [selectedId, select] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' });
  const watchRef = useRef<number | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<{ kind: 'gps' } | { kind: 'point'; pos: LatLng }>({ kind: 'gps' });
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [savedReady, setSavedReady] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: string } | null>(null);
  const toastTimer = useRef<number>();
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>((readLS(THEME_KEY) as any) || 'system');

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    setToastMsg({ msg, kind }); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3500);
  }, []);

  // Theme
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, [theme]);
  const setTheme = useCallback((t: 'light' | 'dark' | 'system') => {
    setThemeState(t); writeLS(THEME_KEY, t);
    if (user) db('profiles', `user_id=eq.${user.id}`, { method: 'PATCH', body: { theme: t }, prefer: 'return=minimal' }).catch(() => {});
  }, [user]);

  // Auth
  useEffect(() => {
    const off = onAuthChange(setUser);
    loadSession().finally(() => setAuthReady(true));
    return off;
  }, []);

  // Role + profile bootstrap + saved places
  useEffect(() => {
    let cancelled = false;
    setSavedReady(false);
    if (!user) {
      setRole('user');
      try { setSaved(new Set(JSON.parse(readLS(GUEST_SAVED_KEY) || '[]'))); } catch { setSaved(new Set()); }
      setSavedReady(true);
      return;
    }
    (async () => {
      try {
        const [r] = await db<{ role: string }[]>('app_roles', `select=role&user_id=eq.${user.id}`);
        if (!cancelled) setRole((r?.role as any) || 'user');
      } catch { if (!cancelled) setRole('user'); }
      try {
        const prof = await db<any[]>('profiles', `select=theme&user_id=eq.${user.id}`);
        if (!prof.length) await db('profiles', '', { method: 'POST', body: { display_name: user.name?.slice(0, 80) || null, theme }, prefer: 'return=minimal' });
        else if (prof[0].theme && !readLS(THEME_KEY)) setThemeState(prof[0].theme);
      } catch { /* profile is optional for core features */ }
      try {
        const rows = await db<{ location_id: string }[]>('saved_places', 'select=location_id');
        if (!cancelled) setSaved(new Set(rows.map(r => r.location_id)));
      } catch { if (!cancelled) setSaved(new Set()); }
      if (!cancelled) setSavedReady(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const toggleSaved = useCallback(async (id: string) => {
    const has = saved.has(id);
    if (!user) {
      const next = new Set(saved); has ? next.delete(id) : next.add(id);
      setSaved(next); writeLS(GUEST_SAVED_KEY, JSON.stringify([...next]));
      toast(has ? 'Removed from this device' : 'Saved on this device only — sign in to sync');
      return;
    }
    try {
      if (has) await db('saved_places', `location_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
      else await db('saved_places', '', { method: 'POST', body: { location_id: id }, prefer: 'return=minimal' });
      const next = new Set(saved); has ? next.delete(id) : next.add(id); setSaved(next);
      toast(has ? 'Removed from saved places' : 'Saved to your account');
    } catch (e: any) { toast(e.message || 'Could not update saved places', 'error'); }
  }, [saved, user, toast]);

  // Locations (single source of truth for map, search, assistant actions, hub links)
  const reloadLocations = useCallback(() => {
    setLocState('loading'); setLocError(null);
    Promise.all([
      db<Location[]>('locations', 'select=id,name,category,description,lat,lng,location_context,alt_names,accessibility,source_label,source_url,verification,last_verified_at,is_published,updated_at&is_published=eq.true&order=name.asc&limit=2000'),
      db<Category[]>('location_categories', 'select=*&order=sort_order.asc'),
    ]).then(([l, c]) => { setLocations(l); setCategories(c); setLocState('ready'); })
      .catch(e => { setLocState('error'); setLocError(e.message); });
  }, []);
  useEffect(() => { reloadLocations(); }, [reloadLocations, role]);
  const byId = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);

  // Geolocation — only started when a location-dependent feature needs it.
  const startGeo = useCallback(() => {
    if (!('geolocation' in navigator)) { setGeo({ status: 'unavailable', message: 'This browser does not support location.' }); return; }
    if (watchRef.current !== null) return;
    setGeo(g => (g.status === 'ok' ? g : { status: 'requesting' }));
    watchRef.current = navigator.geolocation.watchPosition(
      p => setGeo({ status: 'ok', pos: [p.coords.latitude, p.coords.longitude], accuracy: p.coords.accuracy, at: p.timestamp, heading: p.coords.heading ?? null }),
      err => {
        if (err.code === err.PERMISSION_DENIED) { setGeo({ status: 'denied' }); if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
        else setGeo(g => (g.status === 'ok' ? g : { status: 'unavailable', message: err.code === err.TIMEOUT ? 'Getting your location is taking too long. Move to an open area and try again.' : 'Your location is unavailable right now.' }));
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
  }, []);
  const stopGeo = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);

  const value: Store = {
    user, role, authReady, locations, categories, locState, locError, reloadLocations, byId,
    selectedId, select, geo, startGeo, stopGeo, route, setRoute, destId, setDestId, origin, setOrigin,
    pickingOrigin, setPickingOrigin, navigating, setNavigating, saved, toggleSaved, savedReady, toast, toastMsg, theme, setTheme,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
