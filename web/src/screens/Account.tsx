import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { db } from '../lib/api';
import { deleteAccount, requestPasswordReset, resetPassword, signIn, signOut, signUp } from '../lib/auth';
import { Icon } from '../components/Icon';
import { BackLink, Empty, Notice, VerificationTag, go } from '../components/common';

function Field({ label, hint, ...p }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = React.useId();
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} className="input" {...p} />{hint && <span className="hint">{hint}</span>}</div>;
}

export function Login() {
  const { user } = useStore();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (user) go('#/profile'); }, [user]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await signIn(email.trim(), pw); go('#/profile'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="screen" style={{ maxWidth: 440 }}>
      <BackLink href="#/profile" />
      <h1>Sign in</h1>
      <p className="lede">Sync saved places, checklist progress and preferences across devices. Exploring the map never requires an account.</p>
      <form onSubmit={submit} noValidate>
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Field label="Password" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required />
        {err && <p className="error-text" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy || !email || !pw}>{busy ? <span className="spinner" /> : 'Sign in'}</button>
      </form>
      <div className="row wrap" style={{ marginTop: 16, justifyContent: 'space-between' }}>
        <a href="#/forgot-password">Forgot password?</a><a href="#/register">Create an account</a>
      </div>
    </div>
  );
}

