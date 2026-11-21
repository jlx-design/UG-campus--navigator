// Who the person is, so the app can shape its home: a fresher (Level 100) gets first-year help,
// a continuing student (Level 200+) gets their semester, and so on.
// Guests: kept on this device. Signed in: kept in the profile (affiliation + level), which wins.
import { useEffect, useState } from 'react';
import { K } from './keys';
import { db } from './api';
import { track } from './track';
import type { SessionUser } from './types';

export type Audience = 'fresher' | 'continuing' | 'postgrad' | 'staff' | 'visitor';
export interface AudienceState { aud: Audience; level: string | null }

const KEY = K('audience.v1');
const EVT = 'ugnav-audience';
const PG = ['masters', 'mphil', 'phd'];

export function audienceFrom(affiliation: string | null | undefined, level: string | null | undefined): AudienceState | null {
  if (affiliation === 'staff') return { aud: 'staff', level: null };
  if (affiliation === 'visitor' || affiliation === 'other') return { aud: 'visitor', level: null };
  if (affiliation !== 'student') return null;
  if (level === '100') return { aud: 'fresher', level };
  if (level && PG.includes(level)) return { aud: 'postgrad', level };
  if (level && /^[2-6]00$/.test(level)) return { aud: 'continuing', level };
  return null; // a student who hasn't said their level yet
}

export function toProfile(s: AudienceState): { affiliation: string; level: string | null } {
  if (s.aud === 'staff') return { affiliation: 'staff', level: null };
  if (s.aud === 'visitor') return { affiliation: 'visitor', level: null };
  return { affiliation: 'student', level: s.level || (s.aud === 'fresher' ? '100' : null) };
}

export function readLocalAudience(): AudienceState | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.aud ? v : null; } catch { return null; }
}

/** Save the choice on this device, and in the profile when signed in. */
export async function saveAudience(s: AudienceState, user: SessionUser | null) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  dispatchEvent(new CustomEvent(EVT, { detail: s }));
  track(s.aud === 'fresher' ? 'onboard_fresher' : s.aud === 'continuing' || s.aud === 'postgrad' ? 'onboard_continuing' : s.aud === 'staff' ? 'onboard_staff' : 'onboard_visitor');
  if (user) await db('profiles', `user_id=eq.${user.id}`, { method: 'PATCH', body: toProfile(s), prefer: 'return=minimal' });
}

/** Current audience. For a signed-in person the profile is the source of truth; a choice made as a guest
 *  is copied into an empty profile once, so nobody has to answer twice. */
export function useAudience(user: SessionUser | null): AudienceState | null {
  const [s, setS] = useState<AudienceState | null>(readLocalAudience());
  useEffect(() => {
    const on = (e: Event) => setS((e as CustomEvent).detail);
    addEventListener(EVT, on); return () => removeEventListener(EVT, on);
  }, []);
  useEffect(() => {
    if (!user) { setS(readLocalAudience()); return; }
    let stop = false;
    db<{ affiliation: string | null; level: string | null }[]>('profiles', `select=affiliation,level&user_id=eq.${user.id}`).then(async r => {
      const p = r[0]; const fromProfile = audienceFrom(p?.affiliation, p?.level); const local = readLocalAudience();
      if (fromProfile) { if (!stop) setS(fromProfile); try { localStorage.setItem(KEY, JSON.stringify(fromProfile)); } catch { /* ignore */ } }
      else if (local && p && !p.affiliation) { await db('profiles', `user_id=eq.${user.id}`, { method: 'PATCH', body: toProfile(local), prefer: 'return=minimal' }).catch(() => {}); }
    }).catch(() => {});
    return () => { stop = true; };
  }, [user?.id]);
  return s;
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  fresher: 'Fresher (Level 100)', continuing: 'Continuing student', postgrad: 'Postgraduate student', staff: 'Staff', visitor: 'Visitor or guest',
};
