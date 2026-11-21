import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { clearOffline, downloadCampusMap, offlineStatus } from '../lib/offline';

export function OfflineMapCard() {
  const [st, setSt] = useState<{ count: number; at: string | null } | null>(null);
  const [prog, setProg] = useState<[number, number] | null>(null); const [msg, setMsg] = useState('');
  const refresh = () => offlineStatus().then(setSt).catch(() => setSt({ count: 0, at: null }));
  useEffect(() => { refresh(); }, []);
  const go = async () => {
    setMsg(''); setProg([0, 1]);
    try { const r = await downloadCampusMap((d, t) => setProg([d, t])); setMsg(r.failed ? `Saved, but ${r.failed} pieces failed — try again on a better connection.` : 'Campus map saved for offline use.'); }
    catch (e: any) { setMsg(e.message || 'Download failed.'); } finally { setProg(null); refresh(); }
  };
  return (
    <div className="card offline-card">
      <div className="row"><span className="cat-ic"><Icon name="offline" /></span>
        <div style={{ flex: 1, minWidth: 0 }}><b>Offline campus map</b><div className="sub">{st?.at ? `Saved ${new Date(st.at).toLocaleDateString()} · ${st.count} files` : 'Use the map with no data — streets & night styles'}</div></div>
        {!prog && <button className="btn small primary" onClick={go}>{st?.at ? 'Update' : 'Download'}</button>}</div>
      {prog && <div className="progress" style={{ marginTop: 10 }} aria-label="Download progress"><i style={{ width: `${Math.round((prog[0] / Math.max(prog[1], 1)) * 100)}%` }} /></div>}
      {msg && <p className="sub" style={{ marginBottom: 0 }}>{msg}</p>}
      {st?.at && !prog && <button className="link-btn" style={{ marginTop: 6 }} onClick={() => clearOffline().then(refresh)}>Remove offline map</button>}
      <p className="hint" style={{ marginBottom: 0 }}>Satellite imagery, search and walking routes still need a connection.</p>
    </div>
  );
}
