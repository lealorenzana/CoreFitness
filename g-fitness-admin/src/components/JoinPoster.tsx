import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer } from 'lucide-react';
import Button from './ui/Button';

/**
 * The thing a gym actually tapes to its door.
 *
 * Everything needed to join this gym already existed — the link (0110), the
 * join code (0110) and now an address the owner controls (0114) — and all three
 * lived on a dashboard screen as selectable text. The gap between "I can copy
 * my link" and "my members can join" is a piece of paper, and every gym was
 * being asked to make it themselves in Word.
 *
 * ## Why it prints from the browser and is not a generated PDF
 *
 * A PDF means a renderer, a font bundle and a server route, and it would
 * produce the same page. `window.print()` against a `@media print` block uses
 * the browser's own engine, works offline, and lets the owner see exactly what
 * will come out before it does. The cost is that margins are the browser's; the
 * layout is built to survive that — nothing is positioned absolutely and
 * nothing depends on a page being A4 rather than Letter.
 *
 * ## The QR encodes the link, not the code
 *
 * A phone camera opens a URL and cannot do anything with six characters. The
 * code is printed underneath in large type for the person whose camera will not
 * focus, which on the cheap Androids this gym's members carry is common enough
 * to design for. Both routes land in the same place.
 *
 * `logoUrl` is drawn only when the gym uploaded one: a poster wearing the Core
 * Fitness mark would be advertising the wrong business.
 */
export default function JoinPoster({
  gymName,
  tagline,
  logoUrl,
  joinLink,
  joinCode,
  accent,
  onClose,
}: {
  gymName: string;
  tagline: string | null;
  logoUrl: string | null;
  joinLink: string;
  /** NULL for a listed gym, which has no code — the poster then omits that half. */
  joinCode: string | null;
  accent: string;
  onClose: () => void;
}) {
  // Printing has to hide the dashboard around this, and `print:hidden` on each
  // of the sidebar, the header and the search bar would be three places to
  // forget. One class on <body>, one rule in index.css, and the poster is
  // portalled out of #root so that rule can hide everything else.
  useEffect(() => {
    document.body.classList.add('poster-open');
    return () => document.body.classList.remove('poster-open');
  }, []);

  return createPortal((
    <div className="fixed inset-0 z-50 overflow-y-auto print:static print:overflow-visible"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      {/* The bar is the only thing that does not print. */}
      <div className="sticky top-0 flex items-center justify-between px-5 py-3 print:hidden"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Print it, or save it as a PDF from the same dialog.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>
            <Printer size={14} className="mr-1.5" /> Print
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X size={14} className="mr-1.5" /> Close
          </Button>
        </div>
      </div>

      {/* White, always: this is paper. The dashboard's dark tokens are not used
          anywhere inside, because a dark poster is a cartridge of ink. */}
      <div className="mx-auto my-6 print:my-0" style={{ maxWidth: 640 }}>
        <div className="px-10 py-12 text-center" style={{ background: '#FFFFFF', color: '#111827' }}>
          {logoUrl && (
            <img src={logoUrl} alt="" width={96} height={96}
              style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 20px' }} />
          )}

          <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, margin: 0 }}>{gymName}</h1>
          {tagline && (
            <p style={{ fontSize: 15, marginTop: 8, color: '#4B5563' }}>{tagline}</p>
          )}

          <p style={{ fontSize: 19, fontWeight: 600, marginTop: 30 }}>
            Join us on your phone
          </p>
          <p style={{ fontSize: 14, marginTop: 6, color: '#4B5563' }}>
            Point your camera at this
          </p>

          <div style={{ margin: '18px auto 0', width: 232, padding: 12, border: '3px solid #111827' }}>
            <QRCodeSVG
              value={joinLink}
              size={204}
              level="M"
              // Stated rather than defaulted: qrcode.react's defaults changed
              // between majors, and a quiet zone that silently goes to 0 makes
              // a printed code unreadable against a dark wall (CheckInSheet.tsx
              // carries the same note for the same reason).
              marginSize={0}
              bgColor="#FFFFFF"
              fgColor="#111827"
            />
          </div>

          <p style={{ fontSize: 13, marginTop: 12, color: '#4B5563', wordBreak: 'break-all' }}>
            {joinLink}
          </p>

          {joinCode && (
            <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid #D1D5DB' }}>
              <p style={{ fontSize: 14, color: '#4B5563' }}>
                Camera not working? Open the app and type
              </p>
              <p style={{ fontSize: 40, fontWeight: 800, letterSpacing: '0.18em', marginTop: 6 }}>
                {joinCode}
              </p>
            </div>
          )}

          {/* The honest last line. Members are approved at the desk (0078), and
              a poster that implies instant access sets up an argument at the
              counter on day one. */}
          <p style={{ fontSize: 13, marginTop: 26, color: '#4B5563' }}>
            Ask at the desk once you have signed up — we approve every new member.
          </p>

          <p style={{ fontSize: 11, marginTop: 20, color: '#9CA3AF' }}>
            Powered by Core Fitness
          </p>
          {/* A hairline in the gym's colour, so a printed poster is still
              recognisably theirs in one glance from across a room. */}
          <div style={{ height: 5, marginTop: 14, background: accent }} />
        </div>
      </div>
    </div>
  ), document.body);
}
