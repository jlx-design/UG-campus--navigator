import React, { useEffect, useMemo, useState } from 'react';
import { track } from '../lib/track';
import { K } from '../lib/keys';
import { db } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { Empty, Loading, Notice } from '../components/common';
import { ScheduleTabs } from '../components/ScheduleTabs';
import { CAMPUS } from '../config';

// Grading scale comes from the campus config (campus/<id>.json), with its source.
type Grade = string;
export const GRADES = CAMPUS.grading.grades as unknown as { g: Grade; min: number; max: number; gp: number; label: string }[];
const GP: Record<string, number> = Object.fromEntries(GRADES.map(x => [x.g, x.gp]));
const CLASS_COLORS = ['#0f9d58', '#1a73e8', '#c8961e', '#ea580c', '#64748b', '#dc2626', '#dc2626'];
const CLASSES: [number, string, string][] = CAMPUS.grading.classes.map((c, i) => [c.min, c.name, CLASS_COLORS[i] || '#64748b']);
const classOf = (g: number) => CLASSES.find(([min]) => g >= min)!;
const SOURCE_URL = CAMPUS.grading.sourceUrl;
const MAXP = CAMPUS.grading.maxPoint;
// 'gpa' = letter grades → grade points (UG, UCC). 'cwa' = credit-weighted average of marks out of 100 (KNUST).
const CWA = (CAMPUS.grading.mode as string) === 'cwa';
const TERM = CWA ? 'CWA' : 'CGPA';
const letterFor = (mark: number) => (GRADES.find(x => mark >= x.min && mark <= x.max + 0.999) || GRADES[GRADES.length - 1]).g;
const LEVELS = ['100', '200', '300', '400', '500', '600', 'other'];
const LOCAL_KEY = K('gpa.v1');

interface Rec { id: string; level: string; semester: number; course_code: string; course_title: string | null; credits: number; grade: Grade; mark?: number | null }
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
function summarise(rs: Rec[]) {
  const credits = rs.reduce((a, r) => a + Number(r.credits), 0);
  const points = rs.reduce((a, r) => a + Number(r.credits) * (CWA ? Number(r.mark ?? 0) : GP[r.grade]), 0);
  return { credits, points, gpa: credits ? points / credits : NaN };
}
const semKey = (r: { level: string; semester: number }) => `${r.level}|${r.semester}`;
const semLabel = (k: string) => { const [l, s] = k.split('|'); return `${l === 'other' ? 'Other' : `Level ${l}`} · ${s === '3' ? 'Summer' : `Semester ${s}`}`; };

