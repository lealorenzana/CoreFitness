import type { ReactNode } from 'react';
import MobileFrame from './MobileFrame';

/**
 * A screen outside both shells that is still one of ours — choosing or joining a
 * gym, an invitation, the get-the-app page (2026-10-04).
 *
 * These rendered straight into #phone-screen: no scroller and no gutter, so the
 * text ran to the very edge on a phone and stretched across a whole monitor on a
 * desktop. MobileFrame gives the scroller; this column gives the shell's 20px
 * gutter and a phone-width measure, centred, so a link opened on a laptop reads
 * like the app it leads to.
 */
export default function StandalonePage({ children }: { children: ReactNode }) {
  return (
    <MobileFrame>
      <div className="mx-auto w-full max-w-[480px] px-5 pt-4 pb-8">{children}</div>
    </MobileFrame>
  );
}
