// Appearance preferences: applied as CSS custom properties, stored locally and synced to the profile.
export type Mode = 'light' | 'dark' | 'system' | 'amoled';
export type MapStyle = 'streets' | 'satellite' | 'dark' | 'auto';
export interface Prefs {
  mode: Mode; accent: string; surface: 'glass' | 'solid'; radius: 'soft' | 'round' | 'crisp';
  textScale: 0.9 | 1 | 1.1 | 1.2; mapStyle: MapStyle; buildings3d: boolean; reduceMotion: boolean;
}
export const ACCENTS: { name: string; hex: string }[] = [
  { name: 'Legon Blue', hex: '#1d4ed8' }, { name: 'Royal Gold', hex: '#c8961e' }, { name: 'Emerald', hex: '#059669' },
  { name: 'Crimson', hex: '#dc2626' }, { name: 'Violet', hex: '#7c3aed' }, { name: 'Ocean', hex: '#0891b2' },
  { name: 'Rose', hex: '#e11d48' }, { name: 'Graphite', hex: '#334155' },
];
export const DEFAULT_PREFS: Prefs = { mode: 'system', accent: '#1d4ed8', surface: 'glass', radius: 'round', textScale: 1, mapStyle: 'auto', buildings3d: true, reduceMotion: false };
const KEY = 'ugnav.prefs.v1';

export function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p: Prefs) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }

const hexToRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c: number[]) => `rgb(${c.join(' ')})`;
const lum = (c: number[]) => { const s = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };

export const isDark = (p: Prefs) => p.mode === 'dark' || p.mode === 'amoled' || (p.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

export function applyPrefs(p: Prefs) {
  const root = document.documentElement;
  const dark = isDark(p);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.amoled = String(p.mode === 'amoled');
  root.dataset.surface = p.surface;
  root.dataset.radius = p.radius;
  root.dataset.motion = p.reduceMotion ? 'reduced' : 'full';
  const a = /^#[0-9a-f]{6}$/i.test(p.accent) ? hexToRgb(p.accent) : hexToRgb(DEFAULT_PREFS.accent);
  // In dark mode lift the accent so text/icons keep contrast; derive tints from the same hue.
  const accent = dark ? mix(a, [255, 255, 255], lum(a) < 0.25 ? 0.35 : 0.15) : a;
  const on = lum(accent) > 0.45 ? '#0b1220' : '#ffffff';
  root.style.setProperty('--accent', rgb(accent));
  root.style.setProperty('--accent-rgb', accent.join(' '));
  root.style.setProperty('--on-accent', on);
  root.style.setProperty('--accent-soft', `rgb(${accent.join(' ')} / ${dark ? 0.18 : 0.1})`);
  root.style.setProperty('--accent-strong', rgb(mix(accent, dark ? [255, 255, 255] : [0, 0, 0], 0.18)));
  root.style.setProperty('--text-scale', String(p.textScale));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.mode === 'amoled' && dark ? '#000000' : dark ? '#0a0f1a' : '#f6f7fb');
}

export function resolvedMapStyle(p: Prefs): Exclude<MapStyle, 'auto'> {
  return p.mapStyle === 'auto' ? (isDark(p) ? 'dark' : 'streets') : p.mapStyle;
}
