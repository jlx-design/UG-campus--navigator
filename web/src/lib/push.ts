// Web Push: subscribe this device for class/exam reminders and announcements.
import { CONFIG } from '../config';
import { db } from './api';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOSBrowserTab = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as any).standalone;
const b64ToBytes = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null;
}
export async function enablePush(): Promise<'ok' | 'denied' | 'unsupported' | 'ios-install'> {
  if (!pushSupported()) return isIOSBrowserTab() ? 'ios-install' : 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.VAPID_PUBLIC_KEY) });
  const j = sub.toJSON() as any;
  await db('push_subscriptions', 'on_conflict=endpoint', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300) } });
  return 'ok';
}
export async function disablePush() {
  const sub = await currentSubscription(); if (!sub) return;
  await db('push_subscriptions', `endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
