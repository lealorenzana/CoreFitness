import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * An application's documents, looked at over the page (the owner, 2026-11-08: "it should show the photos and just
 * be viewable, not open on another tab"). The whole document always shows (owner, 2026-11-23: no fit or full size
 * to choose): a photo is scaled to fit the screen, a PDF opens at the size of its page. ← → step through every document sent, Esc closes. The link is the short-lived
 * signed one the row already asked Storage for — nothing is downloaded or kept.
 */
export interface ViewDoc { id: string; label: string; url: string; fileName: string | null; meta: string; status: string }

export const isPdf = (d: { fileName: string | null; url: string }) => /\.pdf($|\?)/i.test(d.fileName ?? '') || /\.pdf\?/i.test(d.url);

export default function DocViewer({ docs, start, onClose, onVerify }: {
  docs: ViewDoc[]; start: number; onClose: () => void; onVerify?: (id: string) => Promise<void>;
}) {
  const [i, setI] = useState(start);
  const [busy, setBusy] = useState(false);
  const d = docs[i];

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(docs.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [docs.length, onClose]);

  if (!d) return null;
  const go = (n: number) => setI(n);
  return createPortal(
    <div className="docv" role="dialog" aria-label={`${d.label}, document ${i + 1} of ${docs.length}`} data-doc-viewer>
      <div className="docv__bar">
        <span className="docv__title"><b>{d.label}</b><small>{d.meta}</small></span>
        <span className="docv__count">{i + 1} of {docs.length}</span>
        {d.status === 'pending' && onVerify && (
          <button type="button" className="btn sm" disabled={busy}
            onClick={() => { setBusy(true); void onVerify(d.id).finally(() => setBusy(false)); }}>{busy ? 'Verifying…' : 'Verify'}</button>
        )}
        {d.status === 'verified' && <span className="pill ok">Verified</span>}
        <button type="button" className="docv__x" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="docv__stage" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {isPdf(d)
          ? <iframe className="docv__pdf" src={`${d.url}#view=Fit`} title={d.label} />
          : <img className="docv__img" src={d.url} alt={d.label} />}
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