/** Storage: the account (RLS-protected) when signed in, this device otherwise. */
function useRecords() {
  const { user, toast } = useStore();
  const [rows, setRows] = useState<Rec[] | null>(null);
  const load = async () => {
    if (!user) { try { setRows(JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')); } catch { setRows([]); } return; }
    try { setRows(await db<Rec[]>('gpa_records', 'select=id,level,semester,course_code,course_title,credits,grade,mark&order=level.asc,semester.asc,created_at.asc')); }
    catch (e: any) { toast(e.message, 'error'); setRows([]); }
  };
  useEffect(() => { load(); }, [user?.id]);
  const saveLocal = (next: Rec[]) => { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); setRows(next); };
  const add = async (r: Omit<Rec, 'id'>) => {
    if (!user) return saveLocal([...(rows || []), { ...r, id: crypto.randomUUID() }]);
    await db('gpa_records', '', { method: 'POST', body: r, prefer: 'return=minimal' }); track('gpa_add'); load();
  };
  const update = async (id: string, patch: Partial<Rec>) => {
    if (!user) return saveLocal((rows || []).map(x => (x.id === id ? { ...x, ...patch } : x)));
    await db('gpa_records', `id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' }); load();
  };
  const remove = async (id: string) => {
    if (!user) return saveLocal((rows || []).filter(x => x.id !== id));
    await db('gpa_records', `id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }); load();
  };
  // Move guest entries into the account after sign-in.
  const localCount = (() => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]').length; } catch { return 0; } })();
  const importLocal = async () => {
    const local: Rec[] = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    await db('gpa_records', '', { method: 'POST', body: local.map(({ id, ...r }) => r), prefer: 'return=minimal' });
    localStorage.removeItem(LOCAL_KEY); load(); toast(`Moved ${local.length} course(s) to your account`);
  };
  return { rows, add, update, remove, user, localCount, importLocal };
}

export function Gpa() {
  const { rows, add, update, remove, user, localCount, importLocal } = useRecords();
  const { toast } = useStore();
  const [adding, setAdding] = useState<{ level: string; semester: number } | null>(null);
  const [draft, setDraft] = useState({ course_code: '', course_title: '', credits: '3', grade: GRADES[0].g as Grade, mark: '' });
  const [target, setTarget] = useState(CLASSES[0][0].toFixed(2)); const [nextCredits, setNextCredits] = useState('18');
  const [showScale, setShowScale] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, Rec[]>();
    for (const r of rows || []) { const k = semKey(r); m.set(k, [...(m.get(k) || []), r]); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [rows]);
  const all = summarise(rows || []);
  const cls = Number.isFinite(all.gpa) ? classOf(all.gpa) : null;

  // What-if: GPA needed over the next N credits to reach a target CGPA.
  const t = Number(target), n = Number(nextCredits);
  const needed = n > 0 && Number.isFinite(t) ? (t * (all.credits + n) - all.points) / n : NaN;

  const startAdd = (level: string, semester: number) => { setAdding({ level, semester }); setDraft({ course_code: '', course_title: '', credits: '3', grade: GRADES[0].g, mark: '' }); };
  const submit = async () => {
    const code = draft.course_code.trim().toUpperCase(); const cr = Number(draft.credits);
    if (!code) return toast('Enter the course code', 'error');
    if (!(cr > 0 && cr <= 12)) return toast('Credits must be between 0.5 and 12', 'error');
    const mk = Number(draft.mark); if (CWA && (draft.mark === '' || !(mk >= 0 && mk <= 100))) return toast('Enter a mark between 0 and 100', 'error');
    try { await add({ level: adding!.level, semester: adding!.semester, course_code: code, course_title: draft.course_title.trim() || null, credits: cr, grade: CWA ? letterFor(mk) : draft.grade, ...(CWA ? { mark: mk } : {}) }); setDraft({ ...draft, course_code: '', course_title: '', mark: '' }); toast(`${code} added`); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  const nextSem = () => {
    if (!groups.length) return { level: '100', semester: 1 };
    const [l, s] = groups[groups.length - 1][0].split('|');
    return s === '1' ? { level: l, semester: 2 } : { level: l === 'other' ? 'other' : String(Math.min(600, Number(l) + 100)), semester: 1 };
  };

  return (
    <div className="screen">
      <header className="page-head"><h1>{CWA ? 'CWA calculator' : 'GPA calculator'}</h1><p className="lede">Track every semester and see your {TERM} and class of degree, using the {CAMPUS.university} {CWA ? 'cumulative weighted average (marks out of 100)' : `${MAXP}.0 scale`}.</p></header>
      <ScheduleTabs active="gpa" />
      {!(CAMPUS.grading as any).verified && <Notice>This grading scale comes from {CAMPUS.grading.sourceLabel}. It hasn't been confirmed against an official {CAMPUS.short} document yet, so treat your result as an estimate and check your programme handbook.</Notice>}

      <div className="gpa-hero" style={{ ['--c' as any]: cls?.[2] || 'var(--accent)' }}>
        <div className="gpa-ring" style={{ ['--p' as any]: Number.isFinite(all.gpa) ? all.gpa / MAXP : 0 }}>
          <div><b>{fmt(all.gpa)}</b><span>{TERM}</span></div>
        </div>
        <div className="gpa-meta">
          {cls ? <span className="gpa-class">{cls[1]}</span> : <span className="gpa-class muted">No grades yet</span>}
          <div>{all.credits} credits · {groups.length} semester{groups.length === 1 ? '' : 's'}</div>
          <div className="sub-on">{user ? 'Saved to your account' : 'Saved on this device — sign in to keep it everywhere'}</div>
        </div>
      </div>

      {user && localCount > 0 && <Notice kind="info">You have {localCount} course(s) saved on this device from before you signed in. <button className="btn small" onClick={importLocal}>Move to my account</button></Notice>}

      {!rows ? <Loading /> : groups.length === 0 ? (
        <Empty icon="calc" title="Add your first semester">Enter each course's code, credit hours and grade. Your GPA updates instantly.</Empty>
      ) : groups.map(([k, rs]) => {
        const s = summarise(rs); const [level, sem] = k.split('|');
        return (
          <section key={k} className="sem-card">
            <div className="row"><h3 style={{ flex: 1, margin: 0 }}>{semLabel(k)}</h3><span className="sem-gpa">{CWA ? 'WA' : 'GPA'} {fmt(s.gpa)}</span></div>
            <div className="sub">{s.credits} credits · {s.points.toFixed(1)} {CWA ? 'weighted marks' : 'grade points'}</div>
            <ul className="gpa-list">
              {rs.map(r => (
                <li key={r.id}>
                  <div style={{ flex: 1, minWidth: 0 }}><b>{r.course_code}</b>{r.course_title && <div className="sub ellipsis">{r.course_title}</div>}</div>
                  <span className="sub">{Number(r.credits)} cr</span>
                  {CWA ? <input className="grade-sel mark-in" type="number" inputMode="decimal" min={0} max={100} defaultValue={r.mark ?? ''} aria-label={`Mark for ${r.course_code}`}
                    onBlur={e => { const m = Number(e.target.value); if (e.target.value !== '' && m >= 0 && m <= 100 && m !== Number(r.mark)) update(r.id, { mark: m, grade: letterFor(m) }).catch(err => toast(err.message, 'error')); }} /> :
                  <select className={`grade-sel g-${r.grade.replace('+', 'p').replace('-', 'm')}`} value={r.grade} aria-label={`Grade for ${r.course_code}`} onChange={e => update(r.id, { grade: e.target.value as Grade }).catch(err => toast(err.message, 'error'))}>
                    {GRADES.map(x => <option key={x.g} value={x.g}>{x.g}</option>)}
                  </select>}
                  <button className="icon-btn sm" aria-label={`Remove ${r.course_code}`} onClick={() => remove(r.id).catch(err => toast(err.message, 'error'))}><Icon name="trash" /></button>
                </li>
              ))}
            </ul>
            <button className="link-btn" onClick={() => startAdd(level, Number(sem))}><Icon name="plus" style={{ width: 14, verticalAlign: -2 }} /> Add course</button>
          </section>
        );
      })}
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => { const ns = nextSem(); startAdd(ns.level, ns.semester); }}><Icon name="plus" />Add a semester</button>

      {adding && (
        <div className="modal-back" onClick={() => setAdding(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Add course grade" onClick={e => e.stopPropagation()}>
            <h2>Add course</h2>
            <div className="row wrap">
              <div className="field"><label>Level</label><select className="input" value={adding.level} onChange={e => setAdding({ ...adding, level: e.target.value })}>{LEVELS.map(l => <option key={l} value={l}>{l === 'other' ? 'Other' : `Level ${l}`}</option>)}</select></div>
              <div className="field"><label>Semester</label><select className="input" value={adding.semester} onChange={e => setAdding({ ...adding, semester: Number(e.target.value) })}><option value={1}>Semester 1</option><option value={2}>Semester 2</option><option value={3}>Summer</option></select></div>
            </div>
            <div className="row wrap">
              <div className="field"><label>Course code</label><input className="input" placeholder="e.g. UGRC 110" value={draft.course_code} onChange={e => setDraft({ ...draft, course_code: e.target.value })} autoCapitalize="characters" /></div>
              <div className="field" style={{ maxWidth: 110 }}><label>Credits</label><input className="input" type="number" inputMode="decimal" min={0.5} max={12} step={0.5} value={draft.credits} onChange={e => setDraft({ ...draft, credits: e.target.value })} /></div>
            </div>
            <div className="field"><label>Course title (optional)</label><input className="input" value={draft.course_title} onChange={e => setDraft({ ...draft, course_title: e.target.value })} /></div>
            {CWA ? <div className="field"><label>Mark (%)</label><input className="input" type="number" inputMode="decimal" min={0} max={100} step={0.01} value={draft.mark} onChange={e => setDraft({ ...draft, mark: e.target.value })} placeholder="e.g. 68" /></div> :
            <div className="field"><label>Grade</label>
              <div className="grade-grid">{GRADES.map(x => <button key={x.g} type="button" className={`g-${x.g.replace('+', 'p').replace('-', 'm')}`} aria-pressed={draft.grade === x.g} onClick={() => setDraft({ ...draft, grade: x.g })}><b>{x.g}</b><span>{x.min}–{x.max}</span></button>)}</div>
            </div>}
            <div className="row"><button className="btn primary" style={{ flex: 1 }} onClick={submit}>Add</button><button className="btn" onClick={() => setAdding(null)}>Done</button></div>
          </div>
        </div>
      )}

      <div className="section-title">What do I need?</div>
      <div className="card">
        <div className="row wrap">
          <div className="field"><label>Target {TERM}</label><input className="input" type="number" inputMode="decimal" min={0} max={MAXP} step={CWA ? 0.1 : 0.01} value={target} onChange={e => setTarget(e.target.value)} /></div>
          <div className="field"><label>Credits still to take</label><input className="input" type="number" inputMode="numeric" min={1} max={200} value={nextCredits} onChange={e => setNextCredits(e.target.value)} /></div>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: -4, marginBottom: 10 }}>{CLASSES.slice(0, 4).map(([min, name]) => <button key={name} className="chip" style={{ height: 30, border: '1px solid var(--line)' }} aria-pressed={Number(target) === min} onClick={() => setTarget(min.toFixed(2))}>{name.replace('Second Class', '2nd')}</button>)}</div>
        {!Number.isFinite(needed) ? <p className="sub">Enter a target and the credits you still have to take.</p>
          : needed > MAXP ? <p className="whatif bad">To reach <b>{Number(target).toFixed(2)}</b> you'd need more than a {MAXP.toFixed(2)} average over the next {n} credits — not possible in that many credits.</p>
          : needed <= 0 ? <p className="whatif good">You're already above <b>{Number(target).toFixed(2)}</b>. Even a 0.00 average over the next {n} credits keeps you there.</p>
          : <p className="whatif">You need an average of <b>{needed.toFixed(2)}</b> {CWA ? '' : <>(roughly <b>{([...GRADES].reverse().find(x => x.gp >= needed - 1e-9) || GRADES[0]).g}</b> or better in each course)</>} over your next {n} credits to finish on <b>{Number(target).toFixed(2)}</b>.</p>}
      </div>

      <button className="link-btn" style={{ marginTop: 16 }} onClick={() => setShowScale(v => !v)}>{showScale ? 'Hide' : 'Show'} the grading scale</button>
      {showScale && (
        <div className="card" style={{ marginTop: 8 }}>
          <table className="table"><thead><tr><th>Grade</th><th>Marks</th>{!CWA && <th>Points</th>}<th>Meaning</th></tr></thead>
            <tbody>{GRADES.map(x => <tr key={x.g}><td><b>{x.g}</b></td><td>{x.min}–{x.max}</td>{!CWA && <td>{x.gp.toFixed(1)}</td>}<td>{x.label}</td></tr>)}</tbody></table>
          <p className="sub" style={{ marginTop: 10 }}>Class of degree (final {CWA ? 'CWA' : 'GPA'}): {CLASSES.filter(c => c[0] > 0).map(([min, name], i, arr) => `${name} ${min.toFixed(2)}${i === 0 ? `–${MAXP.toFixed(2)}` : `–${(arr[i - 1][0] - 0.01).toFixed(2)}`}`).join(' · ')}.</p>
          <p className="hint">{CWA ? 'CWA = Σ(credits × mark) ÷ Σ credits.' : 'GPA = Σ(credits × grade points) ÷ Σ credits.'} {CWA ? 'Scale' : 'Grade points'} from the <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{CAMPUS.grading.sourceLabel}</a>; class boundaries as widely published for {CAMPUS.university}. Your official result is always the one on the {CAMPUS.short} student portal — check your programme's handbook for rules on resits and courses that don't count.</p>
        </div>
      )}
    </div>
  );
}
