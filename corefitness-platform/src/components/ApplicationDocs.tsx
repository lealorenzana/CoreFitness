import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, FileText, XCircle } from 'lucide-react';
import {
  applicationDocuments, documentKinds, documentUrl, emailApplicant, explain, requestDocumentAgain, reviewDocument,
  type Application, type AppDocument, type DocKind,
} from '../lib/platform';

const day = (v: string) => { const [y, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }); };
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The six business documents of one application (0187; in one batch since
 * 0223): open each, verify it, or SEND IT BACK with a reason — one being
 * checked, or one already verified (expired, unreadable, wrong). The applicant
 * re-sends only the ones sent back, together. Approve stays shut until all six
 * are verified and in date — that rule lives in SQL. A send-back emails the
 * applicant every document waiting on them and why; all six verified emails
 * them once.
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
      if (ok) await reviewDocument(doc.id, true, null);
      else await requestDocumentAgain(doc.id, reason.trim());
      setRejecting(null); setReason('');
      const fresh = await applicationDocuments(app.id);
      setDocs(fresh); onChanged();
      const now = (k: string) => fresh.find((d) => d.kind === k && d.status !== 'replaced' && d.status !== 'draft') ?? null;
      const back = kinds.map((k) => now(k.kind)).filter((d): d is AppDocument => !!d && (d.status === 'rejected' || d.status === 'requested'));
      if (!ok) {
        // One email naming every document waiting on them, and why.
        setMailNote(await emailApplicant(app, 'application_documents', back.length === 1 ? `Please send your ${back[0].label} again` : `Please send ${back.length} documents again`,
          `We need ${back.length === 1 ? 'this document' : 'these documents'} again:\n\n${back.map((d) => `• ${d.label}: ${d.reason}`).join('\n')}\n\nAttach ${back.length === 1 ? 'it' : 'them'} and press Send again — only ${back.length === 1 ? 'this one' : 'these'}, nothing else.`));
      } else if (kinds.every((k) => now(k.kind)?.status === 'verified')) {
        setMailNote(await emailApplicant(app, 'application_documents', 'All six documents are verified',
          'We checked all six of your business documents and they are verified. We will be in touch about the next step.'));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save that'); }
    finally { setBusy(false); }
  };

  if (docs === null) return <p className="empty">Loading…</p>;
  const current = (k: string) => docs.find((d) => d.kind === k && d.status !== 'replaced' && d.status !== 'draft') ?? null;
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
                    {(d.status === 'rejected' || d.status === 'requested') && d.reason ? ` · sent back: ${d.reason}` : ''}
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
                      <button type="button" className="btn ghost" disabled={busy} onClick={() => { setRejecting(d.id); setReason(''); }}>Send back</button>
                    </>
                  )}
                  {d.status === 'verified' && rejecting !== d.id && (
                    <>
                      <span className="pill ok"><CheckCircle2 size={12} /> Verified</span>
                      <button type="button" className="btn ghost" disabled={busy} onClick={() => { setRejecting(d.id); setReason(''); }} data-ask-again>Ask again</button>
                    </>
                  )}
                  {(d.status === 'rejected' || d.status === 'requested') && <span className="pill warn"><XCircle size={12} /> Waiting for a new one</span>}
                  {rejecting === d.id && <span className="pill"><Clock size={12} /> Sending back</span>}
                </span>
              )}
              {d && rejecting === d.id && (
                <div className="doc-reject">
                  <input value={reason} maxLength={500} placeholder="What is wrong — they read this" aria-label={`Why ${k.label} is sent back`}
                    onChange={(e) => setReason(e.target.value)} />
                  <button type="button" className="btn" disabled={busy || !reason.trim()} onClick={() => void decide(d, false)}>Send back</button>
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
