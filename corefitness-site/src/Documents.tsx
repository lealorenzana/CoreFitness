import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface AppDocument {
  id: string; kind: string; label: string; path: string; file_name: string | null; expires_on: string | null;
  status: 'draft' | 'pending' | 'verified' | 'rejected' | 'requested' | 'replaced'; reason: string | null; uploaded_at: string;
}
interface Kind { kind: string; label: string; needs_expiry: boolean; sort_order: number }

const day = (v: string) => { const [y, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }); };
/** Manila's date, never the UTC one (it is yesterday for the first eight hours of each day). */
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const STATUS: Record<string, string> = {
  pending: 'Sent — we are checking it', verified: 'Verified', rejected: 'Send this one again', requested: 'Send this one again',
};

/**
 * The six documents a gym sends before it is let in — in one batch (0223).
 * Each file the applicant attaches is a draft only they see; **Submit
 * documents** sends them together, and works only when every document that
 * needs sending is attached: all six the first time, then only the ones Core
 * Fitness sent back (with the reason shown). Files go to a private bucket under
 * the application's own folder; the database decides who may put them there.
 */
export default function Documents({ applicationId, documents, onChanged, locked }: {
  applicationId: string; documents: AppDocument[]; onChanged: () => Promise<void> | void; locked?: boolean;
}) {
  const [kinds, setKinds] = useState<Kind[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      if (!supabase) { setKinds([]); return; }
      const { data } = await supabase.rpc('application_document_kinds');
      setKinds(((data ?? []) as Kind[]).sort((a, b) => a.sort_order - b.sort_order));
    })();
  }, []);
  if (!kinds) return null;
  // The newest copy that was sent (not a draft, not replaced) decides where each one stands.
  const sent = (k: string) => documents.find((d) => d.kind === k && d.status !== 'replaced' && d.status !== 'draft') ?? null;
  const draft = (k: string) => documents.find((d) => d.kind === k && d.status === 'draft') ?? null;
  const toSend = kinds.filter((k) => { const d = sent(k.kind); return !d || d.status === 'rejected' || d.status === 'requested'; });
  // "Submit documents" while any has never been sent; "Send again" only for ones sent back.
  const firstTime = toSend.some((k) => !sent(k.kind));
  const attached = toSend.filter((k) => draft(k.kind)).length;
  const verified = kinds.filter((k) => sent(k.kind)?.status === 'verified').length;

  const submit = async () => {
    if (!supabase) return;
    setBusy(true); setError(null); setSentNote(null);
    const { data, error: e } = await supabase.rpc('submit_documents', { p_application: applicationId });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setSentNote(`Sent ${data} document${data === 1 ? '' : 's'} — we will check ${data === 1 ? 'it' : 'them'} and tell you here and by email.`);
    await onChanged();
  };

  return (
    <div className="docs" data-documents>
      <h2 className="status-h">Your business documents <span className="docs-count">{verified} of {kinds.length} verified</span></h2>
      <p className="status-sub">{firstTime
        ? `Attach ${toSend.length === kinds.length ? `all ${kinds.length}` : `the ${toSend.length} still to send`}, then press Submit documents to send them together. A clear photo or a PDF, up to 10 MB each. Only you and Core Fitness can open them.`
        : toSend.length > 0
          ? `We need ${toSend.length === 1 ? 'one document' : `${toSend.length} documents`} again — the reason is under each. Attach ${toSend.length === 1 ? 'it' : 'them'}, then send.`
          : 'We let a gym in once all are verified.'}</p>
      <ul className="doc-list">
        {kinds.map((k) => (
          <DocRow key={k.kind} applicationId={applicationId} kind={k} doc={sent(k.kind)} draft={draft(k.kind)}
            open={!locked && toSend.some((x) => x.kind === k.kind)} onChanged={onChanged} />
        ))}
      </ul>
      {!locked && toSend.length > 0 && (
        <div className="docs-submit" data-docs-submit>
          <button type="button" className="cta" disabled={busy || attached < toSend.length} onClick={() => void submit()} data-submit-documents>
            {busy ? 'Sending…' : firstTime ? 'Submit documents' : `Send ${toSend.length === 1 ? 'it' : `these ${toSend.length}`} again`}
          </button>
          <span className="note">{attached} of {toSend.length} attached{attached < toSend.length ? ' — attach every one to send' : ' — ready to send'}</span>
        </div>
      )}
      {error && <p className="note bad">{error}</p>}
      {sentNote && <p className="note" role="status">{sentNote}</p>}
    </div>
  );
}

function DocRow({ applicationId, kind, doc, draft, open, onChanged }: {
  applicationId: string; kind: Kind; doc: AppDocument | null; draft: AppDocument | null; open: boolean; onChanged: () => Promise<void> | void;
}) {
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = useCallback(async (d: AppDocument) => {
    if (!supabase) return;
    const { data } = await supabase.storage.from('applications').createSignedUrl(d.path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }, []);

  // Choosing a file attaches it at once (a draft — not sent until Submit).
  const attach = async (file: File | undefined) => {
    if (!supabase || !file) return;
    if (kind.needs_expiry && !expires) { setError('Give the date it expires first.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('That file is over 10 MB. A photo of the page is fine.'); return; }
    setBusy(true); setError(null);
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${applicationId}/${kind.kind}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from('applications').upload(path, file, { contentType: file.type || undefined });
    if (up.error) { setError(up.error.message); setBusy(false); return; }
    const { error: e2 } = await supabase.rpc('save_document_draft', {
      p_application: applicationId, p_kind: kind.kind, p_path: path, p_file_name: file.name, p_expires_on: expires || null,
    });
    setBusy(false);
    if (e2) { setError(e2.message); return; }
    await onChanged();
  };

  const state = open ? (draft ? 'Attached — not sent yet' : doc ? STATUS[doc.status] : 'Not attached yet') : doc ? STATUS[doc.status] : 'Not sent yet';
  return (
    <li className={`doc is-${open ? (draft ? 'draft' : doc?.status ?? 'missing') : doc?.status ?? 'missing'}`} data-doc={kind.kind}>
      <div className="doc-head">
        <strong>{kind.label}</strong>
        <span className="doc-state">{state}</span>
      </div>
      {doc && !(open && draft) && (
        <p className="doc-meta">
          <button type="button" className="link-btn" onClick={() => void view(doc)}>{doc.file_name ?? 'Your file'}</button>
          {doc.expires_on && <> · expires {day(doc.expires_on)}</>}
        </p>
      )}
      {open && draft && (
        <p className="doc-meta">
          <button type="button" className="link-btn" onClick={() => void view(draft)}>{draft.file_name ?? 'Your file'}</button>
          {draft.expires_on && <> · expires {day(draft.expires_on)}</>}
        </p>
      )}
      {(doc?.status === 'rejected' || doc?.status === 'requested') && doc.reason && <p className="note bad">{doc.reason}</p>}
      {open && (
        <div className="doc-form">
          {kind.needs_expiry && <ExpiryField label={kind.label} value={expires} onChange={setExpires} />}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={`File for ${kind.label}`} disabled={busy}
            onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ''; }} />
          {busy && <span className="note">Attaching…</span>}
          {draft && !busy && <span className="note">Choose another file to replace it.</span>}
          {error && <p className="note bad">{error}</p>}
        </div>
      )}
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
