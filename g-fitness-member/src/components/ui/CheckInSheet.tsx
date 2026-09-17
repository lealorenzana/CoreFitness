import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowClockwise, CheckCircle, Prohibit } from '@phosphor-icons/react';
import { NocButton } from './noc';
import { generateSecureQR, getQRTimeRemaining } from '../../utils/qrCode';
import { formatCheckInCode } from '../../utils/checkInCode';
import { getCurrentMemberId } from '../../services/bookingService';
import { getMemberHome, type MemberHome } from '../../services/memberHomeService';
import { errorMessage } from '../../utils/errorMessage';
import { toast } from './Toast';
import { GLASS, SCRIM } from './glass';

/**
 * The check-in QR, as a bottom sheet the bar's check-in block opens anywhere
 * (Nocturne redesign).
 *
 * It used to live inside Home, which meant the one thing a member does every
 * single visit was three taps deep if they happened to be on another screen.
 *
 * The sheet loads its own state rather than taking props, because it is opened
 * from the nav and has no page to inherit from. It refuses to show a live code
 * to an expired membership or to someone already checked in — the front desk
 * would scan it and get a rejection, which reads as the app being broken.
 */
export default function CheckInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [home, setHome] = useState<MemberHome | null>(null);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState('');
  const [remaining, setRemaining] = useState(0);
  const loadedRef = useRef(false);
  /**
   * True when the check-in landed **while this sheet was open** — i.e. the desk
   * just scanned the code the member is holding up.
   *
   * Distinct from `home.checkedInToday`, which is also true when they open the
   * sheet hours later. "You're already checked in today" is the right sentence
   * for that and the wrong one for the moment the scanner beeps: the member is
   * standing at the desk waiting to be told it worked.
   */
  const [justScanned, setJustScanned] = useState(false);

  const regenerate = useCallback((memberId: string) => {
    const code = generateSecureQR(memberId);
    setQr(code);
    setRemaining(getQRTimeRemaining(code));
  }, []);

  // Reload each time it opens — a membership can be renewed, or a check-in
  // recorded at the desk, while the app sits open in the background.
  useEffect(() => {
    if (!open) { loadedRef.current = false; return; }
    if (loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const id = await getCurrentMemberId();
        if (!id) { toast.error('Your session could not be verified. Please sign in again.'); return; }
        const data = await getMemberHome(id);
        if (cancelled) return;
        setHome(data);
        // Cleared here rather than in an effect keyed on `open`: re-opening is
        // the moment the stale celebration would show, and this already runs
        // then. A separate effect whose body is one synchronous setState is
        // exactly the cascading-render pattern the lint rule is about.
        setJustScanned(false);
        if (!data.expired && !data.checkedInToday) regenerate(data.memberId);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load your check-in code'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, regenerate]);

  /**
   * Watch for the desk scanning it, and say so.
   *
   * The member holds the phone out, the desk scans, the desk sees a toast — and
   * the phone, the thing actually pointed at the person, said nothing at all.
   * They had to ask whether it worked.
   *
   * Polled rather than pushed: the check-in is written by the admin app against
   * Supabase, and a realtime subscription for one row on one screen is a lot of
   * moving parts for a sheet that is open for about fifteen seconds. Four
   * seconds is quick enough to feel immediate at a counter.
   *
   * Stops the moment it fires, and never runs for a member who was already
   * checked in when they opened it.
   */
  useEffect(() => {
    if (!open || !home || home.expired || home.checkedInToday) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const fresh = await getMemberHome(home.memberId);
        if (cancelled || !fresh.checkedInToday) return;
        setHome(fresh);
        setJustScanned(true);
      } catch {
        // A dropped poll is not worth a message. The next one covers it, and
        // the member can see their own screen either way.
      }
    }, 4000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [open, home]);

  // The code rolls over on its own rather than dying on screen.
  //
  // This used to only count down: after 60 seconds the QR blurred out and the
  // member had to notice the "get a new one" button and tap it. In a queue at
  // the desk that is exactly the wrong moment to need an extra tap, and a member
  // holding out a dead code reads to everyone involved as the scanner being
  // broken. The desk cannot tell the difference either — it just sees a code
  // that will not validate.
  //
  // Regenerating is free: it is a template string and a `Date.now()`, no network
  // and no database. The manual button stays for the case this cannot cover —
  // the sheet having been left open and backgrounded, where timers are throttled.
  useEffect(() => {
    if (!open || !qr || !home) return;
    const live = !home.expired && !home.checkedInToday;
    const t = setInterval(() => {
      const left = getQRTimeRemaining(qr);
      if (left <= 0 && live) regenerate(home.memberId);
      else setRemaining(left);
    }, 1000);
    return () => clearInterval(t);
  }, [open, qr, home, regenerate]);

  const root = typeof document !== 'undefined' ? document.getElementById('phone-overlay-root') : null;
  if (!root) return null;

  const expired = remaining === 0;
  const validTo = home?.expiryDate
    ? new Date(`${home.expiryDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return createPortal(
    // Always mounted, and the only node that declares pointer-events — the
    // pattern Modal and StepFlow already use. The backdrop used to carry
    // `pointer-events-auto` *inside* AnimatePresence, and an exiting child is
    // kept mounted until its animation finishes, which on a page that is not
    // compositing is never: an invisible layer over the whole app, eating taps.
    <div className="absolute inset-0" style={{ pointerEvents: open ? 'auto' : 'none' }}>
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
            style={SCRIM}
          />
          <motion.div
            initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 32 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            role="dialog" aria-modal="true" aria-label="Check-in QR code"
            className="absolute inset-x-0 bottom-0 flex flex-col items-center"
            style={{
              ...GLASS,
              borderBottom: 'none',
              borderRadius: '20px 20px 0 0',
              padding: '12px var(--gutter) calc(20px + env(safe-area-inset-bottom))',
              gap: 14,
            }}
          >
            <div aria-hidden style={{ width: 42, height: 4, borderRadius: 2, background: 'rgba(233, 233, 237, 0.25)' }} />

            {loading || !home ? (
              <>
                <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>Check in</p>
                <div className="animate-pulse" style={{ width: 224, height: 224, borderRadius: 14, background: 'var(--color-surface-high)' }} />
              </>
            ) : home.expired ? (
              <>
                <div className="text-center">
                  <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {home.expiryDate ? 'Membership expired' : 'No active membership'}
                  </p>
                  <p style={{ fontSize: 12.5, marginTop: 3, color: 'var(--color-text-secondary)' }}>
                    No code is shown — the desk would refuse it.
                  </p>
                </div>
                <div className="grid place-items-center" style={{ width: 224, height: 160, borderRadius: 14, background: 'var(--color-surface-high)' }}>
                  <Prohibit size={64} style={{ color: 'var(--color-secondary)' }} />
                </div>
                <p className="text-center" style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                  Renew at the front desk or in the app to check in again.
                </p>
              </>
            ) : home.checkedInToday ? (
              <>
                <div className="text-center">
                  <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {justScanned ? 'Scanned — you are in' : 'Checked in'}
                  </p>
                  <p style={{ fontSize: 12.5, marginTop: 3, color: 'var(--color-text-secondary)' }}>
                    {justScanned
                      ? `Your attendance is recorded. Have a good session, ${home.firstName}.`
                      : `You are already checked in today. Have a good session, ${home.firstName}.`}
                  </p>
                </div>
                <div className="grid place-items-center" style={{ width: 224, height: 224, borderRadius: 14, background: 'var(--color-surface-high)' }}>
                  <CheckCircle size={90} style={{ color: 'var(--color-primary-400)' }} />
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>Check in</p>
                  {/* The countdown is gone; the expiry is not. A code that never
                      expires can be screenshotted and used by someone else, so
                      it still carries a timestamp — but it regenerates itself a
                      second before it dies, so the member has nothing to do.
                      "Expires in 12s" only started a small panic in a queue. */}
                  <p style={{ fontSize: 12.5, marginTop: 3, color: 'var(--color-text-secondary)' }}>
                    Show this at the desk. It refreshes itself every 60 seconds.
                  </p>
                </div>

                {/* White, always: a desk webcam reads black on white. `level`
                    and `marginSize` are stated because qrcode.react's defaults
                    are wrong for scanning a phone screen — "L" is the weakest
                    correction when "M" encodes to the same 29×29 here, and a
                    zero margin leaves no quiet zone. `size` counts the margin,
                    so 224 keeps modules at ~6px. */}
                <div style={{
                  borderRadius: 14, overflow: 'hidden', background: '#FFFFFF', lineHeight: 0,
                  boxShadow: '0 0 40px -10px var(--color-primary)',
                  opacity: expired ? 0.3 : 1, filter: expired ? 'blur(2px)' : undefined,
                }}>
                  <QRCodeSVG value={qr || home.memberId} size={224} level="M" marginSize={4} />
                </div>

                {/* The fallback when the camera won't cooperate. Never expires —
                    it identifies the member, it authorises nothing. `.selectable`
                    opts back into text selection; this is the one string in the
                    app most worth being able to copy. */}
                <p className="selectable" style={{
                  fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 19,
                  letterSpacing: '0.34em', color: 'var(--color-primary-300)',
                }}>
                  {formatCheckInCode(home.memberId)}
                </p>
                <p style={{ fontSize: 12, marginTop: -8, color: 'var(--color-text-muted)' }}>
                  {home.planName ?? 'Membership'}{validTo ? ` · valid to ${validTo}` : ''} · read the code out if the camera fails
                </p>

                {/* The manual refresh survives for the case the timer cannot
                    cover: a backgrounded phone, where setInterval is throttled
                    and the code really can go stale on screen. */}
                {expired && (
                  <NocButton variant="action" className="w-full" style={{ height: 48 }}
                    icon={<ArrowClockwise size={15} />} onClick={() => regenerate(home.memberId)}>
                    Tap to refresh your code
                  </NocButton>
                )}
              </>
            )}

            <NocButton variant="ghost" className="w-full" style={{ height: 48 }} onClick={onClose}>
              Close
            </NocButton>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </div>,
    root
  );
}
