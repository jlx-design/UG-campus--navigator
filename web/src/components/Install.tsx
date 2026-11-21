import React, { useEffect, useState } from 'react';
import { APP_NAME } from '../config';
import { Icon } from './Icon';
import { canPrompt, installAvailable, isIOS, isIOSNonSafari, isStandalone, onInstallChange, promptInstall } from '../lib/install';

const DISMISS_KEY = 'ugnav.install.dismissed';
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

export function useInstall() {
  const [, bump] = useState(0);
  useEffect(() => onInstallChange(() => bump(n => n + 1)), []);
  return { available: installAvailable(), standalone: isStandalone(), native: canPrompt(), ios: isIOS() };
}

/** Steps for iPhone/iPad, where Safari has no install prompt. */
export function IOSInstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal install-sheet" role="dialog" aria-modal="true" aria-labelledby="ios-inst" onClick={e => e.stopPropagation()}>
        <div className="row"><h2 id="ios-inst" style={{ flex: 1, margin: 0 }}>Add to Home Screen</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        {isIOSNonSafari() && <p className="notice info">On iPhone, open this page in <b>Safari</b> first — other browsers can’t add apps to the Home Screen.</p>}
        <ol className="install-steps">
          <li><span className="n">1</span>Tap the <b>Share</b> button <span className="kbd"><Icon name="share" /></span> in Safari’s toolbar.</li>
          <li><span className="n">2</span>Scroll down and tap <b>Add to Home Screen</b> <span className="kbd"><Icon name="plusSquare" /></span>.</li>
          <li><span className="n">3</span>Tap <b>Add</b>. {APP_NAME} opens full-screen like a normal app.</li>
        </ol>
        <button className="btn primary block" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/** Starts the install: native prompt on Android/Chrome/Edge, instructions on iOS. */
export function useInstallAction() {
  const [ios, setIos] = useState(false);
  const run = async () => {
    if (canPrompt()) return promptInstall();
    if (isIOS()) { setIos(true); return 'dismissed'; }
    return 'unavailable';
  };
  const sheet = ios ? <IOSInstallSheet onClose={() => setIos(false)} /> : null;
  return { run, sheet };
}

/** Floating banner on the map, shown once the person has been using the app for a bit. */
export function InstallBanner() {
  const { available } = useInstall();
  const { run, sheet } = useInstallAction();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!available) { setShow(false); return; }
    let snoozed = false; try { snoozed = Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < SNOOZE_MS; } catch { /* ignore */ }
    if (snoozed) return;
    const t = setTimeout(() => setShow(true), 12000);
    return () => clearTimeout(t);
  }, [available]);
  const dismiss = () => { setShow(false); try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } };
  if (!show && !sheet) return null;
  return (
    <>
      {show && (
        <div className="install-banner glass" role="dialog" aria-label={`Install ${APP_NAME}`}>
          <img src="./icons/icon-192.png" alt="" width={44} height={44} />
          <div style={{ flex: 1, minWidth: 0 }}><b>Add {APP_NAME} to your home screen</b><span>Opens full-screen, faster, works offline.</span></div>
          <button className="btn primary small" onClick={async () => { const r = await run(); if (r !== 'unavailable') setShow(false); }}>{isIOS() ? 'How' : 'Install'}</button>
          <button className="icon-btn sm" onClick={dismiss} aria-label="Not now"><Icon name="close" /></button>
        </div>
      )}
      {sheet}
    </>
  );
}

/** Row for the Me screen menu. */
export function InstallMenuItem() {
  const { available, standalone } = useInstall();
  const { run, sheet } = useInstallAction();
  if (standalone) return <div className="menu-item"><span className="cat-ic"><Icon name="check" /></span><b>Installed on this device</b></div>;
  return (
    <>
      <button className="menu-item as-btn" onClick={() => run().then(r => { if (r === 'unavailable') alertHowTo(); })}>
        <span className="cat-ic"><Icon name="download" /></span><b>Add to home screen</b><span className="sub">{available ? 'Install the app' : 'From browser menu'}</span><Icon name="chevron" />
      </button>
      {sheet}
    </>
  );
}

function alertHowTo() {
  const el = document.createElement('div'); el.className = 'toast glass'; el.setAttribute('role', 'status');
  el.textContent = 'Open your browser menu (⋮) and choose “Install app” or “Add to Home screen”.';
  document.body.appendChild(el); setTimeout(() => el.remove(), 6000);
}
