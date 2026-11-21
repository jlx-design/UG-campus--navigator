import React from 'react';
import './lib/install'; // start listening for the install prompt before React mounts
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);

// Service worker: offline app shell + update handling. Never caches API, auth or tile responses.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            const bar = document.createElement('div');
            bar.className = 'toast glass'; bar.setAttribute('role', 'status');
            bar.innerHTML = 'A new version is available. <button class="btn small primary" style="margin-left:8px">Update</button>';
            bar.querySelector('button')!.onclick = () => { nw.postMessage('skipWaiting'); };
            document.body.appendChild(bar);
          }
        });
      });
    }).catch(() => { /* app works without SW */ });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  });
}
