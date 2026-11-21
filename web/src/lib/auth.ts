// Authentication via the app's own server function (which talks to Neon Auth server-side).
// No third-party cookies are involved, so it works in Safari, Brave and installed PWAs alike.
// The opaque session string is kept in localStorage and exchanged for short-lived JWTs.
import { CONFIG } from '../config';
import type { SessionUser } from './types';

const SESSION_KEY = 'ugnav.session.v2';
export type Role = 'user' | 'editor' | 'admin' | 'driver';
interface Bundle { session: string; jwt: string | null; role: Role; user: SessionUser }

let session: string | null = read();
let jwt: { token: string; exp: number } | null = null;
let currentUser: SessionUser | null = null;
let currentRole: Role = 'user';
let anon: { token: string; exp: number } | null = null;
const listeners = new Set<(u: SessionUser | null, r: Role) => void>();

function read() { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } }
function write(v: string | null) { try { v ? localStorage.setItem(SESSION_KEY, v) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ } }
const expOf = (t: string) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return Date.now() + 4 * 60_000; } };

export class AuthError extends Error { constructor(message: string, public code = 'auth_error') { super(message); } }

async function call<T = any>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CONFIG.API_URL}/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  } catch { throw new AuthError('Could not reach the server. Check your connection and try again.', 'network'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(data?.error?.message || 'Something went wrong. Please try again.', data?.error?.code || 'auth_error');
  return data as T;
}

function apply(b: Bundle | null) {
  if (b) {
    session = b.session; write(b.session);
    jwt = b.jwt ? { token: b.jwt, exp: expOf(b.jwt) } : null;
    currentUser = b.user; currentRole = b.role;
  } else { session = null; write(null); jwt = null; currentUser = null; currentRole = 'user'; }
  listeners.forEach(l => l(currentUser, currentRole));
}

export const onAuthChange = (fn: (u: SessionUser | null, r: Role) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getUser = () => currentUser;
export const getRole = () => currentRole;

let refreshing: Promise<SessionUser | null> | null = null;
export function loadSession(): Promise<SessionUser | null> {
  if (!session) { apply(null); return Promise.resolve(null); }
  refreshing ??= call<Bundle>('session', { session })
    .then(b => { apply(b); return b.user; })
    .catch((e: AuthError) => { if (e.code !== 'network') apply(null); else listeners.forEach(l => l(currentUser, currentRole)); return currentUser; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** Bearer token for the Data API: the user's JWT when signed in, otherwise a guest (anonymous-role) token. */
export async function getToken(): Promise<string | null> {
  if (session) {
    if (jwt && jwt.exp - Date.now() > 60_000) return jwt.token;
    await loadSession();
    if (jwt) return jwt.token;
  }
  if (anon && anon.exp - Date.now() > 60_000) return anon.token;
  try {
    const r = await fetch(`${CONFIG.API_URL}/auth/anonymous-token`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const d = await r.json(); anon = { token: d.token, exp: d.exp || expOf(d.token) };
    return anon.token;
  } catch { return null; }
}
export const getJwt = getToken;

export type SignResult = { ok: true } | { verify: string };
export async function signUp(name: string, email: string, password: string): Promise<SignResult> {
  const r = await call<any>('sign-up', { name, email, password });
  if (r.pending_verification) return { verify: r.email || email };
  apply(r); return { ok: true };
}
export async function signIn(email: string, password: string): Promise<SignResult> {
  try { const r = await call<any>('sign-in', { email, password }); if (r.pending_verification) return { verify: email }; apply(r); return { ok: true }; }
  catch (e: any) { if (e.code === 'EMAIL_NOT_VERIFIED') return { verify: email }; throw e; }
}
/** Returns true when verified and signed in; false when verified but a fresh sign-in is needed. */
export async function verifyEmail(email: string, code: string) {
  const r = await call<any>('verify-email', { email, code });
  if (r.session) { apply(r); return true; }
  return false;
}
export const resendCode = (email: string) => call('resend-code', { email });
export async function signOut() { const s = session; apply(null); if (s) await call('sign-out', { session: s }).catch(() => {}); }
export const requestPasswordReset = (email: string) => call('forgot-password', { email, redirectTo: location.origin + location.pathname + '#/reset-password' });
export const resetPassword = (token: string, newPassword: string) => call('reset-password', { token, newPassword });
export async function deleteAccount(password: string) { await call('delete-account', { session, password }); apply(null); }
