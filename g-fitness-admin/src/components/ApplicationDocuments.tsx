import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, FileText, Upload, XCircle } from 'lucide-react';
import DatePicker from './ui/DatePicker';
import { documentKinds, documentLink, sendDocument, type ApplicationDocument, type DocumentKind } from '../lib/api/applications';
import { showToast } from '../utils/toast';

const MUTED = 'var(--color-text-muted)';
const day = (v: string) => { const [y, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }); };
const STATE = {
  pending: { text: 'Sent — Core Fitness is checking it', icon: Clock, color: MUTED },
  verified: { text: 'Verified', icon: CheckCircle2, color: 'var(--color-primary-300, var(--color-primary))' },
  rejected: { text: 'Not accepted', icon: XCircle, color: 'var(--color-secondary)' },
} as const;

/**
 * The six business documents (0187), each one's newest copy and its verdict,
 * with a place to send it. Used by the applicant's page (before the gym exists)
 * and by Your plan → Business documents (renewals, once it does).
 * `renewing`: a verified one can be replaced by a newer copy (a renewed permit).
 */
export default function ApplicationDocuments({ applicationId, documents, onChanged, renewing }: {
  applicationId: string; documents: ApplicationDocument[]; onChanged: () => void | Promise<void>; renewing?: boolean;
}) {
  const [kinds, setKinds] = useState<DocumentKind[] | null>(null);
  useEffect(() => { void (async () => { try { setKinds(await documentKinds()); } catch { setKinds([]); } })(); }, []);
  if (!kinds) return null;
  const latest = (k: string) => documents.find((d) => d.kind === k && d.status !== 'replaced') ?? null;
  const verified = kinds.filter((k) => latest(k.kind)?.status === 'verified').length;
  return (
    <div data-documents>
      <p className="text-xs" style={{ color: MUTED }}>{verified} of {kinds.length} verified · a clear photo or a PDF, up to 10 MB · only you and Core Fitness can open them</p>
      <ul className="mt-3 space-y-2">
        {kinds.map((k) => <Row key={k.kind} applicationId={applicationId} kind={k} doc={latest(k.kind)} onChanged={onChanged} renewing={renewing} />)}
      </ul>
    </div>
  );
}

function Row({ applicationId, kind, doc, onChanged, renewing }: {
  applicationId: string; kind: DocumentKind; doc: ApplicationDocument | null; onChanged: () => void | Promise<void>; renewing?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const canSend = !doc || doc.status === 'rejected' || open;
  const s = doc && doc.status !== 'replaced' ? STATE[doc.status] : null;

  const send = async () => {
    if (!file) return;
    if (kind.needs_expiry && !expires) { showToast('Give the date it expires', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('That file is over 10 MB', 'error'); return; }
    setBusy(true);
    try {
      await sendDocument(applicationId, kind.kind, file, expires || null);
      showToast(`${kind.label} sent`, 'success');
      setFile(null); setExpires(''); setOpen(false);
      await onChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not send it', 'error');
    } finally { setBusy(false); }
  };

  return (
    <li className="rounded-xl p-3" data-doc={kind.kind}
      style={{ background: 'var(--color-surface)', border: `1px solid ${doc?.status === 'rejected' ? 'var(--color-secondary)' : 'var(--color-border)'}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <FileText size={15} style={{ color: MUTED }} />
        <span className="text-sm font-semibold text-white">{kind.label}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs" style={{ color: s?.color ?? MUTED }}>
          {s ? <><s.icon size={13} /> {s.text}</> : 'Not sent yet'}
        </span>
      </div>
      {doc && (
        <p className="text-xs mt-1" style={{ color: MUTED }}>
          <button type="button" className="underline" onClick={() => void documentLink(doc.path).then((u) => u && window.open(u, '_blank', 'noopener'))}>
            {doc.file_name ?? 'Your file'}
          </button>
          {doc.expires_on && <> · expires {day(doc.expires_on)}</>}
        </p>
      )}
      {doc?.status === 'rejected' && doc.reason && <p className="text-xs mt-1" style={{ color: 'var(--color-secondary)' }}>{doc.reason} Send a new one.</p>}
      {canSend ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={`File for ${kind.label}`}
            className="text-xs max-w-full" style={{ color: 'var(--color-text-secondary)' }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {kind.needs_expiry && (
            <div className="w-56"><DatePicker mode="future" value={expires} onChange={setExpires} placeholder="Expires on" /></div>
          )}
          <button type="button" disabled={busy || !file} onClick={() => void send()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-secondary)', color: '#111' }}>
            <Upload size={13} /> {busy ? 'Sending…' : 'Send'}
          </button>
          {open && <button type="button" className="text-xs" style={{ color: MUTED }} onClick={() => setOpen(false)}>Cancel</button>}
        </div>
      ) : (doc?.status === 'pending' || (renewing && doc?.status === 'verified')) ? (
        <button type="button" className="text-xs mt-2 underline" style={{ color: 'var(--color-primary)' }} onClick={() => setOpen(true)}>
          {doc?.status === 'verified' ? 'Send the renewed one' : 'Send a different file'}
        </button>
      ) : null}
    </li>
  );
}
