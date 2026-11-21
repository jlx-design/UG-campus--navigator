// Usage counters for the admin analytics dashboard.
// Sent: an event name; at most the id of a real campus place; a random install id (made on this device,
// not derived from anything about the person); the platform family; and whether the app is installed.
// When signed in, the server links the install id to the account so admins can count active users.
// Never sent: search text, location, names, student details. Failures are ignored.
import { rpc } from './api';
import { K } from './keys';

export type Ev = 'app_open' | 'search' | 'place_view' | 'route' | 'nav_start' | 'nav_arrive' | 'ai_question' | 'install'
  | 'sign_up' | 'sign_in' | 'course_add' | 'class_add' | 'exam_add' | 'gpa_add' | 'reminder_on' | 'share_trip'
  | 'offline_download' | 'event_view' | 'emergency_call' | 'details_saved' | 'onboard_fresher' | 'onboard_continuing'
  | 'onboard_staff' | 'onboard_visitor' | 'room_found' | 'guide_view' | 'checklist_done';

function deviceId(): string | null {
  try {
    let id = localStorage.getItem(K('device'));
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      id = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(K('device'), id);
    }
    return id;
  } catch { return null; }
}

function platform(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/macintosh/i.test(ua)) return 'mac';
  if (/linux|cros/i.test(ua)) return 'linux';
  return 'other';
}

const standalone = () => matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

const recent = new Map<string, number>();
export function track(event: Ev, key = '') {
  const k = `${event}|${key}`; const now = Date.now();
  if (now - (recent.get(k) || 0) < 60_000) return; // de-duplicate bursts
  recent.set(k, now);
  rpc('bump', { p_event: event, p_key: key, p_device: deviceId(), p_platform: platform(), p_standalone: standalone() }).catch(() => {});
}
