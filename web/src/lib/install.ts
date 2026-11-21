import { K } from './keys';
// "Add to Home Screen" support. Chrome/Edge/Samsung/Android fire `beforeinstallprompt`;
// iOS Safari has no prompt API, so we show the Share → Add to Home Screen steps instead.
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIPEvent; emit(); });
addEventListener('appinstalled', () => { deferred = null; import('./track').then(m => m.track('install')).catch(() => {}); try { localStorage.setItem(K('installed'), '1'); } catch { /* ignore */ } emit(); });

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isIOSNonSafari = () => isIOS() && /crios|fxios|edgios|opt\//i.test(navigator.userAgent);
export const canPrompt = () => !!deferred;
/** Whether we can offer *some* way to install on this device. */
export const installAvailable = () => !isStandalone() && (canPrompt() || isIOS());

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const d = deferred; deferred = null; emit();
  await d.prompt();
  const r = await d.userChoice; return r.outcome;
}
export function onInstallChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