export function Register() {
  const { user } = useStore();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  useEffect(() => { if (user && !done) go('#/profile'); }, [user]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw.length < 8) { setErr('Use at least 8 characters for your password.'); return; }
    setBusy(true);
    try { const u = await signUp(name.trim(), email.trim(), pw); if (u) go('#/profile'); else setDone(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="screen" style={{ maxWidth: 440 }}>
      <BackLink href="#/login" />
      <h1>Create account</h1>
      <p className="lede">We only ask for what’s needed to run your account. An account does not verify university membership.</p>
      {done ? <Notice kind="info">Account created. If email verification is enabled, check your inbox for a link, then sign in.</Notice> : (
        <form onSubmit={submit} noValidate>
          <Field label="Name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={80} required />
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Field label="Password" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} hint="At least 8 characters." required />
          {err && <p className="error-text" role="alert">{err}</p>}
          <button className="btn primary block" disabled={busy || !name || !email || !pw}>{busy ? <span className="spinner" /> : 'Create account'}</button>
        </form>
      )}
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [sent, setSent] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { await requestPasswordReset(email.trim()); setSent(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="screen" style={{ maxWidth: 440 }}>
      <BackLink href="#/login" />
      <h1>Reset password</h1>
      {sent ? <Notice kind="info">If an account exists for {email}, a reset link is on its way. The link opens this app to set a new password.</Notice> : (
        <form onSubmit={submit}>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
          {err && <p className="error-text" role="alert">{err}</p>}
          <button className="btn primary block" disabled={busy || !email}>{busy ? <span className="spinner" /> : 'Send reset link'}</button>
        </form>
      )}
    </div>
  );
}

export function ResetPassword({ token }: { token: string | null }) {
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!token) return; if (pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    setBusy(true); setErr(''); try { await resetPassword(token, pw); setOk(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="screen" style={{ maxWidth: 440 }}>
      <h1>Choose a new password</h1>
      {!token && <Notice kind="error">This reset link is missing its token. Request a new link.</Notice>}
      {ok ? <><Notice kind="info">Password updated.</Notice><a className="btn primary" style={{ marginTop: 12 }} href="#/login">Sign in</a></> : token && (
        <form onSubmit={submit}>
          <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required />
          {err && <p className="error-text" role="alert">{err}</p>}
          <button className="btn primary block" disabled={busy || !pw}>{busy ? <span className="spinner" /> : 'Update password'}</button>
        </form>
      )}
    </div>
  );
}

export function Profile() {
  const { user, authReady, role, saved, byId, toggleSaved, theme, setTheme, toast, select, setDestId, setRoute } = useStore();
  const [aff, setAff] = useState<string>(''); const [notify, setNotify] = useState(true);
  const [delOpen, setDelOpen] = useState(false); const [delPw, setDelPw] = useState(''); const [delErr, setDelErr] = useState('');

  useEffect(() => {
    if (!user) return;
    db<any[]>('profiles', `select=affiliation,notify_announcements&user_id=eq.${user.id}`).then(r => { if (r[0]) { setAff(r[0].affiliation || ''); setNotify(r[0].notify_announcements); } }).catch(() => {});
  }, [user]);
  const savePref = async (patch: Record<string, unknown>) => {
    try { await db('profiles', `user_id=eq.${user!.id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' }); toast('Preferences saved'); } catch (e: any) { toast(e.message, 'error'); }
  };
  const savedList = [...saved].map(id => byId.get(id)).filter(Boolean);

  return (
    <div className="screen">
      <h1>Profile</h1>
      {!authReady ? <p className="lede">Checking your session…</p> : user ? (
        <div className="card row">
          <div className="brandmark"><span className="logo"><Icon name="user" /></span></div>
          <div style={{ minWidth: 0 }}><b>{user.name || 'Your account'}</b><div className="sub">{user.email}{!user.emailVerified ? ' · email not verified' : ''}{role !== 'user' ? ` · ${role}` : ''}</div></div>
          <span className="spacer" />
          <button className="btn small" onClick={() => signOut().then(() => toast('Signed out'))}><Icon name="logout" />Sign out</button>
        </div>
      ) : (
        <div className="card">
          <b>You’re browsing as a guest</b>
          <p className="sub" style={{ margin: '6px 0 12px' }}>Everything public works without an account. Sign in to sync saved places and checklist progress across devices.</p>
          <div className="row wrap"><a className="btn primary" href="#/login">Sign in</a><a className="btn" href="#/register">Create account</a></div>
        </div>
      )}

      {(role === 'editor' || role === 'admin') && <a className="card row" href="#/admin" style={{ textDecoration: 'none', color: 'inherit', marginTop: 10 }}><Icon name="shield" style={{ width: 20, color: 'var(--brand)' }} /><b>Administration</b><span className="spacer" /><Icon name="chevron" style={{ width: 18 }} /></a>}

      <div className="section-title">Saved places {user ? '' : '(this device only)'}</div>
      {savedList.length === 0 ? <Empty icon="star" title="No saved places yet">Open a place on the map and tap Save.</Empty> : (
        <div className="list">
          {savedList.map(l => (
            <div key={l!.id} className="card row">
              <div style={{ minWidth: 0, flex: 1 }}><b>{l!.name}</b><div><VerificationTag v={l!.verification} /></div></div>
              <button className="icon-btn" aria-label={`Show ${l!.name} on map`} onClick={() => { select(l!.id); go('#/explore'); }}><Icon name="pin" /></button>
              <button className="icon-btn" aria-label={`Directions to ${l!.name}`} onClick={() => { setRoute(null); setDestId(l!.id); go('#/navigate'); }}><Icon name="walk" /></button>
              <button className="icon-btn" aria-label={`Remove ${l!.name}`} onClick={() => toggleSaved(l!.id)}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="section-title">Settings</div>
      <div className="card">
        <div className="row wrap"><b style={{ flex: 1 }}>Theme</b>
          <div className="seg" role="group" aria-label="Theme">
            {(['light', 'dark', 'system'] as const).map(t => <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
        </div>
        {user && (
          <>
            <div className="row wrap" style={{ marginTop: 14 }}><b style={{ flex: 1 }}>I am a…</b>
              <select className="input" style={{ width: 'auto' }} value={aff} onChange={e => { setAff(e.target.value); savePref({ affiliation: e.target.value || null }); }} aria-label="Affiliation">
                <option value="">Prefer not to say</option><option value="student">Student</option><option value="staff">Staff</option><option value="visitor">Visitor</option><option value="other">Other</option>
              </select>
            </div>
            <label className="row" style={{ marginTop: 14 }}><b style={{ flex: 1 }}>Show unread badge for new announcements</b>
              <input type="checkbox" checked={notify} onChange={e => { setNotify(e.target.checked); savePref({ notify_announcements: e.target.checked }); }} style={{ width: 22, height: 22 }} />
            </label>
          </>
        )}
      </div>

      <div className="section-title">About</div>
      <div className="list">
        <a className="card row" href="#/about" style={{ textDecoration: 'none', color: 'inherit' }}><Icon name="info" style={{ width: 20 }} /><b>About & help</b><span className="spacer" /><Icon name="chevron" style={{ width: 18 }} /></a>
        <a className="card row" href="#/report" style={{ textDecoration: 'none', color: 'inherit' }}><Icon name="flag" style={{ width: 20 }} /><b>Report a problem</b><span className="spacer" /><Icon name="chevron" style={{ width: 18 }} /></a>
      </div>

      {user && (
        <>
          <div className="section-title">Danger zone</div>
          {!delOpen ? <button className="btn danger" onClick={() => setDelOpen(true)}><Icon name="trash" />Delete my account</button> : (
            <div className="card">
              <p style={{ marginTop: 0 }}>This permanently deletes your account, saved places, checklist progress and preferences.</p>
              <Field label="Confirm with your password" type="password" value={delPw} onChange={e => setDelPw(e.target.value)} autoComplete="current-password" />
              {delErr && <p className="error-text">{delErr}</p>}
              <div className="row"><button className="btn danger" disabled={!delPw} onClick={() => deleteAccount(delPw).then(() => { toast('Account deleted'); go('#/explore'); }).catch(e => setDelErr(e.message))}>Delete permanently</button><button className="btn ghost" onClick={() => setDelOpen(false)}>Cancel</button></div>
            </div>
          )}
        </>
      )}
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
      <BackLink href="#/explore" />
      <h1>Report a problem</h1>
      <p className="lede">Reports go to the app’s editors for review. They don’t change official information until checked.</p>
      {!user ? <Notice kind="info">Please <a href="#/login">sign in</a> to send a report — this helps prevent spam.</Notice> : done ? <Notice kind="info">Thanks — your report was recorded. You can send another any time.</Notice> : (
        <form onSubmit={submit}>
          {loc && <p>About: <b>{loc.name}</b></p>}
          <div className="field"><label htmlFor="rk">Type</label>
            <select id="rk" className="input" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="wrong_location">Wrong building location</option><option value="wrong_info">Incorrect place information</option>
              <option value="missing_place">Missing place</option><option value="route_issue">Route problem</option>
              <option value="accessibility">Accessibility info needs review</option><option value="broken_link">Broken link</option>
              <option value="outdated_announcement">Outdated announcement</option><option value="other">Other</option>
            </select>
          </div>
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
      <BackLink href="#/profile" />
      <h1>About UG Campus Navigator</h1>
      <p className="lede">A campus map, walking directions, fresher guide and assistant for the University of Ghana, Legon community.</p>
      <div className="card"><h3>Where the data comes from</h3>
        <p className="sub">Places are either <b>verified</b> by the app’s editors, or imported from <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> and clearly labelled as unverified. University information is linked to its official source. This app is not an official University of Ghana service.</p></div>
      <div className="card"><h3>Walking directions</h3><p className="sub">Routes come from openrouteservice’s pedestrian profile on OpenStreetMap paths. Accessibility of routes (stairs, ramps) is not verified. Live guidance uses your device’s GPS and only while you are navigating.</p></div>
      <div className="card"><h3>Privacy</h3><p className="sub">Location is requested only when you use location features and isn’t stored on our servers. Assistant questions are sent to an AI provider to generate answers and are not saved to your account. Guest favourites stay on your device.</p></div>
      <div className="card"><h3>Offline</h3><p className="sub">The app shell opens offline once installed. Map tiles, search, routing and the assistant need an internet connection.</p></div>
      <p className="hint" style={{ marginTop: 16 }}>Map data © OpenStreetMap contributors (ODbL). Routing © openrouteservice.org by HeiGIT.</p>
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
    default: return <Profile />;
  }
}
