import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { MapView, type MapApi } from './components/MapView';
import { Icon } from './components/Icon';
import { ExploreOverlay } from './screens/Explore';
import { NavigateOverlay } from './screens/Navigate';
import { db } from './lib/api';

// Non-map screens are code-split so the map opens first.
const Fresher = lazy(() => import('./screens/Fresher').then(m => ({ default: m.FresherRoute })));
const Updates = lazy(() => import('./screens/Updates').then(m => ({ default: m.UpdatesRoute })));
const Assistant = lazy(() => import('./screens/Assistant').then(m => ({ default: m.Assistant })));
const Account = lazy(() => import('./screens/Account').then(m => ({ default: m.AccountRoute })));
const Admin = lazy(() => import('./screens/Admin').then(m => ({ default: m.Admin })));

function useHash() {
  const [h, setH] = useState(location.hash || '#/explore');
  useEffect(() => { const on = () => setH(location.hash || '#/explore'); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  return h;
}

function useUnreadCount() {
  const { user } = useStore();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) { setN(0); return; }
    let stop = false;
    const run = async () => {
      try {
        const [prefs] = await db<any[]>('profiles', `select=notify_announcements&user_id=eq.${user.id}`);
        if (prefs && prefs.notify_announcements === false) { if (!stop) setN(0); return; }
        const [ann, reads] = await Promise.all([db<{ id: string }[]>('announcements', 'select=id&status=eq.published'), db<{ announcement_id: string }[]>('announcement_reads', 'select=announcement_id')]);
        const r = new Set(reads.map(x => x.announcement_id));
        if (!stop) setN(ann.filter(a => !r.has(a.id)).length);
      } catch { /* badge is best-effort */ }
    };
    run(); const t = setInterval(run, 5 * 60 * 1000); addEventListener('focus', run);
    return () => { stop = true; clearInterval(t); removeEventListener('focus', run); };
  }, [user, location.hash.startsWith('#/updates')]);
  return n;
}

function Shell() {
  const hash = useHash();
  const [path, qs] = hash.slice(1).split('?');
  const params = new URLSearchParams(qs || '');
  const seg = path.split('/').filter(Boolean);
  const top = seg[0] || 'explore';
  const isMap = top === 'explore' || top === 'navigate' || top === '';
  const mapApi = useRef<MapApi | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const { toastMsg, navigating } = useStore();
  const unread = useUnreadCount();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  useEffect(() => { if (!isMap) document.querySelector('.screen')?.scrollTo(0, 0); }, [path]);

  const tabs: [string, string, string][] = [['explore', 'Explore', 'map'], ['navigate', 'Navigate', 'navigate'], ['fresher', 'Fresher Hub', 'hub'], ['updates', 'Updates', 'bell'], ['profile', 'Profile', 'user']];
  const activeTab = ['login', 'register', 'forgot-password', 'reset-password', 'about', 'report', 'admin'].includes(top) ? 'profile' : top === 'assistant' ? 'fresher' : top;

  let page: React.ReactNode = null;
  if (top === 'fresher') page = <Fresher seg={seg} />;
  else if (top === 'updates') page = <Updates seg={seg} />;
  else if (top === 'assistant') page = <Assistant />;
  else if (top === 'admin') page = <Admin tab={(seg[1] as any) || 'locations'} />;
  else if (!isMap) page = <Account top={top} params={params} />;

  return (
    <div className="app">
      {!online && <div className="offline-bar" role="status">You’re offline. Saved app screens work; maps, search, routing and the assistant need a connection.</div>}
      <MapView visible={isMap} apiRef={mapApi} filter={top === 'explore' ? filter : null} />
      {top === 'explore' || top === '' ? <ExploreOverlay mapApi={mapApi} filter={filter} setFilter={setFilter} /> : null}
      {top === 'navigate' && <NavigateOverlay mapApi={mapApi} />}
      {page && <Suspense fallback={<div className="screen"><span className="spinner" /></div>}>{page}</Suspense>}
      {!(navigating && top === 'navigate') && (
        <nav className="bottom-nav glass" aria-label="Main">
          {tabs.map(([k, label, icon]) => (
            <a key={k} href={`#/${k}`} aria-current={activeTab === k ? 'page' : undefined}>
              <Icon name={icon} /><span>{label}</span>
              {k === 'updates' && unread > 0 && <span className="badge" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>}
            </a>
          ))}
        </nav>
      )}
      {!isMap && top !== 'assistant' && (
        <a href="#/assistant" className="fab glass" aria-label="Ask the assistant" style={{ position: 'fixed', zIndex: 980, right: 16, bottom: 'calc(var(--nav-h) + 26px + var(--safe-b))', textDecoration: 'none' }}><Icon name="chat" /></a>
      )}
      {toastMsg && <div className="toast glass" role="status" style={toastMsg.kind === 'error' ? { color: 'var(--danger)' } : undefined}>{toastMsg.msg}</div>}
    </div>
  );
}

export function App() { return <StoreProvider><Shell /></StoreProvider>; }
