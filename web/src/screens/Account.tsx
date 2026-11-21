import { InstallMenuItem } from '../components/Install';
import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { db } from '../lib/api';
import { deleteAccount, requestPasswordReset, resendCode, resetPassword, signIn, signOut, signUp, verifyEmail } from '../lib/auth';
import { ACCENTS, type Prefs } from '../theme';
import { Icon } from '../components/Icon';
import { BackLink, Empty, Notice, VerificationTag, go } from '../components/common';

function Field({ label, hint, ...p }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = React.useId();
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} className="input" {...p} />{hint && <span className="hint">{hint}</span>}</div>;
}
function AuthShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="screen auth-screen">
      <div className="auth-card glass">
        <div className="brandmark big"><span className="logo"><Icon name="pin" /></span><span>UG Navigator</span></div>
        <h1>{title}</h1>{sub && <p className="lede">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

function VerifyStep({ email, onDone }: { email: string; onDone: () => void }) {
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [sent, setSent] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const signedIn = await verifyEmail(email, code); if (signedIn) onDone(); else { setSent('Email verified — please sign in.'); setTimeout(() => go('#/login'), 1200); } }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <Notice kind="info">We sent a 6-digit code to <b>{email}</b>. It can take a minute — check spam too.</Notice>
      <div style={{ height: 12 }} />
      <Field label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
      {err && <p className="error-text" role="alert">{err}</p>}
      {sent && <p className="sub" role="status">{sent}</p>}
      <button className="btn primary block" disabled={busy || code.length < 4}>{busy ? <span className="spinner" /> : 'Verify email'}</button>
      <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={() => resendCode(email).then(() => setSent('A new code is on its way.')).catch(e => setErr(e.message))}>Send a new code</button>
    </form>
  );
}

export function Login() {
  const { user, toast } = useStore();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [verify, setVerify] = useState<string | null>(null);
  useEffect(() => { if (user) go('#/me'); }, [user]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await signIn(email.trim(), pw); if ('verify' in r) setVerify(r.verify); else { toast('Welcome back'); go('#/me'); } }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  if (verify) return <AuthShell title="Verify your email"><VerifyStep email={verify} onDone={() => { toast('Signed in'); go('#/me'); }} /></AuthShell>;
  return (
    <AuthShell title="Welcome back" sub="Sign in to sync your timetable, saved places and preferences.">
      <form onSubmit={submit} noValidate>
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Field label="Password" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required />
        {err && <p className="error-text" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy || !email || !pw}>{busy ? <span className="spinner" /> : 'Sign in'}</button>
      </form>
      <div className="row wrap" style={{ marginTop: 16, justifyContent: 'space-between' }}><a href="#/forgot-password">Forgot password?</a><a href="#/register">Create an account</a></div>
    </AuthShell>
  );
}

