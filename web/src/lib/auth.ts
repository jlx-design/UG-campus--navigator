// Neon Auth (Managed Better Auth) client over its REST endpoints.
// Session = Better Auth session (cookie, plus bearer token where the server supports it).
// Data API / server function calls use a short-lived JWT obtained from the session.
import { CONFIG } from '../config';
import type { SessionUser } from './types';

const TOKEN_KEY = 'ugnav.session_token';
let jwt: { token: string; exp: number } | null = null;
let currentUser: SessionUser | null = null;
const listeners = new Set<(u: SessionUser | null) => void>();

function sessionToken(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setSessionToken(t: string | null) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } }

export class AuthError extends Error { constructor(message: string, public code = 'auth_error') { super(message); } }

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const st = sessionToken();
  if (st) headers.set('Authorization', `Bearer ${st}`);
  try {
    return await fetch(`${CONFIG.AUTH_URL}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new AuthError('Could not reach the sign-in service. Check your connection and try again.', 'network');
  }
}

async function errorFrom(res: Response, fallback: string): Promise<AuthError> {
  const body = await res.json().catch(() => ({}));
  const code = body?.code || 'auth_error';
  const friendly: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: 'That email and password do not match an account.',
    USER_ALREADY_EXISTS: 'An account with this email already exists. Try signing in.',
    PASSWORD_TOO_SHORT: 'Password is too short (use at least 8 characters).',
    EMAIL_NOT_VERIFIED: 'Please verify your email address first — check your inbox.',
    INVALID_TOKEN: 'This link is invalid or has expired. Request a new one.',
  };
  return new AuthError(friendly[code] || body?.message || fallback, code);
}

function emit(u: SessionUser | null) { currentUser = u; listeners.forEach(l => l(u)); }
export function onAuthChange(fn: (u: SessionUser | null) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export const getUser = () => currentUser;

export async function loadSession(): Promise<SessionUser | null> {
  try {
    const res = await call('/get-session', { method: 'GET' });
    if (!res.ok) { emit(null); return null; }
    const hdr = res.headers.get('set-auth-jwt');
    if (hdr) jwt = { token: hdr, exp: decodeExp(hdr) };
    const body = await res.json().catch(() => null);
    const u = body?.user ? { id: body.user.id, email: body.user.email, name: body.user.name, emailVerified: !!body.user.emailVerified } : null;
    if (!u) jwt = null;
    emit(u);
    return u;
  } catch { emit(currentUser); return currentUser; }
}

function decodeExp(token: string): number {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return Date.now() + 5 * 60_000; }
}

/** JWT for the Data API / server function; null for guests. */
export async function getJwt(): Promise<string | null> {
  if (!currentUser) return null;
  if (jwt && jwt.exp - Date.now() > 60_000) return jwt.token;
  const res = await call('/token', { method: 'GET' }).catch(() => null);
  if (res?.ok) {
    const body = await res.json().catch(() => ({}));
    if (body?.token) { jwt = { token: body.token, exp: decodeExp(body.token) }; return jwt.token; }
  }
  await loadSession();
  return jwt?.token ?? null;
}

export async function signUp(name: string, email: string, password: string) {
  const res = await call('/sign-up/email', { method: 'POST', body: JSON.stringify({ name, email, password, callbackURL: location.origin + location.pathname + '#/profile' }) });
  if (!res.ok) throw await errorFrom(res, 'Could not create the account.');
  const body = await res.json().catch(() => ({}));
  if (body?.token) setSessionToken(body.token);
  return loadSession();
}

export async function signIn(email: string, password: string) {
  const res = await call('/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!res.ok) throw await errorFrom(res, 'Could not sign in.');
  const body = await res.json().catch(() => ({}));
  if (body?.token) setSessionToken(body.token);
  const u = await loadSession();
  if (!u) throw new AuthError('Signed in, but this browser blocked the session. Allow cookies for this site and try again.', 'session_blocked');
  return u;
}

export async function signOut() {
  await call('/sign-out', { method: 'POST', body: '{}' }).catch(() => null);
  setSessionToken(null); jwt = null; emit(null);
}

export async function requestPasswordReset(email: string) {
  const redirectTo = location.origin + location.pathname + '#/reset-password';
  let res = await call('/request-password-reset', { method: 'POST', body: JSON.stringify({ email, redirectTo }) });
  if (res.status === 404) res = await call('/forget-password', { method: 'POST', body: JSON.stringify({ email, redirectTo }) });
  if (!res.ok) throw await errorFrom(res, 'Could not send the reset email.');
}

export async function resetPassword(token: string, newPassword: string) {
  const res = await call('/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
  if (!res.ok) throw await errorFrom(res, 'Could not reset the password.');
}

export async function deleteAccount(password: string) {
  const res = await call('/delete-user', { method: 'POST', body: JSON.stringify({ password }) });
  if (!res.ok) throw await errorFrom(res, 'Account deletion is not available right now.');
  setSessionToken(null); jwt = null; emit(null);
}
