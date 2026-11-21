import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useStore } from '../store';
import { db, fn } from '../lib/api';
import { currentSubscription, disablePush, enablePush, pushSupported, isIOSBrowserTab } from '../lib/push';

export function ScheduleTabs({ active }: { active: 'timetable' | 'exams' | 'gpa' }) {
  const tabs: [string, string, string, string][] = [['timetable', '#/schedule', 'Timetable', 'calendar'], ['exams', '#/schedule/exams', 'Exams', 'event'], ['gpa', '#/gpa', 'GPA', 'calc']];
  return <nav className="sched-tabs" aria-label="Schedule sections">{tabs.map(([k, h, l, i]) => <a key={k} href={h} aria-current={active === k ? 'page' : undefined}><Icon name={i} />{l}</a>)}</nav>;
}

/** Push reminders for classes and exams (server sends them; works when the app is closed). */
export function RemindersCard() {
  const { user, toast } = useStore();
  const [on, setOn] = useState<boolean | null>(null); const [busy, setBusy] = useState(false);
  const [p, setP] = useState<{ remind_classes: boolean; remind_exams: boolean; remind_lead_min: number } | null>(null);
  useEffect(() => { currentSubscription().then(s => setOn(!!s)).catch(() => setOn(false)); }, []);
  useEffect(() => { if (user) db<any[]>('profiles', `select=remind_classes,remind_exams,remind_lead_min&user_id=eq.${user.id}`).then(r => setP(r[0] || null)).catch(() => {}); }, [user?.id]);
  if (!user) return null;
  const save = (patch: Partial<NonNullable<typeof p>>) => { setP(x => x && { ...x, ...patch }); db('profiles', `user_id=eq.${user.id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' }).catch(e => toast(e.message, 'error')); };
  const toggle = async () => {
    setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); toast('Reminders turned off on this device'); }
      else {
        const r = await enablePush();
        if (r === 'ok') { setOn(true); toast('Reminders on — sending a test…'); fn('/push/test', {}).catch(() => {}); }
        else if (r === 'denied') toast('Notifications are blocked. Allow them for this site in your browser settings.', 'error');
        else if (r === 'ios-install') toast('On iPhone, first add the app to your Home Screen, then turn on reminders from there.', 'error');
        else toast('This browser cannot receive notifications.', 'error');
      }
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="card reminders">
      <div className="row"><span className="cat-ic"><Icon name="bellRing" /></span><div style={{ flex: 1, minWidth: 0 }}><b>Class & exam reminders</b><div className="sub">{on ? 'On for this device' : pushSupported() || isIOSBrowserTab() ? 'Get a notification before each class and exam' : 'Not supported in this browser'}</div></div>
        <input type="checkbox" role="switch" aria-label="Reminders on this device" checked={!!on} disabled={busy || on === null} onChange={toggle} /></div>
      {on && p && (
        <div className="rem-opts">
          <div className="pref-row"><span>Remind me</span><div className="seg">{[10, 15, 30, 60].map(m => <button key={m} aria-pressed={p.remind_lead_min === m} onClick={() => save({ remind_lead_min: m })}>{m} min</button>)}</div></div>
          <label className="toggle-row"><span>Classes</span><input type="checkbox" role="switch" checked={p.remind_classes} onChange={e => save({ remind_classes: e.target.checked })} /></label>
          <label className="toggle-row"><span>Exams (day before + before start)</span><input type="checkbox" role="switch" checked={p.remind_exams} onChange={e => save({ remind_exams: e.target.checked })} /></label>
        </div>
      )}
    </div>
  );
}
