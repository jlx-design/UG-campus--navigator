import React, { useState } from 'react';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { Notice, SourceLink, VerificationTag, go } from '../components/common';
import type { MapApi } from '../components/MapView';
import { fmtDate, fmtDistance, haversine } from '../lib/geo';

export function ExploreOverlay({ mapApi, filter, setFilter }: { mapApi: React.MutableRefObject<MapApi | null>; filter: string | null; setFilter: (f: string | null) => void }) {
  const { categories, locations, locState, locError, reloadLocations, selectedId, select, byId, geo, startGeo, saved, toggleSaved, setDestId, setRoute } = useStore();
  const sel = selectedId ? byId.get(selectedId) : null;
  const usedCats = categories.filter(c => locations.some(l => l.category === c.slug));
  const [locating, setLocating] = useState(false);

  const locate = () => {
    setLocating(true); startGeo();
    if (geo.status === 'ok') { mapApi.current?.flyTo(geo.pos, 17); setLocating(false); }
  };
  React.useEffect(() => { if (locating && geo.status === 'ok') { mapApi.current?.flyTo(geo.pos, 17); setLocating(false); } if (geo.status === 'denied' || geo.status === 'unavailable') setLocating(false); }, [geo, locating]);

  const directions = (id: string) => { setRoute(null); setDestId(id); go('#/navigate'); };

  return (
    <>
      <div className="map-overlay-top">
        <SearchBox onPick={l => select(l.id)} />
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
        {locState === 'error' && <Notice kind="error">Could not load campus places: {locError} <button className="btn small" onClick={reloadLocations}>Retry</button></Notice>}
        {locState === 'ready' && locations.length === 0 && <Notice kind="info">The campus directory has no published places yet. Editors can add verified places or import OpenStreetMap data from the admin area.</Notice>}
        {geo.status === 'denied' && <Notice>Location permission is blocked. You can still browse and plan routes from a point you pick on the map. To enable it, allow location for this site in your browser settings.</Notice>}
        {geo.status === 'unavailable' && <Notice>{geo.message}</Notice>}
      </div>

      <div className="map-controls">
        <button className="fab glass" onClick={locate} aria-label="Show my location" aria-pressed={geo.status === 'ok'}>
          {locating || geo.status === 'requesting' ? <span className="spinner" /> : <Icon name="locate" />}
        </button>
        <button className="fab glass" onClick={() => mapApi.current?.home()} aria-label="Back to campus"><Icon name="campus" /></button>
        <a className="fab glass" href="#/assistant" aria-label="Ask the assistant"><Icon name="chat" /></a>
      </div>

      {sel && (
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
          {sel.alt_names?.length > 0 && <p style={{ fontSize: 14 }}>Also known as: {sel.alt_names.join(', ')}</p>}
          {sel.description && <p>{sel.description}</p>}
          {sel.location_context && <p style={{ fontSize: 14 }}><b>Where:</b> {sel.location_context}</p>}
          {sel.accessibility && <p style={{ fontSize: 14 }}><b>Accessibility (verified):</b> {sel.accessibility}</p>}
          {sel.verification !== 'verified' && <p style={{ fontSize: 13 }}>This place comes from {sel.source_label} and hasn’t been confirmed by the app’s editors. Check signage on arrival.</p>}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => directions(sel.id)}><Icon name="walk" />Directions</button>
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
