import { Outlet, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TrainerBottomNav from './TrainerBottomNav';
import AchievementWatcher from '../ui/AchievementWatcher';
import { Toaster } from '../ui/Toast';
import Notifications from '../Notifications';
import PhoneChassis from './PhoneChassis';
import { useScrollMemory } from '../../hooks/useScrollMemory';

/**
 * The trainer shell.
 *
 * This used to draw its own fake phone: a 375x812 fixed-height bezel with a
 * notch, a "9:41" status bar and a violet glow — the decorative frame that was
 * removed from the member shell but never from this one. On a real Android
 * install that rendered a phone inside a phone, and the fixed `h-[812px]`
 * ignored the device entirely. It also hand-rolled its own copies of the portal
 * roots, so `#phone-screen` and `#modal-root` existed twice in the codebase with
 * different ancestors.
 *
 * It now delegates to PhoneChassis like every other shell — same dvh sizing,
 * same safe-area insets, one set of portal roots.
 *
 * **There is no assistant on the trainer side** (removed 2026-09-11, at the
 * gym's request). The assistant is a member feature — gated by the member's
 * plan (`ai_model`, 0049) — and lives only in the member shell. The header
 * keeps the bell.
 */
export default function TrainerLayout() {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);

  // See Layout.tsx — the same scroll reset lived here, with the same effect on
  // a trainer flicking between Schedule and Members.
  useScrollMemory(mainRef, location.pathname);

  return (
    <PhoneChassis>
      <Toaster />

      {/* The bell used to be absolutely positioned over the page, which put it
          on top of whatever each screen rendered in its top-right corner. */}
      <div className="flex items-center justify-end gap-2 pt-3"
        style={{ paddingLeft: 'var(--gutter)', paddingRight: 'var(--gutter)' }}>
        <Notifications />
      </div>

      <main
        ref={mainRef}
        /* Same gutter as the member shell, from the same token: the trainer app
           is the same app with a different dock, and two different left edges
           in one binary is a thing people notice without being able to name.
           Bottom clearance belongs to <Page>, as it does there. */
        className="flex-1 overflow-y-auto py-3 scrollbar-hide relative"
        style={{
          backgroundColor: 'var(--color-bg)',
          paddingLeft: 'var(--gutter)',
          paddingRight: 'var(--gutter)',
        }}
      >
        <AnimatePresence mode="popLayout">
          {/* `min-h-full flex flex-col` so a page can ask to fill the screen
              with `flex-1`. Without it this wrapper was auto-height, so the
              chat screen's `h-full` resolved against nothing, collapsed to its
              content, and left the composer stranded mid-screen above a slab of
              empty background. Ordinary pages are unaffected — they size to
              content as before. */}
          <motion.div
            key={location.pathname}
            className="min-h-full flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <TrainerBottomNav />

      {/* Same component as the member shell — it grades by the caller's role,
          so a trainer gets the coaching set without being told. */}
      <AchievementWatcher />
    </PhoneChassis>
  );
}
