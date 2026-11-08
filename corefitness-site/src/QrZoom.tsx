import { useState } from 'react';

/**
 * A payment QR anyone can scan easily (the owner, 2026-11-08): tap for a big, white-backed copy that fills the
 * screen, with Save image. Used wherever the site shows a QR to pay by.
 */
export default function QrZoom({ src, label, sub }: { src: string; label: string; sub?: string | null }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <button type="button" className="pay-qr" onClick={() => setBig(true)} aria-label={`Show the ${label} QR code larger`} data-qr-zoom>
        <img src={src} alt={`${label} QR code`} />
        <span>Tap to enlarge and scan</span>
      </button>
      {big && (
        <div className="qr-big" role="dialog" aria-modal="true" aria-label={`${label} QR code`} onClick={() => setBig(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <img src={src} alt={`${label} QR code`} />
            <p>{label}{sub ? ` · ${sub}` : ''}</p>
            <div className="cta-row" style={{ marginTop: 12, justifyContent: 'center' }}>
              <a className="cta ghost" href={src} download={`${label.replace(/[^a-z0-9]+/gi, '-')}-qr.png`}>Save image</a>
              <button type="button" className="cta" onClick={() => setBig(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
