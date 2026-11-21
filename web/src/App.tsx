import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { MapView, type MapApi } from './components/MapView';
import { Icon } from './components/Icon';
import { ExploreOverlay } from './screens/Explore';
import { NavigateOverlay } from './screens/Navigate';
import { db } from './lib/api';
import { track } from './lib/track';
import { K } from './lib/keys';
import { readLocalAudience } from './lib/audience';

// First run: ask who the person is before anything else (campus is chosen at the front door).
// Deep links (shared trips, password resets, places) are never interrupted.
function needsWelcome() {
  try { if (localStorage.getItem(K('welcome.seen')) || readLocalAudience()) return false; } catch { return false; }
  const h = location.hash; return !h || h === '#/' || h === '#/map';
}
if (needsWelcome()) history.replaceState(null, '', '#/welcome');

// Non-map screens are code-split so the map opens first.
const Fresher = lazy(() => import('./screens/Fresher').then(m => ({ default: m.FresherRoute })));
const Updates = lazy(() => import('./screens/Updates').then(m => ({ default: m.UpdatesRoute })));
const Exams = lazy(() => import('./screens/Exams').then(m => ({ default: m.Exams })));
const Follow = lazy(() => import('./screens/Follow').then(m => ({ default: m.FollowOverlay })));
const Gpa = lazy(() => import('./screens/Gpa').then(m => ({ default: m.Gpa })));
const MyDetails = lazy(() => import('./screens/Details').then(m => ({ default: m.MyDetails })));
const Assistant = lazy(() => import('./screens/Assistant').then(m => ({ default: m.Assistant })));
const Account = lazy(() => import('./screens/Account').then(m => ({ default: m.AccountRoute })));
const Admin = lazy(() => import('./screens/Admin').then(m => ({ default: m.Admin })));
const Schedule = lazy(() => import('./screens/Schedule').then(m => ({ default: m.Schedule })));
const Emergency = lazy(() => import('./screens/Emergency').then(m => ({ default: m.Emergency })));
const Shuttles = lazy(() => import('./screens/Shuttles').then(m => ({ default: m.Shuttles })));
const Welcome = lazy(() => import('./screens/Welcome').then(m => ({ default: m.Welcome })));

function useHash() {
  const [h, setH] = useState(location.hash || '#/map');
  useEffect(() => { const on = () => setH(location.hash || '#/map'); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
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
      } catch { /* best-effort */ }
    };
    run(); const t = setInterval(run, 5 * 60 * 1000); addEventListener('focus', run);
    return () => { stop = true; clearInterval(t); removeEventListener('focus', run); };
  }, [user, location.hash.startsWith('#/updates')]);
  return n;
}

const TABS: [string, string, string][] = [['map', 'Map', 'map'], ['schedule', 'Schedule', 'calendar'], ['guide', 'Guide', 'book'], ['updates', 'Updates', 'bell'], ['me', 'Me', 'user']];
const TAB_OF: Record<string, string> = {
  '': 'map', map: 'map', follow: 'map', explore: 'map', navigate: 'map', schedule: 'schedule', gpa: 'schedule', details: 'me', guide: 'guide', fresher: 'guide', assistant: 'guide', emergency: 'guide', shuttles: 'guide',
  updates: 'updates', welcome: 'guide', me: 'me', profile: 'me', login: 'me', register: 'me', 'forgot-password': 'me', 'reset-password': 'me', about: 'me', report: 'me', admin: 'me', appearance: 'me',
};

function Shell() {
  useEffect(() => { track('app_open'); }, []);
  const hash = useHash();
  const [path, qs] = hash.slice(1).split('?');
  const params = new URLSearchParams(qs || '');
  const seg = path.split('/').filter(Boolean);
  const top = seg[0] || 'map';
  const isMap = top === 'map' || top === 'explore' || top === 'navigate' || top === 'follow';
  const mapApi = useRef<MapApi | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const { toastMsg, navigating } = useStore();
  const unread = useUnreadCount();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  useEffect(() => { if (top === 'map' && params.get('cat')) setFilter(params.get('cat')); }, [hash]);
  useEffect(() => { if (!isMap) window.scrollTo(0, 0); document.querySelector('.screen')?.scrollTo(0, 0); }, [path]);
  const activeTab = TAB_OF[top] || 'me';

  let page: React.ReactNode = null;
  if (top === 'fresher') page = <Fresher seg={seg} />;
  else if (top === 'guide') page = <Fresher seg={['fresher']} />;
  else if (top === 'updates') page = <Updates seg={seg} />;
  else if (top === 'assistant') page = <Assistant />;
  else if (top === 'schedule' && seg[1] === 'exams') page = <Exams />;
  else if (top === 'schedule') page = <Schedule />;
  else if (top === 'gpa') page = <Gpa />;
  else if (top === 'details') page = <MyDetails />;
  else if (top === 'emergency') page = <Emergency />;
  else if (top === 'shuttles') page = <Shuttles />;
  else if (top === 'welcome') page = <Welcome />;
  else if (top === 'admin') page = <Admin tab={(seg[1] as any) || 'overview'} />;
  else if (!isMap) page = <Account top={top === 'profile' ? 'me' : top} params={params} />;

  return (
    <div className={`app ${isMap ? 'on-map' : ''}`}>
      {!online && <div className="offline-bar" role="status">Offline — saved screens work; maps, search, routes and AI need a connection.</div>}
      <MapView visible={isMap} apiRef={mapApi} filter={top === 'map' || top === 'explore' ? filter : null} />
      {(top === 'map' || top === 'explore') && <ExploreOverlay mapApi={mapApi} filter={filter} setFilter={setFilter} />}
      {top === 'navigate' && <NavigateOverlay mapApi={mapApi} />}
      {top === 'follow' && <Suspense fallback={null}><Follow mapApi={mapApi} token={seg[1] || ''} /></Suspense>}
      {page && <Suspense fallback={<div className="screen"><span className="spinner" /></div>}><div className="page" key={top}>{page}</div></Suspense>}
      {!(navigating && top === 'navigate') && top !== 'welcome' && (
        <nav className="bottom-nav glass" aria-label="Main">
          {TABS.map(([k, label, icon]) => (
            <a key={k} href={`#/${k}`} aria-current={activeTab === k ? 'page' : undefined}>
              <span className="nav-ic"><Icon name={icon} /></span><span>{label}</span>
              {k === 'updates' && unread > 0 && <span className="badge" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>}
            </a>
          ))}
        </nav>
      )}
      {!isMap && top !== 'assistant' && top !== 'welcome' && top !== 'admin' && !['login', 'register', 'forgot-password', 'reset-password'].includes(top) && (
        <a href="#/assistant" className="ai-fab" aria-label="Ask Campus AI"><Icon name="sparkle" /></a>
      )}
      {toastMsg && <div key={toastMsg.id} className={`toast glass ${toastMsg.kind}`} role="status">{toastMsg.msg}</div>}
    </div>
  );
}

export function App() { return <StoreProvider><Shell /></StoreProvider>; }
