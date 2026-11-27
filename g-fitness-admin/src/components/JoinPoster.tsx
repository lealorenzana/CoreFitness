import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer } from 'lucide-react';
import Button from './ui/Button';
import type { Ramp } from '../lib/gymTheme';

/**
 * The thing a gym actually tapes to its door.
 *
 * Everything needed to join this gym already existed — the link (0110), the
 * join code (0110) and now an address the owner controls (0114) — and all three
 * lived on a dashboard screen as selectable text. The gap between "I can copy
 * my link" and "my members can join" is a piece of paper, and every gym was
 * being asked to make it themselves in Word.
 *
 * ## It wears the gym (owner, 2026-11-27)
 *
 * The header band is the gym's own colour with its logo in a white disc (its initials when it has none, never
 * the Core Fitness mark: that would advertise the wrong business); the QR frame and the code box are the same
 * colour, the step numbers the gym's second colour. Words on a fill use the ramp's 700/800 shade so white type
 * stays readable on paper whatever colour the gym chose. `print-color-adjust: exact` makes the browser print the
 * colours instead of dropping backgrounds.
 *
 * ## Why it prints from the browser and is not a generated PDF
 *
 * A PDF means a renderer, a font bundle and a server route, and it would
 * produce the same page. `window.print()` against a `@media print` block uses
 * the browser's own engine, works offline, and lets the owner see exactly what
 * will come out before it does. Nothing is positioned absolutely and nothing
 * depends on a page being A4 rather than Letter.
 *
 * ## The QR encodes the link, not the code
 *
 * A phone camera opens a URL and cannot do anything with six characters. The
 * code is printed underneath in large type for the person whose camera will not
 * focus, which on the cheap Androids this gym's members carry is common enough
 * to design for. Both routes land in the same place.
 */
export default function JoinPoster({
  gymName,
  tagline,
  logoUrl,
  joinLink,
  joinCode,
  accent,
  action,
  onClose,
}: {
  gymName: string;
  tagline: string | null;
  logoUrl: string | null;
  joinLink: string;
  /** NULL for a listed gym, which has no code — the poster then omits that half. */
  joinCode: string | null;
  /** The gym's main colour (gymTheme ramp). */
  accent: Ramp;
  /** The gym's second colour, for the step numbers; the main colour when not given. */
  action?: Ramp;
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

  const deep = accent.c800;
  const step2 = (action ?? accent).c700;
  const initials = gymName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const steps = [
    ['Scan', 'Point your phone camera at the code'],
    ['Sign up', 'Fill in your name and a password'],
    ['Come in', 'We approve you at the desk'],
  ];

  return createPortal((
    // The dimmed backdrop is a class, not an inline style, so print can turn it white (it printed as grey margins).
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 print:static print:overflow-visible print:bg-white" data-join-poster>
      {/* The bar is the only thing that does not print. */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 print:hidden"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Print it, or save it as a PDF from the same dialog. Turn on background graphics if the colours do not show.
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

      {/* Paper: white, with the gym's colour where it carries meaning. */}
      <div className="mx-auto my-6 print:my-0" style={{ maxWidth: 640, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
        <div style={{ background: '#FFFFFF', color: '#111827', textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {/* The band: the gym's colour, its logo, its name. */}
          <div style={{ background: deep, color: '#FFFFFF', padding: '36px 36px 64px', position: 'relative' }}>
            <div style={{ width: 104, height: 104, margin: '0 auto 16px', borderRadius: '50%', background: '#FFFFFF', display: 'grid', placeItems: 'center',
              overflow: 'hidden', boxShadow: `0 0 0 6px ${accent.c600}` }} data-poster-logo>
              {logoUrl
                ? <img src={logoUrl} alt="" style={{ width: '86%', height: '86%', objectFit: 'contain' }} />
                : <span style={{ fontSize: 38, fontWeight: 800, color: deep }}>{initials}</span>}
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.08, margin: 0, letterSpacing: '-0.02em' }}>{gymName}</h1>
            {tagline && <p style={{ fontSize: 15, marginTop: 8, color: accent.c200 }}>{tagline}</p>}
          </div>

          {/* The card that overlaps the band: the headline and the three steps. */}
          <div style={{ margin: '-40px 32px 0', background: '#FFFFFF', borderRadius: 18, padding: '22px 20px 18px', position: 'relative',
            boxShadow: '0 12px 30px -14px rgba(17,24,39,0.35)', border: `1px solid ${accent.c200}` }}>
            <p style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Join us on your phone</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
              {steps.map(([t, s], i) => (
                <div key={t} style={{ display: 'grid', justifyItems: 'center', alignContent: 'start', gap: 4 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: step2, color: '#FFFFFF', display: 'grid', placeItems: 'center',
                    fontWeight: 800, fontSize: 14 }}>{i + 1}</span>
                  <b style={{ fontSize: 14 }}>{t}</b>
                  <span style={{ fontSize: 11.5, color: '#4B5563', lineHeight: 1.35 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* The QR, framed in the gym's colour. */}
          <div style={{ margin: '28px auto 0', width: 260, padding: 14, borderRadius: 20, background: '#FFFFFF', border: `5px solid ${deep}` }}>
            <QRCodeSVG
              value={joinLink}
              size={222}
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
          <p style={{ fontSize: 12.5, marginTop: 10, color: '#4B5563', wordBreak: 'break-all', padding: '0 40px' }}>{joinLink}</p>

          {joinCode && (
            <div style={{ margin: '22px 48px 0', padding: '14px 16px', borderRadius: 14, background: accent.c200 }}>
              <p style={{ fontSize: 13.5, color: deep, margin: 0, fontWeight: 600 }}>Camera not working? Open the app, tap Have a join code, and type</p>
              <p style={{ fontSize: 42, fontWeight: 800, letterSpacing: '0.2em', margin: '4px 0 0', color: accent.c900 }}>{joinCode}</p>
            </div>
          )}

          {/* The honest last line. Members are approved at the desk (0078), and
              a poster that implies instant access sets up an argument at the
              counter on day one. */}
          <p style={{ fontSize: 13, marginTop: 22, color: '#374151', padding: '0 40px' }}>
            Ask at the desk once you have signed up. We approve every new member.
          </p>
          <div style={{ marginTop: 22, background: deep, color: accent.c200, padding: '10px 16px', fontSize: 11 }}>
            {gymName} · Powered by Core Fitness
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
