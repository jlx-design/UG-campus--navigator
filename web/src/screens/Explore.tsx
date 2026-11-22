import { InstallBanner } from '../components/Install';
import { PlaceExtras } from '../components/PlaceExtras';
import React, { useState } from 'react';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { Notice, SourceLink, VerificationTag, go } from '../components/common';
import type { MapApi } from '../components/MapView';
import { importOsm } from '../lib/api';
import { K } from '../lib/keys';

/** A slim one-line note that floats over the map without hiding it. */
function MapNote({ text, icon = 'info', kind, action, onClose }: { text: string; icon?: string; kind?: 'error'; action?: React.ReactNode; onClose?: () => void }) {
  return (
    <div className={`map-note glass ${kind || ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={kind === 'error' ? 'alert' : icon} />
      <span>{text}</span>
      {action}
      {onClose && <button className="note-x" onClick={onClose} aria-label="Dismiss"><Icon name="close" /></button>}
    </div>
  );
}
import { fmtDate, fmtDistance, haversine } from '../lib/geo';

function LayersPanel({ mapApi, onClose }: { mapApi: React.MutableRefObject<MapApi | null>; onClose: () => void }) {
  const { prefs, setPrefs, showShuttles, setShowShuttles, shuttles } = useStore();
  const styles: [string, string, string][] = [['auto', 'Auto', 'sparkle'], ['streets', 'Streets', 'map'], ['satellite', 'Satellite', 'satellite'], ['dark', 'Night', 'moon']];
  return (
    <section className="sheet glass layers" aria-label="Map layers">
      <div className="row"><h2 style={{ flex: 1 }}>Map style</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
      <div className="style-grid">
        {styles.map(([k, l, i]) => (
          <button key={k} className={`style-opt s-${k}`} aria-pressed={prefs.mapStyle === k} onClick={() => setPrefs({ mapStyle: k as any })}>
            <span className="thumb"><Icon name={i} /></span>{l}
          </button>
        ))}
      </div>
      <div className="list-rows">
        <label className="toggle-row"><span><Icon name="cube" />3D buildings & tilt</span>
          <input type="checkbox" role="switch" checked={prefs.buildings3d} onChange={e => { setPrefs({ buildings3d: e.target.checked }); const on = mapApi.current?.pitch() ?? 0; if ((on > 10) !== e.target.checked) mapApi.current?.toggle3d(); }} /></label>
        <label className="toggle-row"><span><Icon name="bus" />Live shuttles {shuttles.length ? <span className="tag ok">{shuttles.length} live</span> : <span className="tag">none live</span>}</span>
          <input type="checkbox" role="switch" checked={showShuttles} onChange={e => setShowShuttles(e.target.checked)} /></label>
      </div>
      <p className="hint">Basemap © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors. Satellite imagery © Esri.</p>
    </section>
  );
}

export function ExploreOverlay({ mapApi, filter, setFilter }: { mapApi: React.MutableRefObject<MapApi | null>; filter: string | null; setFilter: (f: string | null) => void }) {
  const { categories, locations, locState, locError, reloadLocations, selectedId, select, byId, geo, startGeo, saved, toggleSaved, goDirections, setPin, role, toast } = useStore();
  const [importing, setImporting] = useState(false);
  const [hintClosed, setHintClosed] = useState(() => { try { return !!localStorage.getItem(K('hint.empty')); } catch { return false; } });
  const [geoClosed, setGeoClosed] = useState(false);
  const runImport = async () => {
    setImporting(true);
    try { const r = await importOsm(); toast(`Imported ${r.inserted} places from OpenStreetMap (unverified until checked)`); reloadLocations(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setImporting(false); }
  };
  const sel = selectedId ? byId.get(selectedId) : null;
  const usedCats = categories.filter(c => locations.some(l => l.category === c.slug));
  const [locating, setLocating] = useState(false);
  const [layers, setLayers] = useState(false);
  const [bearing, setBearing] = useState(0);
  React.useEffect(() => { const t = setInterval(() => setBearing(mapApi.current?.bearing() ?? 0), 400); return () => clearInterval(t); }, []);

  const locate = () => {
    setLocating(true); startGeo();
    if (geo.status === 'ok') { mapApi.current?.flyTo(geo.pos, 17); setLocating(false); }
  };
  React.useEffect(() => { if (locating && geo.status === 'ok') { mapApi.current?.flyTo(geo.pos, 17); setLocating(false); } if (geo.status === 'denied' || geo.status === 'unavailable') setLocating(false); }, [geo, locating]);

  const directions = (id: string) => goDirections(id);

  return (
    <>
      <div className="map-overlay-top">
        <SearchBox onPick={l => select(l.id)} placeholder={'Search buildings, rooms, halls, offices…'} />
        {usedCats.length > 0 && (
          <div className="chips" role="toolbar" aria-label="Filter by category">
            <button className="chip glass" aria-pressed={filter === null} onClick={() => setFilter(null)}>All</button>
            {usedCats.map(c => (
              <button key={c.slug} className="chip glass" aria-pressed={filter === c.slug} onClick={() => setFilter(filter === c.slug ? null : c.slug)}>
                <Icon name={c.icon} />{c.label}
              </button>
            ))}
          </div>
        )}
        {locState === 'error' && <MapNote kind="error" text={`Couldn't load campus places. ${locError || ''}`} action={<button className="note-btn" onClick={reloadLocations}>Retry</button>} />}
        {locState === 'ready' && locations.length === 0 && !hintClosed && <MapNote icon="pin" text="No places listed yet. Press and hold the map to get directions to any spot."
          action={(role === 'editor' || role === 'admin') ? <button className="note-btn" disabled={importing} onClick={runImport}>{importing ? <span className="spinner" /> : 'Import buildings'}</button> : undefined}
          onClose={() => { setHintClosed(true); try { localStorage.setItem(K('hint.empty'), '1'); } catch { /* ignore */ } }} />}
        {geo.status === 'denied' && !geoClosed && <MapNote icon="locate" text="Location is off. Allow it in your browser settings, or pick a start point on the map." onClose={() => setGeoClosed(true)} />}
        {geo.status === 'unavailable' && !geoClosed && <MapNote icon="locate" text={geo.message} onClose={() => setGeoClosed(true)} />}
      </div>

      <div className="map-controls">
        {Math.abs(bearing) > 2 && <button className="fab glass" onClick={() => mapApi.current?.resetNorth()} aria-label="Reset map to north"><Icon name="compass" style={{ transform: `rotate(${-bearing}deg)` }} /></button>}
        <button className="fab glass" onClick={() => setLayers(v => !v)} aria-label="Map style and layers" aria-pressed={layers}><Icon name="layers" /></button>
        <button className="fab glass" onClick={locate} aria-label="Show my location" aria-pressed={geo.status === 'ok'}>
          {locating || geo.status === 'requesting' ? <span className="spinner" /> : <Icon name="locate" />}
        </button>
        <button className="fab glass" onClick={() => mapApi.current?.home()} aria-label="Back to campus"><Icon name="campus" /></button>
        <a className="fab fab-sos" href="#/emergency" aria-label="Emergency contacts"><Icon name="sos" /></a>
      </div>
      <InstallBanner />
      <a className="ask-pill glass" href="#/assistant"><Icon name="askAi" />{'Ask Campus AI'}</a>
      {layers && <LayersPanel mapApi={mapApi} onClose={() => setLayers(false)} />}

      {sel && sel.id === 'pin' && !layers && (
        <section className="sheet glass" aria-label="Dropped pin">
          <div className="grab" />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}><h2>Dropped pin</h2><div className="meta"><span>{sel.lat.toFixed(5)}, {sel.lng.toFixed(5)}</span>{geo.status === 'ok' && <span>· {fmtDistance(haversine(geo.pos, [sel.lat, sel.lng]))} away (straight line)</span>}</div></div>
            <span className="spacer" />
            <button className="icon-btn" onClick={() => { select(null); setPin(null); }} aria-label="Remove pin"><Icon name="close" /></button>
          </div>
          <p style={{ fontSize: 14 }}>Walking directions follow real footpaths and roads from OpenStreetMap. Press and hold somewhere else to move the pin.</p>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={() => directions(sel.id)}><Icon name="walk" />Directions</button>
            <a className="btn ghost small" href="#/report?kind=missing_place"><Icon name="flag" />Suggest a missing place</a>
          </div>
        </section>
      )}

      {sel && sel.id !== 'pin' && !layers && (
        <section className="sheet glass" aria-label={`${sel.name} details`}>
          <div className="grab" />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <h2>{sel.name}</h2>
              <div className="meta">
                <span>{categories.find(c => c.slug === sel.category)?.label || sel.category}</span>
                <VerificationTag v={sel.verification} />
                {geo.status === 'ok' && <span>· {fmtDistance(haversine(geo.pos, [sel.lat, sel.lng]))} away (straight line)</span>}
              </div>
            </div>
            <span className="spacer" />
            <button className="icon-btn" onClick={() => select(null)} aria-label="Close details"><Icon name="close" /></button>
          </div>
          <PlaceExtras place={sel} />
          {sel.alt_names?.length > 0 && <p style={{ fontSize: 14 }}>Also known as: {sel.alt_names.join(', ')}</p>}
          {sel.description && <p>{sel.description}</p>}
          {sel.location_context && <p style={{ fontSize: 14 }}><b>Where:</b> {sel.location_context}</p>}
          {sel.accessibility && <p style={{ fontSize: 14 }}><b>Accessibility (verified):</b> {sel.accessibility}</p>}
          {sel.verification !== 'verified' && <p style={{ fontSize: 13 }}>This place comes from {sel.source_label} and hasn’t been confirmed by the app’s editors. Check signage on arrival.</p>}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => directions(sel.id)}><Icon name="walk" />{'Directions'}</button>
            <button className="btn" onClick={() => toggleSaved(sel.id)} aria-pressed={saved.has(sel.id)}>
              <Icon name={saved.has(sel.id) ? 'starFill' : 'star'} />{saved.has(sel.id) ? 'Saved' : 'Save'}
            </button>
            <a className="btn ghost small" href={`#/report?kind=wrong_info&location=${sel.id}`}><Icon name="flag" />Report issue</a>
          </div>
          <div style={{ marginTop: 10 }}>
            <SourceLink url={sel.source_url} label={sel.source_label} date={sel.last_verified_at ? fmtDate(sel.last_verified_at) : null} />
          </div>
        </section>
      )}
    </>
  );
}
