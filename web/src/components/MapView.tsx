import React, { useEffect, useRef, useState } from 'react';
import { CAMPUS_BOUNDS, CAMPUS_CENTER, CAMPUS_ZOOM, CONFIG, MAX_BOUNDS } from '../config';
import { useStore } from '../store';
import { resolvedMapStyle } from '../theme';
import { iconSvgString } from './Icon';
import type { LatLng } from '../lib/geo';

declare const maplibregl: any; // MapLibre GL JS, loaded from CDN in index.html

export interface MapApi {
  flyTo: (p: LatLng, z?: number) => void; fitRoute: () => void; home: () => void;
  /** Google-Maps-style follow camera: centre on the user, heading-up, tilted. */
  navCamera: (p: LatLng, bearing: number, opts?: { zoom?: number; pitch?: number }) => void;
  /** Grey out the part of the route already walked. */
  setRouteProgress: (done: LatLng[] | null) => void;
  /** Called when the user drags/rotates the map themselves (to pause following). */
  onUserMove: (cb: (() => void) | null) => void;
  toggle3d: () => boolean; resetNorth: () => void; bearing: () => number; pitch: () => number;
}

const CAT_COLORS: Record<string, string> = {
  academic: '#2563eb', lecture_hall: '#7c3aed', library: '#0d9488', administration: '#475569', hall: '#ea580c',
  student_services: '#db2777', health: '#dc2626', sports: '#16a34a', food: '#ca8a04', worship: '#9333ea',
  bank: '#0891b2', transport: '#0284c7', other: '#64748b',
};
const FONT = ['Noto Sans Regular'];
const satelliteStyle = () => ({
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: { sat: { type: 'raster', tiles: [CONFIG.SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: CONFIG.SATELLITE_ATTRIBUTION } },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
});
const styleFor = (s: string) => (s === 'satellite' ? satelliteStyle() : s === 'dark' ? CONFIG.STYLE_DARK : CONFIG.STYLE_STREETS);

/** Accuracy ring as a polygon (metres → degrees). */
function circle([lat, lng]: LatLng, r: number) {
  const pts: number[][] = []; const dLat = r / 111320; const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * 2 * Math.PI; pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
}

export function MapView({ visible, apiRef, filter }: { visible: boolean; apiRef: React.MutableRefObject<MapApi | null>; filter: string | null }) {
  const s = useStore();
  const { locations, selectedId, select, geo, route, navigating, pickingOrigin, setPickingOrigin, origin, setOrigin, destId, byId, prefs, shuttles, shuttleRoutes, showShuttles } = s;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markers = useRef<{ sel?: any; me?: any; origin?: any; shuttles: Map<string, any> }>({ shuttles: new Map() });
  const [ready, setReady] = useState(0);              // bumps after every style load so layers get re-added
  const [failed, setFailed] = useState<string | null>(null);
  const styleName = resolvedMapStyle(prefs);
  const routeCoords = useRef<number[][]>([]);
  const latest = useRef({ pickingOrigin, select, setOrigin, setPickingOrigin });
  latest.current = { pickingOrigin, select, setOrigin, setPickingOrigin };

  // ── Create once ──
  useEffect(() => {
    if (typeof maplibregl === 'undefined') { setFailed('The map library could not be loaded. Check your connection and reload.'); return; }
    const m = new maplibregl.Map({
      container: el.current, style: styleFor(styleName), center: CAMPUS_CENTER, zoom: CAMPUS_ZOOM, maxBounds: MAX_BOUNDS,
      minZoom: 12, maxZoom: 19.5, pitch: prefs.buildings3d ? 45 : 0, attributionControl: { compact: true }, dragRotate: true, touchPitch: true,
      fadeDuration: prefs.reduceMotion ? 0 : 300,
    });
    m.touchZoomRotate.enableRotation();
    m.on('style.load', () => setReady(n => n + 1));
    m.on('error', (e: any) => { if (/style|Failed to fetch/i.test(String(e?.error?.message || ''))) setFailed('Map data is not loading. You may be offline — saved info still works.'); });
    m.on('data', () => setFailed(null));
    m.on('click', (e: any) => {
      const L = latest.current;
      if (L.pickingOrigin) { L.setOrigin({ kind: 'point', pos: [e.lngLat.lat, e.lngLat.lng] }); L.setPickingOrigin(false); return; }
      const f = m.queryRenderedFeatures(e.point, { layers: ['ug-places', 'ug-places-label'].filter(id => m.getLayer(id)) })[0];
      if (f) L.select(f.properties.id);
    });
    m.on('mouseenter', 'ug-places', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'ug-places', () => { m.getCanvas().style.cursor = ''; });
    const userMove = { cb: null as null | (() => void) };
    const manual = (e: any) => { if (e?.originalEvent) userMove.cb?.(); };
    m.on('dragstart', manual); m.on('rotatestart', manual); m.on('pitchstart', manual); m.on('zoomstart', manual);
    map.current = m;
    apiRef.current = {
      navCamera: (p, b, o = {}) => {
        const h = m.getContainer().clientHeight;
        m.easeTo({ center: [p[1], p[0]], bearing: b, pitch: o.pitch ?? (prefs.buildings3d ? 60 : 45), zoom: o.zoom ?? 18.3,
          padding: { top: Math.round(h * 0.42), bottom: 0, left: 0, right: 0 }, duration: prefs.reduceMotion ? 0 : 950, easing: (t: number) => t });
        const me = markers.current.me; if (me) { me.setRotation(b); me.getElement().classList.add('has-heading'); }
      },
      setRouteProgress: done => { const src = m.getSource('ug-route-done'); src?.setData(done && done.length > 1 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: done.map(([la, ln]) => [ln, la]) }, properties: {} } : { type: 'FeatureCollection', features: [] }); },
      onUserMove: cb => { userMove.cb = cb; },
      flyTo: (p, z = 17.5) => m.flyTo({ center: [p[1], p[0]], zoom: Math.max(m.getZoom(), z), duration: prefs.reduceMotion ? 0 : 900, essential: true }),
      fitRoute: () => { m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 }); const c = routeCoords.current; if (c.length) { const b = c.reduce((bb: any, p: any) => bb.extend(p), new maplibregl.LngLatBounds(c[0], c[0])); m.fitBounds(b, { padding: { top: 170, bottom: 320, left: 50, right: 50 }, maxZoom: 18, bearing: 0, pitch: 0, duration: 800 }); } },
      home: () => m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 }) && m.fitBounds(CAMPUS_BOUNDS, { padding: 20, duration: 800 }),
      toggle3d: () => { const on = m.getPitch() < 10; m.easeTo({ pitch: on ? 55 : 0, duration: 600 }); return on; },
      resetNorth: () => m.easeTo({ bearing: 0, pitch: 0, duration: 500 }),
      bearing: () => m.getBearing(), pitch: () => m.getPitch(),
    };
    return () => { m.remove(); map.current = null; };
  }, []);

  // ── Switch basemap when the preference changes ──
  const lastStyle = useRef(styleName);
  useEffect(() => { if (map.current && lastStyle.current !== styleName) { lastStyle.current = styleName; map.current.setStyle(styleFor(styleName)); } }, [styleName]);
  useEffect(() => { if (visible && map.current) setTimeout(() => map.current?.resize(), 60); }, [visible]);
  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = pickingOrigin ? 'crosshair' : ''; }, [pickingOrigin]);

  // ── App layers (re-added after each style load) ──
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    // 3D buildings for styles that lack them (dark); liberty ships its own "building-3d".
    if (styleName === 'dark' && !m.getLayer('ug-buildings-3d') && m.getSource('openmaptiles')) {
      m.addLayer({ id: 'ug-buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 15,
        paint: { 'fill-extrusion-color': '#2a3346', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.75 } });
    }
    const add = (id: string, src: any) => { if (!m.getSource(id)) m.addSource(id, src); };
    add('ug-places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    add('ug-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    add('ug-route-done', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    add('ug-acc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const dark = styleName !== 'streets';
    if (!m.getLayer('ug-acc')) m.addLayer({ id: 'ug-acc', type: 'fill', source: 'ug-acc', paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.12 } });
    if (!m.getLayer('ug-route-casing')) m.addLayer({ id: 'ug-route-casing', type: 'line', source: 'ug-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': dark ? '#0b1220' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 7, 19, 16] } });
    if (!m.getLayer('ug-route')) m.addLayer({ id: 'ug-route', type: 'line', source: 'ug-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 19, 10] } });
    if (!m.getLayer('ug-route-done')) m.addLayer({ id: 'ug-route-done', type: 'line', source: 'ug-route-done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': dark ? '#5b6475' : '#9aa3b2', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 19, 10] } });
    if (!m.getLayer('ug-route-arrows')) m.addLayer({ id: 'ug-route-arrows', type: 'symbol', source: 'ug-route', minzoom: 16, layout: { 'symbol-placement': 'line', 'symbol-spacing': 60, 'text-field': '›', 'text-font': FONT, 'text-size': 22, 'text-keep-upright': false, 'text-allow-overlap': true, 'text-offset': [0, -0.12] }, paint: { 'text-color': '#ffffff', 'text-opacity': 0.9 } });
    if (!m.getLayer('ug-places')) m.addLayer({ id: 'ug-places', type: 'circle', source: 'ug-places', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6, 19, 10], 'circle-color': ['get', 'color'],
      'circle-stroke-color': dark ? '#0b1220' : '#ffffff', 'circle-stroke-width': 2, 'circle-opacity': ['case', ['get', 'verified'], 1, 0.85] } });
    if (!m.getLayer('ug-places-label')) m.addLayer({ id: 'ug-places-label', type: 'symbol', source: 'ug-places', minzoom: 16.2, layout: {
      'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true },
      paint: { 'text-color': dark ? '#e5e7eb' : '#1f2937', 'text-halo-color': dark ? '#0b1220' : '#ffffff', 'text-halo-width': 1.4 } });
  }, [ready]);

  // ── Data → sources ──
  useEffect(() => {
    const m = map.current; const src = m?.getSource('ug-places'); if (!src) return;
    const shown = navigating ? locations.filter(l => l.id === destId) : locations.filter(l => !filter || l.category === filter || l.id === selectedId);
    src.setData({ type: 'FeatureCollection', features: shown.map(l => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
      properties: { id: l.id, name: l.name, color: CAT_COLORS[l.category] || CAT_COLORS.other, verified: l.verification === 'verified' } })) });
  }, [locations, filter, navigating, destId, selectedId, ready]);

  useEffect(() => {
    const m = map.current; const src = m?.getSource('ug-route'); if (!src) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1d4ed8';
    routeCoords.current = route ? route.coordinates.map(([la, ln]) => [ln, la]) : [];
    src.setData(route ? { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords.current }, properties: { color: accent } } : { type: 'FeatureCollection', features: [] });
    if (route && !navigating) apiRef.current?.fitRoute();
    if (!route) apiRef.current?.setRouteProgress(null);
  }, [route, ready, prefs.accent]);

  // ── Selected place pin ──
  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.sel?.remove(); markers.current.sel = undefined;
    const id = navigating ? destId : selectedId; const l = id ? byId.get(id) : null;
    if (!l) return;
    const cat = s.categories.find(c => c.slug === l.category);
    const div = document.createElement('div'); div.className = 'pin-sel'; div.innerHTML = iconSvgString(cat?.icon || 'pin'); div.style.setProperty('--pin', CAT_COLORS[l.category] || CAT_COLORS.other);
    markers.current.sel = new maplibregl.Marker({ element: div, anchor: 'bottom' }).setLngLat([l.lng, l.lat]).addTo(m);
    if (!navigating) m.flyTo({ center: [l.lng, l.lat], zoom: Math.max(m.getZoom(), 17.2), offset: [0, -80], duration: prefs.reduceMotion ? 0 : 700 });
  }, [selectedId, destId, navigating, byId]);

  // ── User location (real device fixes only) ──
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (geo.status !== 'ok') { markers.current.me?.remove(); markers.current.me = undefined; m.getSource('ug-acc')?.setData({ type: 'FeatureCollection', features: [] }); return; }
    const stale = Date.now() - geo.at > 30000;
    if (!markers.current.me) { const d = document.createElement('div'); d.className = 'me'; d.innerHTML = '<i class="me-cone"></i><i class="me-dot"></i>'; markers.current.me = new maplibregl.Marker({ element: d, rotationAlignment: 'map' }).setLngLat([geo.pos[1], geo.pos[0]]).addTo(m); }
    const me = markers.current.me; me.setLngLat([geo.pos[1], geo.pos[0]]);
    me.getElement().classList.toggle('stale', stale);
    me.getElement().classList.toggle('has-heading', geo.heading !== null && !Number.isNaN(geo.heading));
    if (geo.heading !== null) me.setRotation(geo.heading);
    m.getSource('ug-acc')?.setData(circle(geo.pos, Math.min(geo.accuracy, 300)));
  }, [geo, navigating, ready]);

  // ── Picked start point ──
  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.origin?.remove(); markers.current.origin = undefined;
    if (origin.kind === 'point') { const d = document.createElement('div'); d.className = 'origin-dot'; markers.current.origin = new maplibregl.Marker({ element: d }).setLngLat([origin.pos[1], origin.pos[0]]).addTo(m); }
  }, [origin]);

  // ── Live shuttles ──
  useEffect(() => {
    const m = map.current; if (!m) return;
    const live = markers.current.shuttles; const seen = new Set<string>();
    if (showShuttles) for (const p of shuttles) {
      seen.add(p.vehicle_id);
      const color = shuttleRoutes.find(r => r.id === p.route_id)?.color || '#0ea5e9';
      let mk = live.get(p.vehicle_id);
      if (!mk) { const d = document.createElement('div'); d.className = 'bus'; d.innerHTML = iconSvgString('bus'); mk = new maplibregl.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(m); live.set(p.vehicle_id, mk); }
      mk.getElement().style.setProperty('--bus', color);
      mk.getElement().title = shuttleRoutes.find(r => r.id === p.route_id)?.name || 'Shuttle';
      mk.setLngLat([p.lng, p.lat]);
    }
    for (const [id, mk] of live) if (!seen.has(id)) { mk.remove(); live.delete(id); }
  }, [shuttles, showShuttles, shuttleRoutes]);

  return (
    <div className="map-wrap" style={{ display: visible ? undefined : 'none' }} aria-hidden={!visible}>
      <div ref={el} className="map" role="application" aria-label="Campus map. Use the search box to find places." />
      {failed && <div className="map-banner" role="alert">{failed}</div>}
    </div>
  );
}
