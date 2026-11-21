import React, { useEffect, useRef, useState } from 'react';
import { CAMPUS_BOUNDS, CAMPUS_CENTER, CAMPUS_ZOOM, CONFIG } from '../config';
import { useStore } from '../store';
import { iconSvgString } from './Icon';
import type { LatLng } from '../lib/geo';

declare const L: any; // Leaflet, loaded from CDN in index.html

export interface MapApi { flyTo: (p: LatLng, z?: number) => void; fitRoute: () => void; home: () => void }

export function MapView({ visible, apiRef, filter }: { visible: boolean; apiRef: React.MutableRefObject<MapApi | null>; filter: string | null }) {
  const { locations, categories, selectedId, select, geo, route, navigating, pickingOrigin, setPickingOrigin, origin, setOrigin, destId, byId } = useStore();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layers = useRef<{ markers?: any; me?: any; acc?: any; route?: any; casing?: any; origin?: any }>({});
  const markerById = useRef(new Map<string, any>());
  const [tileErrors, setTileErrors] = useState(0);
  const [leafletMissing, setLeafletMissing] = useState(false);

  // Create map once
  useEffect(() => {
    if (typeof L === 'undefined') { setLeafletMissing(true); return; }
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, maxBounds: [[5.55, -0.30], [5.75, -0.08]], minZoom: 13, maxZoom: 19, tap: true })
      .setView(CAMPUS_CENTER, CAMPUS_ZOOM);
    const tiles = L.tileLayer(CONFIG.TILE_URL, { maxZoom: 19, attribution: CONFIG.TILE_ATTRIBUTION, crossOrigin: true });
    let errs = 0;
    tiles.on('tileerror', () => { errs++; if (errs % 4 === 0) setTileErrors(errs); });
    tiles.on('load', () => { errs = 0; setTileErrors(0); });
    tiles.addTo(m);
    layers.current.markers = L.layerGroup().addTo(m);
    map.current = m;
    apiRef.current = {
      flyTo: (p, z = 18) => m.flyTo(p, Math.max(m.getZoom(), z), { duration: 0.6 }),
      fitRoute: () => { const r = layers.current.route; if (r) m.fitBounds(r.getBounds(), { paddingTopLeft: [30, 140], paddingBottomRight: [30, 260] }); },
      home: () => m.fitBounds(CAMPUS_BOUNDS),
    };
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => { if (visible && map.current) setTimeout(() => map.current?.invalidateSize(), 50); }, [visible]);

  // Origin picking by tapping the map
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!pickingOrigin) { m.getContainer().style.cursor = ''; return; }
    m.getContainer().style.cursor = 'crosshair';
    const onClick = (e: any) => { setOrigin({ kind: 'point', pos: [e.latlng.lat, e.latlng.lng] }); setPickingOrigin(false); };
    m.on('click', onClick); return () => { m.off('click', onClick); };
  }, [pickingOrigin]);

  // Markers
  useEffect(() => {
    const m = map.current; if (!m) return;
    const group = layers.current.markers; group.clearLayers(); markerById.current.clear();
    const iconOf = new Map(categories.map(c => [c.slug, c.icon]));
    const shown = navigating ? locations.filter(l => l.id === destId) : locations.filter(l => !filter || l.category === filter || l.id === selectedId);
    for (const l of shown) {
      const sel = l.id === selectedId || (navigating && l.id === destId);
      const html = `<div class="pin ${l.verification === 'verified' ? '' : 'unverified'} ${sel ? 'selected' : ''}">${iconSvgString(iconOf.get(l.category) || 'pin')}</div>`;
      const size = sel ? 38 : 30;
      const mk = L.marker([l.lat, l.lng], {
        icon: L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2 - 1, size + 2] }),
        title: l.name, alt: l.name, keyboard: true, riseOnHover: true, zIndexOffset: sel ? 1000 : 0,
      });
      mk.on('click', () => { if (!pickingOrigin) select(l.id); });
      mk.addTo(group); markerById.current.set(l.id, mk);
    }
  }, [locations, categories, selectedId, filter, navigating, destId, pickingOrigin]);

  // Fly to selection
  useEffect(() => {
    const l = selectedId ? byId.get(selectedId) : null;
    if (l && map.current && !navigating) map.current.flyTo([l.lat, l.lng], Math.max(map.current.getZoom(), 17), { duration: 0.5 });
  }, [selectedId]);

  // User location
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (geo.status !== 'ok') { layers.current.me?.remove(); layers.current.acc?.remove(); layers.current.me = layers.current.acc = undefined; return; }
    const stale = Date.now() - geo.at > 30000;
    const html = `<div class="me-dot ${stale ? 'stale' : ''}" aria-label="Your location"></div>`;
    if (!layers.current.me) {
      layers.current.acc = L.circle(geo.pos, { radius: geo.accuracy, color: 'var(--route)', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(m);
      layers.current.me = L.marker(geo.pos, { icon: L.divIcon({ html, className: '', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 2000 }).addTo(m);
    } else {
      layers.current.me.setLatLng(geo.pos); layers.current.me.setIcon(L.divIcon({ html, className: '', iconSize: [18, 18], iconAnchor: [9, 9] }));
      layers.current.acc.setLatLng(geo.pos); layers.current.acc.setRadius(geo.accuracy);
    }
    if (navigating) m.panTo(geo.pos, { animate: true });
  }, [geo, navigating]);

  // Picked origin marker
  useEffect(() => {
    const m = map.current; if (!m) return;
    layers.current.origin?.remove(); layers.current.origin = undefined;
    if (origin.kind === 'point') {
      layers.current.origin = L.circleMarker(origin.pos, { radius: 8, color: '#fff', weight: 3, fillColor: '#0b2a5b', fillOpacity: 1, interactive: false }).addTo(m);
    }
  }, [origin]);

  // Route geometry (as returned by the routing service — never synthesised)
  useEffect(() => {
    const m = map.current; if (!m) return;
    layers.current.route?.remove(); layers.current.casing?.remove();
    layers.current.route = layers.current.casing = undefined;
    if (!route) return;
    const css = getComputedStyle(document.documentElement);
    layers.current.casing = L.polyline(route.coordinates, { color: css.getPropertyValue('--route-casing').trim() || '#fff', weight: 10, opacity: 0.9, interactive: false }).addTo(m);
    layers.current.route = L.polyline(route.coordinates, { color: css.getPropertyValue('--route').trim() || '#1565d8', weight: 6, opacity: 0.95, interactive: false }).addTo(m);
    if (!navigating) m.fitBounds(layers.current.route.getBounds(), { paddingTopLeft: [30, 140], paddingBottomRight: [30, 280] });
  }, [route]);

  return (
    <div className="map-wrap" style={{ display: visible ? undefined : 'none' }}>
      <div ref={el} className="map" role="application" aria-label="Campus map" />
      {leafletMissing && <div className="map-overlay-top" style={{ top: 80 }}><div className="notice error">The map library could not be loaded. Check your internet connection and reload.</div></div>}
      {tileErrors >= 8 && <div className="map-overlay-top" style={{ top: 'auto', bottom: 'calc(var(--nav-h) + 90px)' }}><div className="notice error">Map tiles are not loading. You may be offline — places and saved data still work.</div></div>}
    </div>
  );
}
