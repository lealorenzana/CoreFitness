import { type ReactNode } from 'react';
import OfflineBanner from '../ui/OfflineBanner';

/**
 * The app always fills the viewport — there is no decorative phone chassis.
 *
 * It used to draw a fake 375x812 bezel, notch and "9:41" status bar on desktop
 * browsers as a demo aid. That was dropped: this ships as a real Android app
 * (TWA) and an iOS home-screen app, where a phone drawn inside a phone is just
 * wrong, and keeping a desktop-only branch meant the layout you developed
 * against was never the layout that shipped.
 *
 * Sizing is `100dvh` plus safe-area insets — `dvh` (not `vh`) so the mobile
 * browser's collapsing address bar doesn't leave a dead strip at the bottom, and
 * the insets so content clears the notch and home indicator on real hardware.
 *
 * Portal roots (#phone-toast-root, #phone-overlay-root, #modal-root,
 * #phone-screen) must all exist here — pages portal into them by id, and
 * dropping one silently breaks toasts or modals.
 */

export default function PhoneChassis({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: '100dvh', backgroundColor: 'var(--color-bg)' }}
    >
      <div
        id="phone-toast-root"
        className="absolute left-0 right-0 z-[100] flex flex-col pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      />
      <div id="phone-overlay-root" className="absolute inset-0 z-[90] pointer-events-none" />
      <div id="modal-root" className="absolute inset-0 pointer-events-none z-[95]" />

      <div
        id="phone-screen"
        className="relative h-full flex flex-col"
        style={{
          backgroundColor: 'var(--color-bg)',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <OfflineBanner />
        {children}
      </div>
    </div>
  );
}
