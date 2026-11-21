// Data access: Neon Data API (PostgREST-compatible, RLS-enforced) + the server function.
import { CONFIG } from '../config';
import { CAMPUS } from '../config';
import { getJwt } from './auth';
import type { AssistantReply, RouteResult } from './types';

export class ApiError extends Error { constructor(message: string, public status = 0, public code = 'error') { super(message); } }

async function headers(extra?: Record<string, string>) {
  const h: Record<string, string> = { Accept: 'application/json', ...extra };
  const t = await getJwt().catch(() => null);
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function friendly(status: number, body: any): string {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403 || body?.code === '42501') return 'You do not have permission to do that.';
  if (body?.code === '23505') return 'That item already exists.';
  if (body?.code === '23514') return 'Some values are not allowed. Please check the form.';
  return body?.message || `Request failed (${status}).`;
}

/** db('locations', 'select=*&is_published=eq.true') */
export async function db<T = any>(table: string, query = '', init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const method = init.method || 'GET';
  const h = await headers({ ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(init.prefer ? { Prefer: init.prefer } : method !== 'GET' ? { Prefer: 'return=representation' } : {}) });
  let res: Response;
  try {
    res = await fetch(`${CONFIG.DATA_API_URL}/${table}${query ? '?' + query : ''}`, { method, headers: h, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  } catch { throw new ApiError('Network unavailable. Check your connection and try again.', 0, 'network'); }
  if (res.status === 204) return [] as unknown as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(friendly(res.status, body), res.status, body?.code);
  return body as T;
}

export const rpc = <T = any>(fn: string, args: Record<string, unknown>) => db<T>(`rpc/${fn}`, '', { method: 'POST', body: args, prefer: 'return=representation' });

export async function fn<T>(path: string, body: unknown, timeoutMs = 20000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CONFIG.API_URL}${path}`, { method: 'POST', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e: any) {
    throw new ApiError(e?.name === 'TimeoutError' ? 'The server took too long to respond. Please try again.' : 'Network unavailable. Check your connection and try again.', 0, 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.message || `Server error (${res.status}).`, res.status, data?.error?.code);
  return data as T;
}

export const getRoute = (from: [number, number], to: [number, number]) => fn<RouteResult>('/route', { from, to });
export const askAssistant = (messages: { role: string; content: string }[]) => fn<AssistantReply>('/assistant', { messages }, 50000);
const OVERPASS_QUERY = `[out:json][timeout:120];
area["amenity"="university"]["name"~"${CAMPUS.osmName}",i]->.ug;
nwr(area.ug)["name"];
out center tags;`;

/** Admin-only: the browser fetches named campus features from Overpass, the server validates and upserts them. */
export async function importOsm() {
  let data: any = null; let lastErr = '';
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: OVERPASS_QUERY }), signal: AbortSignal.timeout(130000) });
      if (r.ok) { data = await r.json(); break; }
      lastErr = `Overpass returned ${r.status}`;
    } catch (e: any) { lastErr = e?.message || 'Overpass unreachable'; }
  }
  if (!data) throw new ApiError(`Could not download OpenStreetMap data (${lastErr}). Try again later.`, 0, 'overpass');
  const keep = ['name', 'alt_name', 'short_name', 'old_name', 'official_name', 'description', 'building', 'amenity', 'leisure', 'office', 'shop', 'healthcare', 'tourism', 'barrier', 'highway', 'public_transport'];
  const elements = (data.elements || []).filter((e: any) => e.tags?.name).map((e: any) => ({
    type: e.type, id: e.id, lat: e.lat, lon: e.lon, center: e.center,
    tags: Object.fromEntries(keep.filter(k => e.tags[k] !== undefined).map(k => [k, e.tags[k]])),
  }));
  return fn<{ inserted: number; updated: number; skipped: number; osm_timestamp?: string }>('/admin/import-osm', { elements, osm_timestamp: data.osm3s?.timestamp_osm_base }, 120000);
}

export async function apiHealth(): Promise<Record<string, string> | null> {
  try { const r = await fetch(`${CONFIG.API_URL}/health`, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch { return null; }
}

export const enc = encodeURIComponent;
