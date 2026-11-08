import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from 'lucide-react';

/**
 * An application's documents, looked at over the page (the owner, 2026-11-08: "it should show the photos and just
 * be viewable, not open on another tab"). A photo fits the screen, or is shown at full size to read small print;
 * a PDF opens in the same frame. ← → step through every document sent, Esc closes. The link is the short-lived
 * signed one the row already asked Storage for — nothing is downloaded or kept.
 */
export interface ViewDoc { id: string; label: string; url: string; fileName: string | null; meta: string; status: string }

export const isPdf = (d: { fileName: string | null; url: string }) => /\.pdf($|\?)/i.test(d.fileName ?? '') || /\.pdf\?/i.test(d.url);

export default function DocViewer({ docs, start, onClose, onVerify }: {
  docs: ViewDoc[]; start: number; onClose: () => void; onVerify?: (id: string) => Promise<void>;
}) {
  const [i, setI] = useState(start);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = docs[i];

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') { setI((n) => Math.min(docs.length - 1, n + 1)); setFull(false); }
      if (e.key === 'ArrowLeft') { setI((n) => Math.max(0, n - 1)); setFull(false); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [docs.length, onClose]);

  if (!d) return null;
  const go = (n: number) => { setI(n); setFull(false); };
  return createPortal(
    <div className="docv" role="dialog" aria-label={`${d.label} — document ${i + 1} of ${docs.length}`} data-doc-viewer>
      <div className="docv__bar">
        <span className="docv__title"><b>{d.label}</b><small>{d.meta}</small></span>
        <span className="docv__count">{i + 1} of {docs.length}</span>
        {!isPdf(d) && (
          <button type="button" className="btn ghost sm" onClick={() => setFull((f) => !f)} aria-pressed={full}>
            {full ? <><Minimize size={13} /> Fit the screen</> : <><Maximize size={13} /> Full size</>}
          </button>
        )}
        {d.status === 'pending' && onVerify && (
          <button type="button" className="btn sm" disabled={busy}
            onClick={() => { setBusy(true); void onVerify(d.id).finally(() => setBusy(false)); }}>{busy ? 'Verifying…' : 'Verify'}</button>
        )}
        {d.status === 'verified' && <span className="pill ok">Verified</span>}
        <button type="button" className="docv__x" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className={`docv__stage${full ? ' full' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {isPdf(d)
          ? <iframe className="docv__pdf" src={d.url} title={d.label} />
          : <img className="docv__img" src={d.url} alt={d.label} onClick={() => setFull((f) => !f)} />}
      </div>
      {docs.length > 1 && (
        <>
          <button type="button" className="docv__nav prev" disabled={i === 0} onClick={() => go(i - 1)} aria-label="Previous document"><ChevronLeft size={22} /></button>
          <button type="button" className="docv__nav next" disabled={i === docs.length - 1} onClick={() => go(i + 1)} aria-label="Next document"><ChevronRight size={22} /></button>
        </>
      )}
      <div className="docv__strip">
        {docs.map((x, n) => (
          <button key={x.id} type="button" className={`docv__thumb${n === i ? ' on' : ''}`} onClick={() => go(n)} aria-label={x.label} title={x.label}>
            {isPdf(x) ? <span>PDF</span> : <img src={x.url} alt="" loading="lazy" />}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