export function Register() {
  const { user, toast } = useStore();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [verify, setVerify] = useState<string | null>(null);
  useEffect(() => { if (user) go('#/me'); }, [user]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (name.trim().length < 2) { setErr('Please enter your name.'); return; }
    if (pw.length < 8) { setErr('Use at least 8 characters for your password.'); return; }
    setBusy(true);
    try { const r = await signUp(name.trim(), email.trim(), pw); if ('verify' in r) setVerify(r.verify); else go('#/me'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  if (verify) return <AuthShell title="Check your email" sub="One last step to secure your account."><VerifyStep email={verify} onDone={() => { toast('Account ready — welcome!'); go('#/me'); }} /></AuthShell>;
  return (
    <AuthShell title="Create your account" sub="Free. Exploring the map never needs an account.">
      <form onSubmit={submit} noValidate>
        <Field label="Full name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={80} required />
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Field label="Password" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} hint="At least 8 characters." required />
        {err && <p className="error-text" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy || !name || !email || !pw}>{busy ? <span className="spinner" /> : 'Create account'}</button>
      </form>
      <p className="sub" style={{ marginTop: 14 }}>Already have an account? <a href="#/login">Sign in</a></p>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [sent, setSent] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { await requestPasswordReset(email.trim()); setSent(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <AuthShell title="Reset password" sub="We'll email you a link to choose a new password.">
      {sent ? <Notice kind="info">If an account exists for {email}, a reset link is on its way.</Notice> : (
        <form onSubmit={submit}>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
          {err && <p className="error-text" role="alert">{err}</p>}
          <button className="btn primary block" disabled={busy || !email}>{busy ? <span className="spinner" /> : 'Send reset link'}</button>
        </form>
      )}
      <p className="sub" style={{ marginTop: 14 }}><a href="#/login">Back to sign in</a></p>
    </AuthShell>
  );
}

export function ResetPassword({ token }: { token: string | null }) {
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!token) return; if (pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    setBusy(true); setErr(''); try { await resetPassword(token, pw); setOk(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Choose a new password">
      {!token && <Notice kind="error">This reset link is missing its token. Request a new link.</Notice>}
      {ok ? <><Notice kind="info">Password updated.</Notice><a className="btn primary block" style={{ marginTop: 12 }} href="#/login">Sign in</a></> : token && (
        <form onSubmit={submit}>
          <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required />
          {err && <p className="error-text" role="alert">{err}</p>}
          <button className="btn primary block" disabled={busy || !pw}>{busy ? <span className="spinner" /> : 'Update password'}</button>
        </form>
      )}
    </AuthShell>
  );
}

export function Appearance() {
  const { prefs, setPrefs } = useStore();
  const P = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs({ [k]: v } as Partial<Prefs>);
  const isPreset = ACCENTS.some(a => a.hex.toLowerCase() === prefs.accent.toLowerCase());
  return (
    <div className="screen">
      <BackLink href="#/me" label="Me" />
      <header className="page-head"><h1>Appearance</h1><p className="lede">Make the app yours. Changes apply instantly and sync to your account.</p></header>
      <div className="preview glass" aria-hidden="true">
        <div className="pv-bar"><span className="pv-dot" /><span className="pv-line" /></div>
        <div className="pv-card"><b>Next · UGRC 110</b><span>8:30 AM · Jones Quartey Building</span><span className="pv-btn">Directions</span></div>
        <div className="pv-nav"><i className="on" /><i /><i /><i /><i /></div>
      </div>
      <div className="section-title">Mode</div>
      <div className="seg big" role="group" aria-label="Colour mode">
        {([['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['amoled', 'Black', 'moon'], ['system', 'Auto', 'settings']] as const).map(([k, l, i]) =>
          <button key={k} aria-pressed={prefs.mode === k} onClick={() => P('mode', k)}><Icon name={i} />{l}</button>)}
      </div>
      <div className="section-title">Accent colour</div>
      <div className="accent-grid">
        {ACCENTS.map(a => <button key={a.hex} className="accent" style={{ ['--sw' as any]: a.hex }} aria-pressed={prefs.accent.toLowerCase() === a.hex.toLowerCase()} onClick={() => P('accent', a.hex)}><i /><span>{a.name}</span></button>)}
        <label className="accent custom" style={{ ['--sw' as any]: isPreset ? '#888' : prefs.accent }}>
          <i><input type="color" value={prefs.accent} onChange={e => P('accent', e.target.value)} aria-label="Custom colour" /></i><span>Custom</span>
        </label>
      </div>
      <div className="section-title">Style</div>
      <div className="card">
        <div className="pref-row"><span>Surfaces</span><div className="seg">{(['glass', 'solid'] as const).map(k => <button key={k} aria-pressed={prefs.surface === k} onClick={() => P('surface', k)}>{k === 'glass' ? 'Glass' : 'Solid'}</button>)}</div></div>
        <div className="pref-row"><span>Corners</span><div className="seg">{([['crisp', 'Crisp'], ['round', 'Round'], ['soft', 'Soft']] as const).map(([k, l]) => <button key={k} aria-pressed={prefs.radius === k} onClick={() => P('radius', k)}>{l}</button>)}</div></div>
        <div className="pref-row"><span>Text size</span><div className="seg">{([[0.9, 'S'], [1, 'M'], [1.1, 'L'], [1.2, 'XL']] as const).map(([k, l]) => <button key={l} aria-pressed={prefs.textScale === k} onClick={() => P('textScale', k)}>{l}</button>)}</div></div>
        <div className="pref-row"><span>Map style</span><div className="seg">{([['auto', 'Auto'], ['streets', 'Streets'], ['satellite', 'Satellite'], ['dark', 'Night']] as const).map(([k, l]) => <button key={k} aria-pressed={prefs.mapStyle === k} onClick={() => P('mapStyle', k)}>{l}</button>)}</div></div>
        <label className="toggle-row"><span>3D buildings</span><input type="checkbox" role="switch" checked={prefs.buildings3d} onChange={e => P('buildings3d', e.target.checked)} /></label>
        <label className="toggle-row"><span>Reduce motion</span><input type="checkbox" role="switch" checked={prefs.reduceMotion} onChange={e => P('reduceMotion', e.target.checked)} /></label>
      </div>
      <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setPrefs({ mode: 'system', accent: ACCENTS[0].hex, surface: 'glass', radius: 'round', textScale: 1, mapStyle: 'auto', buildings3d: true, reduceMotion: false })}>Reset to default</button>
    </div>
  );
}

export function Profile() {
  const { user, authReady, role, saved, byId, toggleSaved, toast, select, goDirections } = useStore();
  const [aff, setAff] = useState<string>(''); const [notify, setNotify] = useState(true);
  const [delOpen, setDelOpen] = useState(false); const [delPw, setDelPw] = useState(''); const [delErr, setDelErr] = useState('');
  useEffect(() => {
    if (!user) return;
    db<any[]>('profiles', `select=affiliation,notify_announcements&user_id=eq.${user.id}`).then(r => { if (r[0]) { setAff(r[0].affiliation || ''); setNotify(r[0].notify_announcements); } }).catch(() => {});
  }, [user]);
  const savePref = async (patch: Record<string, unknown>) => {
    try { await db('profiles', `user_id=eq.${user!.id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' }); toast('Saved'); } catch (e: any) { toast(e.message, 'error'); }
  };
  const savedList = [...saved].map(id => byId.get(id)).filter(Boolean);
  const initials = (user?.name || user?.email || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="screen">
      <header className="page-head"><h1>Me</h1></header>
      {!authReady ? <p className="lede">Checking your session…</p> : user ? (
        <div className="profile-card">
          <div className="avatar">{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}><b>{user.name || 'Your account'}</b><div className="sub">{user.email}</div>
            {role !== 'user' && <span className="tag brand" style={{ marginTop: 4 }}><Icon name="shield" />{role === 'admin' ? 'Administrator' : role === 'editor' ? 'Editor' : 'Shuttle driver'}</span>}</div>
          <button className="icon-btn" aria-label="Sign out" onClick={() => signOut().then(() => toast('Signed out'))}><Icon name="logout" /></button>
        </div>
      ) : (
        <div className="hero-card">
          <h2>You're exploring as a guest</h2>
          <p>Create a free account to save your timetable and favourite places on every device.</p>
          <div className="row wrap"><a className="btn primary" href="#/register">Create account</a><a className="btn" href="#/login">Sign in</a></div>
        </div>
      )}
      <div className="menu-list">
        {(role === 'editor' || role === 'admin') && <a className="menu-item" href="#/admin"><span className="cat-ic"><Icon name="shield" /></span><b>Administration</b><Icon name="chevron" /></a>}
        <a className="menu-item" href="#/appearance"><span className="cat-ic"><Icon name="palette" /></span><b>Appearance</b><span className="sub">Theme, colour, map</span><Icon name="chevron" /></a>
        <a className="menu-item" href="#/schedule"><span className="cat-ic"><Icon name="calendar" /></span><b>My timetable</b><Icon name="chevron" /></a>
        <a className="menu-item" href="#/shuttles"><span className="cat-ic"><Icon name="bus" /></span><b>Shuttles{role === 'driver' ? ' · Driver mode' : ''}</b><Icon name="chevron" /></a>
        <InstallMenuItem />
        <a className="menu-item danger" href="#/emergency"><span className="cat-ic"><Icon name="sos" /></span><b>Emergency contacts</b><Icon name="chevron" /></a>
      </div>
      <div className="section-title">Saved places {user ? '' : '(this device)'}</div>
      {savedList.length === 0 ? <Empty icon="star" title="No saved places yet">Open a place on the map and tap Save.</Empty> : (
        <div className="list">
          {savedList.map(l => (
            <div key={l!.id} className="card row">
              <div style={{ minWidth: 0, flex: 1 }}><b>{l!.name}</b><div><VerificationTag v={l!.verification} /></div></div>
              <button className="icon-btn" aria-label={`Show ${l!.name} on map`} onClick={() => { select(l!.id); go('#/map'); }}><Icon name="pin" /></button>
              <button className="icon-btn" aria-label={`Directions to ${l!.name}`} onClick={() => goDirections(l!.id)}><Icon name="walk" /></button>
              <button className="icon-btn" aria-label={`Remove ${l!.name}`} onClick={() => toggleSaved(l!.id)}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      {user && (<>
        <div className="section-title">Preferences</div>
        <div className="card">
          <div className="pref-row"><span>I am a…</span>
            <select className="input" style={{ width: 'auto' }} value={aff} onChange={e => { setAff(e.target.value); savePref({ affiliation: e.target.value || null }); }} aria-label="Affiliation">
              <option value="">Prefer not to say</option><option value="student">Student</option><option value="staff">Staff</option><option value="visitor">Visitor</option><option value="other">Other</option>
            </select></div>
          <label className="toggle-row"><span>Unread badge for new announcements</span><input type="checkbox" role="switch" checked={notify} onChange={e => { setNotify(e.target.checked); savePref({ notify_announcements: e.target.checked }); }} /></label>
        </div>
      </>)}
      <div className="menu-list" style={{ marginTop: 12 }}>
        <a className="menu-item" href="#/about"><span className="cat-ic"><Icon name="info" /></span><b>About & privacy</b><Icon name="chevron" /></a>
        <a className="menu-item" href="#/report"><span className="cat-ic"><Icon name="flag" /></span><b>Report a problem</b><Icon name="chevron" /></a>
      </div>
      {user && (<>
        <div className="section-title">Account</div>
        {!delOpen ? <button className="btn danger" onClick={() => setDelOpen(true)}><Icon name="trash" />Delete my account</button> : (
          <div className="card">
            <p style={{ marginTop: 0 }}>This permanently deletes your account, timetable, saved places and preferences.</p>
            <Field label="Confirm with your password" type="password" value={delPw} onChange={e => setDelPw(e.target.value)} autoComplete="current-password" />
            {delErr && <p className="error-text">{delErr}</p>}
            <div className="row"><button className="btn danger" disabled={!delPw} onClick={() => deleteAccount(delPw).then(() => { toast('Account deleted'); go('#/map'); }).catch(e => setDelErr(e.message))}>Delete permanently</button><button className="btn ghost" onClick={() => setDelOpen(false)}>Cancel</button></div>
          </div>
        )}
      </>)}
    </div>
  );
}

export function Report({ params }: { params: URLSearchParams }) {
  const { user, byId, toast } = useStore();
  const [kind, setKind] = useState(params.get('kind') || 'wrong_info');
  const [msg, setMsg] = useState(params.get('text') ? `Missing place: ${params.get('text')}` : '');
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState('');
  const locId = params.get('location'); const annId = params.get('announcement');
  const loc = locId ? byId.get(locId) : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await db('reports', '', { method: 'POST', body: { kind, message: msg.trim(), location_id: locId || null, announcement_id: annId || null }, prefer: 'return=minimal' }); setDone(true); toast('Report sent — thank you'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="screen" style={{ maxWidth: 560 }}>
      <BackLink href="#/me" />
      <header className="page-head"><h1>Report a problem</h1><p className="lede">Reports go to the editors for review. They don't change information until checked.</p></header>
      {!user ? <Notice kind="info">Please <a href="#/login">sign in</a> to send a report — this helps prevent spam.</Notice> : done ? <Notice kind="info">Thanks — your report was recorded.</Notice> : (
        <form onSubmit={submit}>
          {loc && <p>About: <b>{loc.name}</b></p>}
          <div className="field"><label htmlFor="rk">Type</label>
            <select id="rk" className="input" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="wrong_location">Wrong building location</option><option value="wrong_info">Incorrect information</option>
              <option value="missing_place">Missing place</option><option value="route_issue">Route problem</option>
              <option value="accessibility">Accessibility info needs review</option><option value="broken_link">Broken link</option>
              <option value="outdated_announcement">Outdated announcement</option><option value="other">Other</option>
            </select></div>
          <div className="field"><label htmlFor="rm">Details</label><textarea id="rm" className="input" value={msg} onChange={e => setMsg(e.target.value)} minLength={5} maxLength={2000} required /></div>
          {err && <p className="error-text" role="alert">{err}</p>}
          <button className="btn primary" disabled={busy || msg.trim().length < 5}>{busy ? <span className="spinner" /> : 'Send report'}</button>
        </form>
      )}
    </div>
  );
}

export function About() {
  return (
    <div className="screen">
      <BackLink href="#/me" />
      <header className="page-head"><h1>About UG Navigator</h1><p className="lede">Map, walking directions, timetable, shuttles, campus guide and AI assistant for the University of Ghana, Legon community.</p></header>
      <div className="card"><h3>Where the data comes from</h3><p className="sub">Places are either <b>verified</b> by the app's editors, or imported from OpenStreetMap and clearly labelled unverified. University information links to its official source. Emergency numbers show the source they were checked against. This app is not an official University of Ghana service.</p></div>
      <div className="card"><h3>Maps & directions</h3><p className="sub">Vector maps © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors (ODbL). Satellite imagery © Esri. Walking routes by openrouteservice (HeiGIT). Route accessibility (stairs, ramps) is not verified.</p></div>
      <div className="card"><h3>Shuttle tracking</h3><p className="sub">Live shuttle positions come only from authorised drivers sharing their phone's GPS in this app. A shuttle not shown is simply not sharing.</p></div>
      <div className="card"><h3>Privacy</h3><p className="sub">Your location is used on your device and never stored, except for drivers who choose to share a vehicle's position. Your timetable and saved places are private to your account. Assistant questions are sent to an AI provider to generate answers and are not saved to your account.</p></div>
    </div>
  );
}

export function AccountRoute({ top, params }: { top: string; params: URLSearchParams }) {
  switch (top) {
    case 'login': return <Login />;
    case 'register': return <Register />;
    case 'forgot-password': return <ForgotPassword />;
    case 'reset-password': return <ResetPassword token={params.get('token')} />;
    case 'report': return <Report params={params} />;
    case 'about': return <About />;
    case 'appearance': return <Appearance />;
    default: return <Profile />;
  }
}
