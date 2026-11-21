import React, { useEffect, useState } from 'react';
import { db } from '../lib/api';
import { useStore } from '../store';
import { CAMPUS } from '../config';
import { Icon } from './Icon';
import type { Location } from '../lib/types';
import { track } from '../lib/track';

interface Hours { weekday: number; opens: string; closes: string; note: string | null; source_label: string; source_url: string | null; checked_at: string }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmt = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
/** Weekday (1 = Monday) and minutes since midnight on the campus clock, whatever the phone's time zone. */
export function campusNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: CAMPUS.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return { day: DAYS.indexOf(get('weekday').slice(0, 3)) + 1, mins: Number(get('hour')) * 60 + Number(get('minute')) };
}
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export function openState(rows: Hours[]) {
  if (!rows.length) return null;
  const { day, mins } = campusNow();
  const today = rows.filter(r => r.weekday === day);
  const open = today.find(r => toMin(r.opens) <= mins && mins < toMin(r.closes));
  if (open) return { open: true, text: `Open now · closes ${fmt(open.closes)}` };
  for (let i = 0; i < 7; i++) {
    const d = ((day - 1 + i) % 7) + 1;
    const next = rows.filter(r => r.weekday === d && (i > 0 || toMin(r.opens) > mins)).sort((a, b) => a.opens.localeCompare(b.opens))[0];
    if (next) return { open: false, text: `Closed · opens ${fmt(next.opens)}${i === 0 ? '' : i === 1 ? ' tomorrow' : ` ${DAYS[d - 1]}`}` };
  }
  return { open: false, text: 'Closed' };
}

export function PlaceExtras({ place }: { place: Location }) {
  const { roomFocus } = useStore();
  const [hours, setHours] = useState<Hours[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    track('place_view', place.id); setHours(null); setShowAll(false);
    db<Hours[]>('location_hours', `select=weekday,opens,closes,note,source_label,source_url,checked_at&location_id=eq.${place.id}&order=weekday.asc,opens.asc`).then(setHours).catch(() => setHours([]));
  }, [place.id]);
  const st = hours ? openState(hours) : null;
  const room = roomFocus && roomFocus.location_id === place.id ? roomFocus : null;
  return (
    <>
      {room && (
        <div className="room-callout"><Icon name="door" />
          <div><b>Room {room.code}{room.name ? ` · ${room.name}` : ''}</b>
            <span>{[room.floor, room.directions].filter(Boolean).join(' · ') || 'Inside this building.'}{room.verification !== 'verified' ? ' (unverified)' : ''}</span></div></div>
      )}
      {place.is_listing && (
        <div className="listing-row"><span className="tag warn">{place.is_sponsored ? 'Sponsored listing' : 'Business listing'}</span><span className="sub">Not a university facility</span>
          {place.listing_phone && <a className="btn small" href={`tel:${place.listing_phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" />Call</a>}
          {place.listing_website && <a className="btn small" href={place.listing_website} target="_blank" rel="noopener noreferrer"><Icon name="link" />Website</a>}</div>
      )}
      {st && (
        <div className="hours">
          <button className={`hours-state ${st.open ? 'open' : 'closed'}`} onClick={() => setShowAll(v => !v)} aria-expanded={showAll}><Icon name="clock" />{st.text}<Icon name="chevron" style={{ transform: showAll ? 'rotate(90deg)' : undefined }} /></button>
          {showAll && hours && (
            <div className="hours-table">
              {DAYS.map((d, i) => { const r = hours.filter(h => h.weekday === i + 1); return <div key={d} className={i + 1 === campusNow().day ? 'today' : ''}><span>{d}</span><span>{r.length ? r.map(h => `${fmt(h.opens)}–${fmt(h.closes)}${h.note ? ` (${h.note})` : ''}`).join(', ') : 'Closed / not listed'}</span></div>; })}
              <p className="hint">Source: {hours[0].source_url ? <a href={hours[0].source_url} target="_blank" rel="noopener noreferrer">{hours[0].source_label}</a> : hours[0].source_label} · checked {hours[0].checked_at}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
