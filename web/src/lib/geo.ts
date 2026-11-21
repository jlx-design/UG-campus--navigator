import { SERVICE_AREA } from '../config';

export type LatLng = [number, number];
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Project p onto segment ab in a local equirectangular frame; returns distance (m) and t∈[0,1]. */
function toSegment(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos(rad(p[0]));
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const proj: LatLng = [ay + t * dy, (ax + t * dx) / k];
  return { dist: haversine(p, proj), t, proj };
}

/** Nearest point on the route polyline: distance off-route, segment index and metres travelled along it. */
export function snapToRoute(p: LatLng, line: LatLng[]) {
  let best = { dist: Infinity, index: 0, t: 0, proj: line[0] as LatLng };
  for (let i = 0; i < line.length - 1; i++) {
    const s = toSegment(p, line[i], line[i + 1]);
    if (s.dist < best.dist) best = { dist: s.dist, index: i, t: s.t, proj: s.proj };
  }
  let along = 0;
  for (let i = 0; i < best.index; i++) along += haversine(line[i], line[i + 1]);
  if (line.length > 1) along += best.t * haversine(line[best.index], line[best.index + 1]);
  return { offRouteM: best.dist, segmentIndex: best.index, alongM: along, point: best.proj };
}

export function cumulative(line: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + haversine(line[i - 1], line[i]));
  return out;
}

export const inServiceArea = ([lat, lng]: LatLng) =>
  lat >= SERVICE_AREA.minLat && lat <= SERVICE_AREA.maxLat && lng >= SERVICE_AREA.minLng && lng <= SERVICE_AREA.maxLng;

export function fmtDistance(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.max(5, Math.round(m / 5) * 5)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
export function fmtDuration(s: number): string {
  if (!Number.isFinite(s)) return '—';
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return 'Unknown date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

/** Initial compass bearing from a to b, in degrees (0 = north). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Direction of travel along the route ~25 m ahead of the snapped point (smoother than one tiny segment). */
export function routeBearingAhead(line: LatLng[], segIdx: number, from: LatLng): number {
  let j = segIdx + 1, acc = 0, prev = from;
  while (j < line.length - 1 && acc + haversine(prev, line[j]) < 25) { acc += haversine(prev, line[j]); prev = line[j]; j++; }
  return bearing(from, line[Math.min(j, line.length - 1)]);
}

/** Spoken distance, rounded the way people say it. */
export function spokenDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace(/\.0$/, '')} kilometres`;
  const r = m > 200 ? Math.round(m / 50) * 50 : m > 50 ? Math.round(m / 10) * 10 : Math.max(5, Math.round(m / 5) * 5);
  return `${r} metres`;
}
