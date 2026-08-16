import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Ban, CheckCircle, Clock, RefreshCw, X } from 'lucide-react';
import { generateSecureQR, getQRTimeRemaining } from '../../utils/qrCode';
import { formatCheckInCode } from '../../utils/checkInCode';
import { getCurrentMemberId } from '../../services/bookingService';
import { getMemberHome, type MemberHome } from '../../services/memberHomeService';
import { errorMessage } from '../../utils/errorMessage';
import { toast } from './Toast';

/**
 * The check-in QR, as a full-screen sheet the bottom nav can open anywhere.
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
        if (!data.expired && !data.checkedInToday) regenerate(data.memberId);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load your check-in code'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, regenerate]);

  useEffect(() => {
    if (!open || !qr) return;
    const t = setInterval(() => setRemaining(getQRTimeRemaining(qr)), 1000);
    return () => clearInterval(t);
  }, [open, qr]);

  const root = typeof document !== 'undefined' ? document.getElementById('phone-overlay-root') : null;
  if (!root) return null;

  const expired = remaining === 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/85 backdrop-blur-sm pointer-events-auto"
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            role="dialog" aria-modal="true" aria-label="Check-in QR code"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[88%] max-w-sm pointer-events-auto"
          >
            <div
              className="p-6 text-center relative"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-panel)',
                boxShadow: 'var(--shadow-panel)',
              }}
            >
              <button
                onClick={onClose} aria-label="Close"
                className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
              >
                <X size={18} />
              </button>

              <h3 className="display text-xl text-white mb-1">Check in</h3>

              {loading || !home ? (
                <div className="py-10">
                  <div className="mx-auto w-48 h-48 rounded-2xl animate-pulse" style={{ background: 'var(--color-surface-high)' }} />
                </div>
              ) : home.expired ? (
                <div className="py-8">
                  <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
                    style={{ background: 'var(--color-secondary-light)' }}>
                    <Ban size={26} style={{ color: 'var(--color-secondary)' }} />
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {home.expiryDate ? 'Your membership has expired' : 'No active membership'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Renew at the front desk or in the app to check in again.
                  </p>
                </div>
              ) : home.checkedInToday ? (
                <div className="py-8">
                  <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
                    style={{ background: 'var(--color-primary-light)' }}>
                    <CheckCircle size={26} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <p className="text-sm font-semibold text-white">You're already checked in today</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Have a good session, {home.firstName}.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                    Show this to the front desk
                  </p>
                  <div className="bg-white p-4 rounded-2xl inline-block mb-4"
                    style={{ opacity: expired ? 0.3 : 1, filter: expired ? 'blur(2px)' : undefined }}>
                    <QRCodeSVG value={qr || home.memberId} size={180} />
                  </div>

                  {expired ? (
                    <button
                      onClick={() => regenerate(home.memberId)}
                      className="w-full h-11 rounded-full font-semibold text-sm text-black flex items-center justify-center gap-2"
                      style={{ background: 'var(--color-secondary)' }}
                    >
                      <RefreshCw size={15} /> Code expired — get a new one
                    </button>
                  ) : (
                    <p className="text-xs flex items-center justify-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      <Clock size={12} /> Expires in {remaining}s
                    </p>
                  )}

                  {/* The fallback when the camera won't cooperate. Always shown,
                      and never expires — it identifies the member, it doesn't
                      authorise anything. */}
                  <div
                    className="mt-4 pt-4"
                    style={{ borderTop: '1px solid var(--color-border)' }}
                  >
                    <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      Camera not working? Read out your code
                    </p>
                    {/* `.selectable` opts back into text selection — the app
                        shell is `user-select: none` so a long press can't
                        highlight the interface, and this is the one string
                        most worth being able to copy. */}
                    <p
                      className="display text-2xl tracking-[0.15em] selectable"
                      style={{ color: 'var(--color-secondary)' }}
                    >
                      {formatCheckInCode(home.memberId)}
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    root
  );
}
