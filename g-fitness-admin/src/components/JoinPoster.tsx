import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, ScanLine, UserPlus, Dumbbell } from 'lucide-react';
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
  const act = (action ?? accent).c600;
  const initials = gymName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const steps: [typeof ScanLine, string, string][] = [
    [ScanLine, 'Scan', 'Point your phone camera at the code'],
    [UserPlus, 'Sign up', 'Your name and a password, that is all'],
    [Dumbbell, 'Come in', 'We approve you at the desk'],
  ];
  // Corner marks around the QR: the gym's second colour, the scanning frame people already know.
  const corner = (pos: React.CSSProperties) => (
    <span style={{ position: 'absolute', width: 34, height: 34, borderColor: act, borderStyle: 'solid', borderWidth: 0, ...pos }} />
  );

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

      {/* One A4 page at 640 by 905: nothing is absolutely placed except decoration, so Letter paper survives too. */}
      {/* keep-dark: paper looks the same in light mode (light.css turns inline white words dark elsewhere). */}
      <div className="mx-auto my-6 print:my-0 keep-dark" style={{ width: 640, maxWidth: '100%', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
        <div style={{ background: '#FFFFFF', color: '#0F172A', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', position: 'relative' }}>

          {/* The band: the gym's colour, cut on a slant, the mascot burst on its right. */}
          <div style={{ position: 'relative', background: deep, color: '#FFFFFF', padding: '30px 36px 150px',
            clipPath: 'polygon(0 0, 100% 0, 100% 78%, 0 100%)', overflow: 'hidden' }}>
            {/* The Core Fitness mascot in a burst of gym kit (owner, 2026-11-27): rays in the gym's colour behind,
                equipment flying out around it. Decoration only, kept above the QR card. */}
            <div aria-hidden style={{ position: 'absolute', right: -6, top: 4, width: 300, height: 300, pointerEvents: 'none' }} data-poster-burst>
              <svg viewBox="-150 -150 300 300" width="300" height="300" style={{ position: 'absolute', inset: 0 }}>
                <circle r="92" fill={accent.c600} opacity="0.55" />
                {Array.from({ length: 18 }, (_, i) => {
                  const a0 = (i / 18) * Math.PI * 2, a1 = a0 + Math.PI / 30;
                  return <polygon key={i} fill={accent.c400} opacity={i % 2 ? 0.22 : 0.38}
                    points={`0,0 ${Math.cos(a0) * 170},${Math.sin(a0) * 170} ${Math.cos(a1) * 170},${Math.sin(a1) * 170}`} />;
                })}
                {[[-118, -40], [104, 64], [-30, -128], [126, -92], [-96, 112]].map(([x, y], i) => (
                  <path key={i} transform={`translate(${x} ${y}) scale(${i % 2 ? 0.7 : 1})`} fill={act}
                    d="M0 -12 C2 -3 3 -2 12 0 C3 2 2 3 0 12 C-2 3 -3 2 -12 0 C-3 -2 -2 -3 0 -12 Z" />
                ))}
              </svg>
              {[
                ['/images/admin-art/mascot-kettlebell.webp', { left: 6, top: 18, width: 78, transform: 'rotate(-18deg)' }],
                ['/images/admin-art/mascot-stopwatch.webp', { right: 18, top: 0, width: 60, transform: 'rotate(16deg)' }],
                ['/images/admin-art/mascot-plate.webp', { right: 0, top: 128, width: 62, transform: 'rotate(22deg)' }],
                ['/images/admin-art/mascot-shoe.webp', { left: 0, top: 170, width: 84, transform: 'rotate(-12deg)' }],
              ].map(([src, st]) => (
                <img key={src as string} src={src as string} alt="" style={{ position: 'absolute', height: 'auto', filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.28))', ...(st as React.CSSProperties) }} />
              ))}
              <img src="/images/admin-art/mascot-bottle.webp" alt="" style={{ position: 'absolute', left: 64, top: 52, width: 172, height: 'auto',
                filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.35))' }} />
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 66, height: 66, borderRadius: '50%', background: '#FFFFFF', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: 'none',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.9)' }} data-poster-logo>
                {logoUrl
                  ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : <span style={{ fontSize: 24, fontWeight: 900, color: deep }}>{initials}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{gymName}</p>
                {tagline && <p style={{ margin: '3px 0 0', fontSize: 13, color: accent.c200 }}>{tagline}</p>}
              </div>
            </div>

            <h1 style={{ position: 'relative', margin: '34px 0 0', fontSize: 76, fontWeight: 900, lineHeight: 0.92, letterSpacing: '-0.045em', textTransform: 'uppercase' }}>
              Scan<br />to join
            </h1>
            <p style={{ position: 'relative', margin: '14px 0 0', fontSize: 16, fontWeight: 500, color: accent.c200, maxWidth: 262 }}>
              Your membership, on your phone. Sign up here and the desk does the rest.
            </p>
          </div>

          {/* The QR on a white card that rides up over the band. */}
          <div style={{ position: 'relative', margin: '-176px 44px 0 auto', width: 268, padding: 18, background: '#FFFFFF', borderRadius: 22,
            boxShadow: '0 22px 44px -18px rgba(15,23,42,0.45)', border: '1px solid #E5E7EB' }}>
            <div style={{ position: 'relative', padding: 12 }}>
              {corner({ top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 12 })}
              {corner({ top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 12 })}
              {corner({ bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 12 })}
              {corner({ bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 12 })}
              <QRCodeSVG
                value={joinLink}
                size={208}
                level="M"
                // Stated rather than defaulted: qrcode.react's defaults changed
                // between majors, and a quiet zone that silently goes to 0 makes
                // a printed code unreadable against a dark wall (CheckInSheet.tsx
                // carries the same note for the same reason).
                marginSize={0}
                bgColor="#FFFFFF"
                fgColor="#0F172A"
                style={{ display: 'block' }}
              />
            </div>
            <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: deep }}>
              Point your camera here
            </p>
          </div>

          <div style={{ padding: '0 44px' }}>
            {/* The code, for a camera that will not focus. */}
            {joinCode ? (
              <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 18, padding: '14px 18px', borderRadius: 16, background: accent.c200 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: accent.c900, lineHeight: 1.35, flex: 1 }}>
                  Camera not working? Open the app, tap <b>Have a join code</b>, and type
                </p>
                <p style={{ margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: '0.16em', color: accent.c900, fontVariantNumeric: 'tabular-nums' }}>{joinCode}</p>
              </div>
            ) : (
              <p style={{ marginTop: 26, fontSize: 13, color: '#475569', wordBreak: 'break-all' }}>Or open <b style={{ color: '#0F172A' }}>{joinLink}</b></p>
            )}

            {/* Three steps on one line, joined like a route. */}
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 30 }}>
              <span aria-hidden style={{ position: 'absolute', top: 23, left: '17%', right: '17%', height: 3, borderRadius: 2, background: accent.c200 }} />
              {steps.map(([Icon, t, s], i) => (
                <div key={t} style={{ position: 'relative', display: 'grid', justifyItems: 'center', alignContent: 'start', textAlign: 'center', gap: 6 }}>
                  <span style={{ width: 48, height: 48, borderRadius: '50%', background: i === 0 ? act : deep, color: '#FFFFFF', display: 'grid', placeItems: 'center',
                    boxShadow: '0 0 0 5px #FFFFFF' }}><Icon size={22} strokeWidth={2.4} /></span>
                  <b style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{i + 1}. {t}</b>
                  <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.35, maxWidth: 150 }}>{s}</span>
                </div>
              ))}
            </div>

            {/* The honest last line. Members are approved at the desk (0078), and
                a poster that implies instant access sets up an argument at the
                counter on day one. */}
            <p style={{ margin: '26px 0 0', textAlign: 'center', fontSize: 13, color: '#334155' }}>
              Ask at the desk once you have signed up. We approve every new member.
            </p>
          </div>

          <div style={{ marginTop: 24, background: deep, color: accent.c200, padding: '12px 44px', display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5 }}>
            <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{gymName}</span>
            <span>Powered by Core Fitness</span>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
