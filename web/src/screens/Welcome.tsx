import React, { useState } from 'react';
import { APP_NAME, CAMPUS } from '../config';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { saveAudience, type Audience } from '../lib/audience';
import { switchCampusHref } from '../lib/campusSwitch';
import { K } from '../lib/keys';

export const WELCOME_SEEN = K('welcome.seen');
const markSeen = () => { try { localStorage.setItem(WELCOME_SEEN, '1'); } catch { /* ignore */ } };

const CHOICES: [Audience, string, string, string][] = [
  ['fresher', 'sparkle', "I'm a fresher", 'Level 100 — new this year'],
  ['continuing', 'book', "I'm a continuing student", 'Level 200 and above'],
  ['postgrad', 'school', "I'm a postgraduate", "Master's, MPhil or PhD"],
  ['staff', 'idcard', "I'm staff", 'Lecturer or university staff'],
  ['visitor', 'walk', "I'm visiting", 'Parent, guest or applicant'],
];
const LEVELS = ['200', '300', '400', '500', '600'];
const PG: [string, string][] = [['masters', "Master's"], ['mphil', 'MPhil'], ['phd', 'PhD']];

/** First-run onboarding: confirm the campus, then who you are. Shown before sign-in; sign-in stays optional. */
export function Welcome() {
  const { user, toast } = useStore();
  const [pick, setPick] = useState<Audience | null>(null);
  const [busy, setBusy] = useState(false);
  const finish = async (aud: Audience, level: string | null) => {
    setBusy(true); markSeen();
    try { await saveAudience({ aud, level }, user); }
    catch (e: any) { toast(`Saved on this device. Couldn't update your profile: ${e.message}`, 'error'); }
    setBusy(false);
    location.hash = aud === 'visitor' ? '#/map' : '#/guide';
  };
  const choose = (a: Audience) => {
    if (a === 'fresher') finish('fresher', '100');
    else if (a === 'staff' || a === 'visitor') finish(a, null);
    else setPick(a);
  };
  const sw = switchCampusHref();

  return (
    <div className="screen welcome">
      <div className="welcome-brand"><img className="welcome-mark" src="./icons/logo.svg" alt="" width="46" height="46" /><div><b>{APP_NAME}</b><span>{CAMPUS.university}</span></div></div>
      <div className="card campus-confirm">
        <Icon name="campus" />
        <div style={{ flex: 1, minWidth: 0 }}><div className="sub">Your campus</div><b>{CAMPUS.university}, {CAMPUS.campusName}</b></div>
        {sw && <a className="btn small" href={sw}>Change</a>}
      </div>

      {!pick && <>
        <h1 style={{ marginTop: 18 }}>Who are you?</h1>
        <p className="lede">We'll set the app up for you. You can change this any time in Me → My details.</p>
        <div className="list" role="list">
          {CHOICES.map(([k, icon, title, sub]) => (
            <button key={k} role="listitem" className="card row nav-row choice" disabled={busy} onClick={() => choose(k)}>
              <span className="cat-ic"><Icon name={icon} /></span>
              <div style={{ minWidth: 0, textAlign: 'left' }}><h3>{title}</h3><div className="sub">{sub}</div></div>
              <span className="spacer" /><Icon name="chevron" style={{ width: 18, color: 'var(--text-3)' }} />
            </button>
          ))}
        </div>
      </>}

      {pick === 'continuing' && <>
        <h1 style={{ marginTop: 18 }}>Which level are you in?</h1>
        <div className="level-grid">{LEVELS.map(l => <button key={l} className="btn" disabled={busy} onClick={() => finish('continuing', l)}>Level {l}</button>)}</div>
        <button className="link-btn" onClick={() => setPick(null)}>Back</button>
      </>}
      {pick === 'postgrad' && <>
        <h1 style={{ marginTop: 18 }}>Which programme?</h1>
        <div className="level-grid">{PG.map(([k, l]) => <button key={k} className="btn" disabled={busy} onClick={() => finish('postgrad', k)}>{l}</button>)}</div>
        <button className="link-btn" onClick={() => setPick(null)}>Back</button>
      </>}

      <p className="hint" style={{ marginTop: 20 }}>No account needed to explore the map. {!user && <>Want your timetable and GPA on every device? <a href="#/register">Create a free account</a> or <a href="#/login">sign in</a> after this.</>}</p>
      <button className="link-btn" onClick={() => { markSeen(); location.hash = '#/map'; }}>Skip for now</button>
    </div>
  );
}
