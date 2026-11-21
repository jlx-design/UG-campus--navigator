// "Download campus map": pre-fetch the vector tiles, style, sprites and fonts covering the campus
// so the map works without data. The service worker serves them cache-first afterwards.
import { CONFIG, CAMPUS_BOUNDS } from '../config';
const CACHE = 'ugnav-map-v1';
const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };

export async function offlineStatus(): Promise<{ count: number; at: string | null }> {
  if (!('caches' in window)) return { count: 0, at: null };
  const c = await caches.open(CACHE); const keys = await c.keys();
  return { count: keys.length, at: localStorage.getItem('ugnav.offline.at') };
}
export async function clearOffline() { await caches.delete(CACHE); localStorage.removeItem('ugnav.offline.at'); }

export async function downloadCampusMap(onProgress: (done: number, total: number) => void) {
  if (!('caches' in window)) throw new Error('This browser cannot store maps offline.');
  const c = await caches.open(CACHE);
  const urls = new Set<string>();
  for (const styleUrl of [CONFIG.STYLE_STREETS, CONFIG.STYLE_DARK]) {
    const style = await (await fetch(styleUrl)).json(); urls.add(styleUrl);
    if (typeof style.sprite === 'string') for (const s of ['', '@2x']) for (const ext of ['.json', '.png']) urls.add(style.sprite + s + ext);
    const fonts = new Set<string>();
    for (const l of style.layers || []) { const f = l.layout?.['text-font']; if (Array.isArray(f) && f.every((x: unknown) => typeof x === 'string')) fonts.add(f.join(',')); }
    if (style.glyphs) for (const f of fonts) for (const r of ['0-255', '256-511', '8192-8447']) urls.add(style.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', r));
    for (const src of Object.values<any>(style.sources || {})) {
      if (src.type !== 'vector' || !src.url) continue;
      const tj = await (await fetch(src.url)).json(); urls.add(src.url);
      const maxz = Math.min(tj.maxzoom ?? 14, 16);
      const [[w, s], [e, n]] = CAMPUS_BOUNDS;
      for (let z = 10; z <= maxz; z++)
        for (let x = lon2x(w, z); x <= lon2x(e, z); x++)
          for (let y = lat2y(n, z); y <= lat2y(s, z); y++)
            for (const t of tj.tiles || []) urls.add(t.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    }
  }
  const list = [...urls]; let done = 0, failed = 0;
  const worker = async () => { while (list.length) { const u = list.pop()!; try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); else failed++; } } catch { failed++; } onProgress(++done, urls.size); } };
  await Promise.all(Array.from({ length: 6 }, worker));
  localStorage.setItem('ugnav.offline.at', new Date().toISOString());
  return { total: urls.size, failed };
}
