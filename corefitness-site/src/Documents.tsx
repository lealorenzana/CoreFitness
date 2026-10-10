import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface AppDocument {
  id: string; kind: string; label: string; path: string; file_name: string | null; expires_on: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'replaced'; reason: string | null; uploaded_at: string;
}
interface Kind { kind: string; label: string; needs_expiry: boolean; sort_order: number }

const day = (v: string) => { const [y, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }); };
/** Manila's date, never the UTC one (it is yesterday for the first eight hours of each day). */
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const STATUS: Record<string, string> = { pending: 'Sent — we are checking it', verified: 'Verified', rejected: 'Not accepted' };

/**
 * The six documents a gym sends before it is let in (0187): each one's newest
 * copy and what we made of it, and a place to send it — or a corrected one.
 * Files go to a private bucket under the application's own folder; the
 * database decides who may put them there, never this page.
 */
export default function Documents({ applicationId, documents, onChanged, locked }: {
  applicationId: string; documents: AppDocument[]; onChanged: () => Promise<void> | void; locked?: boolean;
}) {
  const [kinds, setKinds] = useState<Kind[] | null>(null);
  useEffect(() => {
    void (async () => {
      if (!supabase) { setKinds([]); return; }
      const { data } = await supabase.rpc('application_document_kinds');
      setKinds(((data ?? []) as Kind[]).sort((a, b) => a.sort_order - b.sort_order));
    })();
  }, []);
  if (!kinds) return null;
  const latest = (k: string) => documents.find((d) => d.kind === k && d.status !== 'replaced') ?? null;
  const verified = kinds.filter((k) => latest(k.kind)?.status === 'verified').length;

  return (
    <div className="docs" data-documents>
      <h2 className="status-h">Your business documents <span className="docs-count">{verified} of {kinds.length} verified</span></h2>
      <p className="status-sub">We let a gym in once all {kinds.length} are verified. A clear photo or a PDF, up to 10 MB each. Only you and Core Fitness can open them.</p>
      <ul className="doc-list">
        {kinds.map((k) => <DocRow key={k.kind} applicationId={applicationId} kind={k} doc={latest(k.kind)} onChanged={onChanged} locked={locked} />)}
      </ul>
    </div>
  );
}

function DocRow({ applicationId, kind, doc, onChanged, locked }: {
  applicationId: string; kind: Kind; doc: AppDocument | null; onChanged: () => Promise<void> | void; locked?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !doc || doc.status === 'rejected';
  const [editing, setEditing] = useState(false);

  const view = useCallback(async () => {
    if (!supabase || !doc) return;
    const { data } = await supabase.storage.from('applications').createSignedUrl(doc.path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }, [doc]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !file) return;
    if (kind.needs_expiry && !expires) { setError('Give the date it expires.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('That file is over 10 MB. A photo of the page is fine.'); return; }
    setBusy(true); setError(null);
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${applicationId}/${kind.kind}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from('applications').upload(path, file, { contentType: file.type || undefined });
    if (up.error) { setError(up.error.message); setBusy(false); return; }
    const { error: e2 } = await supabase.rpc('add_application_document', {
      p_application: applicationId, p_kind: kind.kind, p_path: path, p_file_name: file.name, p_expires_on: expires || null,
    });
    setBusy(false);
    if (e2) { setError(e2.message); return; }
    setFile(null); setExpires(''); setEditing(false);
    await onChanged();
  };

  return (
    <li className={`doc is-${doc?.status ?? 'missing'}`} data-doc={kind.kind}>
      <div className="doc-head">
        <strong>{kind.label}</strong>
        <span className="doc-state">{doc ? STATUS[doc.status] : 'Not sent yet'}</span>
      </div>
      {doc && (
        <p className="doc-meta">
          <button type="button" className="link-btn" onClick={() => void view()}>{doc.file_name ?? 'Your file'}</button>
          {doc.expires_on && <> · expires {day(doc.expires_on)}</>}
        </p>
      )}
      {doc?.status === 'rejected' && doc.reason && <p className="note bad">{doc.reason} Send a new one below.</p>}
      {!locked && (open || editing) ? (
        <form className="doc-form" onSubmit={send}>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={`File for ${kind.label}`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {kind.needs_expiry && (
            <ExpiryField label={kind.label} value={expires} onChange={setExpires} />
          )}
          <button className="cta" type="submit" disabled={busy || !file}>{busy ? 'Sending…' : 'Send'}</button>
          {editing && <button className="cta ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>}
          {error && <p className="note bad">{error}</p>}
        </form>
      ) : !locked && doc?.status !== 'verified' ? (
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>Send a different file</button>
      ) : null}
    </li>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * An expiry date: future mode by construction — this year to ten years on, and
 * a date before today is never produced (the database refuses one as well).
 */
function ExpiryField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const today = manilaToday();
  const thisYear = Number(today.slice(0, 4));
  const [y, m, d] = value ? value.split('-').map(Number) : [0, 0, 0];
  const [parts, setParts] = useState({ y: y || 0, m: m || 0, d: d || 0 });
  const set = (k: 'y' | 'm' | 'd', v: number) => {
    const next = { ...parts, [k]: v };
    setParts(next);
    if (next.y && next.m && next.d) {
      const last = new Date(next.y, next.m, 0).getDate();
      const iso = `${next.y}-${String(next.m).padStart(2, '0')}-${String(Math.min(next.d, last)).padStart(2, '0')}`;
      onChange(iso >= today ? iso : '');
    } else onChange('');
  };
  return (
    <span className="doc-exp" role="group" aria-label={`${label}: expires on`}>
      Expires
      <select aria-label="Month" value={parts.m} onChange={(e) => set('m', Number(e.target.value))}>
        <option value={0}>Month</option>
        {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </select>
      <select aria-label="Day" value={parts.d} onChange={(e) => set('d', Number(e.target.value))}>
        <option value={0}>Day</option>
        {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
      </select>
      <select aria-label="Year" value={parts.y} onChange={(e) => set('y', Number(e.target.value))}>
        <option value={0}>Year</option>
        {Array.from({ length: 11 }, (_, i) => <option key={i} value={thisYear + i}>{thisYear + i}</option>)}
      </select>
      {parts.y > 0 && parts.m > 0 && parts.d > 0 && !value && <span className="note bad">That date has passed.</span>}
    </span>
  );
}
