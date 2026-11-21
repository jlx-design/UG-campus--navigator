// Privacy-safe usage counters: an event name plus, at most, the id of a real campus place.
// No user ids, no search text, no locations are sent. Failures are ignored.
import { rpc } from './api';
type Ev = 'app_open' | 'search' | 'place_view' | 'route' | 'nav_start' | 'nav_arrive' | 'ai_question' | 'install';
const recent = new Map<string, number>();
export function track(event: Ev, key = '') {
  const k = `${event}|${key}`; const now = Date.now();
  if (now - (recent.get(k) || 0) < 60_000) return; // de-duplicate bursts
  recent.set(k, now);
  rpc('bump', { p_event: event, p_key: key }).catch(() => {});
}
