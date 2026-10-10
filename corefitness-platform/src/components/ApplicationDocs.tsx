import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, FileText, XCircle } from 'lucide-react';
import {
  applicationDocuments, documentKinds, documentUrl, emailApplicant, explain, reviewDocument,
  type Application, type AppDocument, type DocKind,
} from '../lib/platform';

const day = (v: string) => { const [y, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }); };
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The six business documents of one application (0187): open each, verify it
 * or say what is wrong. Approve stays shut until all six are verified and in
 * date — that rule lives in SQL (a trigger on the application), so this screen
 * only shows it. A verdict is emailed to the applicant when mail is set up.
 */
export default function ApplicationDocs({ app, onChanged }: { app: Application; onChanged: () => void }) {
  const [docs, setDocs] = useState<AppDocument[] | null>(null);
  const [kinds, setKinds] = useState<DocKind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [mailNote, setMailNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const [d, k] = await Promise.all([applicationDocuments(app.id), documentKinds()]); setDocs(d); setKinds(k); setError(null); }
    catch (e) { setDocs([]); setError(explain(e, '0187')); }
  }, [app.id]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const decide = async (doc: AppDocument, ok: boolean) => {
    setBusy(true);
    try {
      await reviewDocument(doc.id, ok, ok ? null : reason.trim());
      setRejecting(null); setReason('');
      await load(); onChanged();
      const r = await emailApplicant(app, 'application_documents', `Your ${doc.label}: ${ok ? 'verified' : 'not accepted'}`,
        ok ? `We checked your ${doc.label} and it is verified.`
           : `We could not accept your ${doc.label}: ${reason.trim()}\n\nPlease send a new one.`);
      setMailNote(r);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save that'); }
    finally { setBusy(false); }
  };

  if (docs === null) return <p className="empty">Loading…</p>;
  const current = (k: string) => docs.find((d) => d.kind === k && d.status !== 'replaced') ?? null;
  const verified = kinds.filter((k) => current(k.kind)?.status === 'verified').length;

  return (
    <div data-review-documents>
      <p className="meta" style={{ marginTop: 0 }}>
        {verified} of {kinds.length} verified. {verified < kinds.length ? 'Let them in once all are verified and in date.' : 'Everything is verified — you can let them in.'}
      </p>
      {error && <p className="err">{error}</p>}
      <div className="doc-review">
        {kinds.map((k) => {
          const d = current(k.kind);
          return (
            <div key={k.kind} className="doc-review-row" data-doc={k.kind}>
              <span className="grow">
                <b><FileText size={13} /> {k.label}</b>
                {d ? (
                  <span className="meta" style={{ margin: 0 }}>
                    {d.file_name ?? 'File'} · sent {when(d.uploaded_at)}{d.expires_on ? ` · expires ${day(d.expires_on)}` : ''}
                    {d.status === 'rejected' && d.reason ? ` · rejected: ${d.reason}` : ''}
                  </span>
                ) : <span className="meta" style={{ margin: 0 }}>Not sent yet</span>}
              </span>
              {d && (
                <span className="actions">
                  <button type="button" className="btn ghost" onClick={() => void documentUrl(d.path).then((u) => u && window.open(u, '_blank', 'noopener'))}>
                    <ExternalLink size={13} /> Open
                  </button>
                  {d.status === 'pending' && rejecting !== d.id && (
                    <>
                      <button type="button" className="btn" disabled={busy} onClick={() => void decide(d, true)}>Verify</button>
                      <button type="button" className="btn ghost" disabled={busy} onClick={() => { setRejecting(d.id); setReason(''); }}>Reject</button>
                    </>
                  )}
                  {d.status === 'verified' && <span className="pill ok"><CheckCircle2 size={12} /> Verified</span>}
                  {d.status === 'rejected' && <span className="pill warn"><XCircle size={12} /> Waiting for a new one</span>}
                  {d.status === 'pending' && rejecting === d.id && <span className="pill"><Clock size={12} /> Rejecting</span>}
                </span>
              )}
              {d && rejecting === d.id && (
                <div className="doc-reject">
                  <input value={reason} maxLength={500} placeholder="What is wrong — they read this" aria-label={`Why ${k.label} is rejected`}
                    onChange={(e) => setReason(e.target.value)} />
                  <button type="button" className="btn" disabled={busy || !reason.trim()} onClick={() => void decide(d, false)}>Reject</button>
                  <button type="button" className="btn ghost" onClick={() => setRejecting(null)}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mailNote && <p className="meta">{mailNote}</p>}
    </div>
  );
}
