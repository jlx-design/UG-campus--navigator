import React from 'react';
import { Icon } from './Icon';
import type { Location } from '../lib/types';

export function VerificationTag({ v }: { v: Location['verification'] }) {
  if (v === 'verified') return <span className="tag ok"><Icon name="shield" />Verified</span>;
  if (v === 'osm_imported') return <span className="tag warn" title="Imported from OpenStreetMap; not yet confirmed by the app's editors">OpenStreetMap · unverified</span>;
  return <span className="tag warn">Unverified</span>;
}

export function Notice({ kind = 'warn', children }: { kind?: 'warn' | 'info' | 'error'; children: React.ReactNode }) {
  return <div className={`notice ${kind === 'warn' ? '' : kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon name={kind === 'info' ? 'info' : 'alert'} /><div>{children}</div></div>;
}

export function Empty({ icon = 'info', title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return <div className="empty"><Icon name={icon} /><div style={{ fontWeight: 650, color: 'var(--text-2)' }}>{title}</div>{children && <div style={{ marginTop: 6, fontSize: 14 }}>{children}</div>}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="row" style={{ gap: 10, color: 'var(--text-3)', padding: 16 }} role="status"><span className="spinner" />{label}</div>;
}

export function SourceLink({ url, label, date }: { url: string | null; label?: string | null; date?: string | null }) {
  if (!url && !label) return null;
  return (
    <span className="sub" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      Source: {url ? <a href={url} target="_blank" rel="noopener noreferrer">{label || new URL(url).hostname}<Icon name="external" style={{ width: 12, height: 12, marginLeft: 3 }} /></a> : label}
      {date ? <> · updated {date}</> : null}
    </span>
  );
}

export function BackLink({ href, label = 'Back' }: { href: string; label?: string }) {
  return <a href={href} className="btn ghost small" style={{ marginLeft: -10, marginBottom: 6 }}><Icon name="arrowLeft" />{label}</a>;
}

export const go = (hash: string) => { location.hash = hash; };
