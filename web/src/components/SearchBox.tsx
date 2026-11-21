import React, { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/api';
import { useStore } from '../store';
import { Icon } from './Icon';
import type { Location, RoomHit } from '../lib/types';
import { track } from '../lib/track';

/** Debounced server-side search (search_locations RPC: full-text + trigram + alternative names). */
export function SearchBox({ onPick, placeholder = 'Search buildings, halls, offices…', autoFocus = false }: { onPick: (l: Location) => void; placeholder?: string; autoFocus?: boolean }) {
  const { categories, byId, setRoomFocus } = useStore();
  const [rooms, setRooms] = useState<RoomHit[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Location[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const labelOf = new Map(categories.map(c => [c.slug, c]));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setRooms([]); setState('idle'); return; }
    const my = ++seq.current;
    setState('loading');
    const t = setTimeout(() => {
      Promise.all([rpc<Location[]>('search_locations', { q: term, max_results: 12 }), rpc<RoomHit[]>('search_rooms', { q: term, max_results: 6 }).catch(() => [] as RoomHit[])])
        .then(([r, rm]) => { if (my === seq.current) { setResults(r); setRooms(rm.filter(x => byId.has(x.location_id))); setState('idle'); setActive(-1); track('search'); } })
        .catch(e => { if (my === seq.current) { setState('error'); setErr(e.message); } });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const pickRoom = (r: RoomHit) => { setRoomFocus(r); const b = byId.get(r.location_id); if (b) pick(b, true); };
  const pick = (l: Location, keepRoom = false) => { if (!keepRoom) setRoomFocus(null); onPick(l); setOpen(false); setQ(''); setResults(null); (document.activeElement as HTMLElement)?.blur(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!results?.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <>
      <div className="search glass" role="search">
        <Icon name="search" />
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          placeholder={placeholder} aria-label="Search campus places" autoFocus={autoFocus} autoComplete="off" enterKeyHint="search"
          role="combobox" aria-expanded={open && !!results} aria-controls="search-results" aria-activedescendant={active >= 0 ? `sr-${active}` : undefined} />
        {state === 'loading' && <span className="spinner" style={{ color: 'var(--text-3)' }} aria-label="Searching" />}
        {q && <button className="icon-btn" onClick={() => { setQ(''); setResults(null); }} aria-label="Clear search"><Icon name="close" /></button>}
      </div>
      {open && q.trim().length >= 2 && (
        <div className="results glass" id="search-results" role="listbox" aria-label="Search results">
          {state === 'error' && <div className="notice error">Search failed: {err}</div>}
          {rooms.map(r => (
            <button key={`room-${r.id}`} role="option" aria-selected={false} className="result" onClick={() => pickRoom(r)}>
              <span className="cat-ic room-ic"><Icon name="door" /></span>
              <span style={{ minWidth: 0 }}>
                <div className="t">{r.code}{r.name ? ` · ${r.name}` : ''}</div>
                <div className="s">Room in {r.building}{r.floor ? ` · ${r.floor}` : ''}{r.verification !== 'verified' ? ' · unverified' : ''}</div>
              </span>
            </button>
          ))}
          {results && results.length === 0 && rooms.length === 0 && state !== 'loading' && (
            <div style={{ padding: 14, color: 'var(--text-3)', fontSize: 14 }}>
              No matching places in the campus directory yet. Try another name, or <a href={`#/report?kind=missing_place&text=${encodeURIComponent(q)}`}>report a missing place</a>.
            </div>
          )}
          {results?.map((l, i) => (
            <button key={l.id} id={`sr-${i}`} role="option" aria-selected={i === active} className="result" onClick={() => pick(l)}>
              <span className="cat-ic"><Icon name={labelOf.get(l.category)?.icon || 'pin'} /></span>
              <span style={{ minWidth: 0 }}>
                <div className="t">{l.name}</div>
                <div className="s">{labelOf.get(l.category)?.label || l.category}{l.alt_names?.length ? ` · also “${l.alt_names[0]}”` : ''}{l.verification !== 'verified' ? ' · unverified' : ''}</div>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
