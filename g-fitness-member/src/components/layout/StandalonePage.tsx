import type { ReactNode } from 'react';
import MobileFrame from './MobileFrame';
import { Toaster } from '../ui/Toast';

/**
 * A screen outside both shells that is still one of ours — choosing or joining a
 * gym, an invitation, the get-the-app page (2026-10-04).
 *
 * These rendered straight into #phone-screen: no scroller and no gutter, so the
 * text ran to the very edge on a phone and stretched across a whole monitor on a
 * desktop. MobileFrame gives the scroller; this column gives the shell's 20px
 * gutter and a phone-width measure, centred, so a link opened on a laptop reads
 * like the app it leads to.
 *
 * It carries its own Toaster: the shell's lives in Layout, so a toast raised
 * here (a refused join, a join request sent) used to go nowhere.
 */
/** `wide`: a page with its own layout for a computer too (Get the app, 2026-11-21) gets 1040px instead of a phone column. */
export default function StandalonePage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <MobileFrame>
      <Toaster />
      <div className={wide ? "mx-auto w-full max-w-[1104px] px-5 md:px-8 pt-4 pb-8" : "mx-auto w-full max-w-[480px] px-5 pt-4 pb-8"}>{children}</div>
    </MobileFrame>
  );
}
