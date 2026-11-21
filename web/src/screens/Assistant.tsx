import React, { useEffect, useRef, useState } from 'react';
import { K } from '../lib/keys';
import { CAMPUS } from '../config';
import { track } from '../lib/track';
import { askAssistant } from '../lib/api';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { Notice, go } from '../components/common';
import type { AssistantSource } from '../lib/types';

interface Msg { role: 'user' | 'assistant'; content: string; sources?: AssistantSource[]; locationIds?: string[]; error?: boolean }

const KEY = K('chat');
const SUGGESTIONS = ['Where is the main library?', 'How do I get to my hall of residence?', 'What should I do after receiving admission?', 'Where can I find official registration information?'];

/** Renders [S1]-style citations as superscripts; everything else stays plain text (no HTML injection). */
function withCitations(text: string) {
  return text.split(/(\[S\d+\])/g).map((part, i) => /^\[S\d+\]$/.test(part) ? <sup key={i} style={{ color: 'var(--brand-2)', fontWeight: 700 }}>{part.slice(1, -1)}</sup> : <React.Fragment key={i}>{part}</React.Fragment>);
}

export function Assistant() {
  const { byId, select, goDirections } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { return []; } });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ } endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const send = async (text: string, history = msgs) => {
    const q = text.trim(); if (!q || busy) return;
    const next: Msg[] = [...history.filter(m => !m.error), { role: 'user', content: q.slice(0, 2000) }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      track('ai_question');
      const r = await askAssistant(next.map(m => ({ role: m.role, content: m.content })));
      setMsgs([...next, { role: 'assistant', content: r.answer, sources: r.sources, locationIds: r.location_ids }]);
    } catch (e: any) {
      setMsgs([...next, { role: 'assistant', content: e.message || 'Something went wrong.', error: true }]);
    } finally { setBusy(false); }
  };
  const retry = () => { const lastUser = [...msgs].reverse().find(m => m.role === 'user'); if (lastUser) send(lastUser.content, msgs.slice(0, msgs.lastIndexOf(lastUser))); };

  return (
    <div className="screen">
      <div className="row"><h1 style={{ flex: 1 }}>Assistant</h1>{msgs.length > 0 && <button className="btn small" onClick={() => { setMsgs([]); sessionStorage.removeItem(KEY); }}><Icon name="plus" />New chat</button>}</div>
      <p className="lede">Ask about places and university life. Answers about {CAMPUS.short} are based on the app’s verified records and cite their sources; when the app doesn’t know, it says so.</p>
      <div className="chat" aria-live="polite">
        {msgs.length === 0 && (
          <div className="list">
            {SUGGESTIONS.map(s => <button key={s} className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => send(s)}>{s}</button>)}
            <p className="hint">This conversation stays in this browser tab. Don’t share passwords or personal ID numbers.</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`} style={m.error ? { borderColor: 'var(--danger)' } : undefined}>
            {m.role === 'assistant' ? withCitations(m.content) : m.content}
            {m.error && <div style={{ marginTop: 8 }}><button className="btn small" onClick={retry}><Icon name="refresh" />Retry</button></div>}
            {!!m.locationIds?.length && (
              <div className="row wrap" style={{ marginTop: 10 }}>
                {m.locationIds.map(id => byId.get(id)).filter(Boolean).map(l => (
                  <React.Fragment key={l!.id}>
                    <button className="btn small" onClick={() => { select(l!.id); go('#/map'); }}><Icon name="pin" />{l!.name}</button>
                    <button className="btn small primary" onClick={() => goDirections(l!.id)}><Icon name="walk" />Directions</button>
                  </React.Fragment>
                ))}
              </div>
            )}
            {!!m.sources?.length && (
              <div className="srcs">
                {m.sources.map(s => (
                  <div key={s.id}><sup>{s.id.slice(1)}</sup> {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}
                    <span className="sub"> · {s.label || s.kind}{s.date ? ` · ${String(s.date).slice(0, 10)}` : ''}{s.kind === 'location' && s.verification !== 'verified' ? ' · unverified' : ''}{s.kind === 'resource' ? (s.official ? ' · official' : ' · general guidance') : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg bot"><span className="typing" aria-label="Assistant is typing"><i /><i /><i /></span></div>}
        <div ref={endRef} />
      </div>
      <form className="composer glass" onSubmit={e => { e.preventDefault(); send(input); }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} maxLength={2000} rows={1} placeholder="Ask a question…" aria-label="Your question"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="btn primary" disabled={busy || !input.trim()} aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  );
}
