import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot } from 'lucide-react';
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
 * The assistant used to be `<FloatingChatbot />` — a violet bubble parked over
 * the bottom-right of every screen. Two things were wrong with it. It sat on
 * top of the content on the longest lists in the app, which on Schedule meant
 * it covered a class row. And it was the *member* assistant: it answers on gym
 * pricing, QR check-in and "go to Book a Class", none of which a trainer can
 * do. The trainer's own assistant already existed at /trainer/chatbot and had
 * no way in. It is now a header button beside the bell, where a trainer looks
 * for tools and where it covers nothing.
 */
export default function TrainerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);

  // See Layout.tsx — the same scroll reset lived here, with the same effect on
  // a trainer flicking between Schedule and Members.
  useScrollMemory(mainRef, location.pathname);

  return (
    <PhoneChassis>
      <Toaster />

      {/* The bell used to be absolutely positioned over the page, which put it
          on top of whatever each screen rendered in its top-right corner. */}
      <div className="flex items-center justify-end gap-2 px-4 pt-3">
        <button
          onClick={() => navigate('/trainer/chatbot')}
          aria-label="Open the training assistant"
          aria-current={location.pathname === '/trainer/chatbot' ? 'page' : undefined}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{
            background:
              location.pathname === '/trainer/chatbot'
                ? 'var(--color-primary)'
                : 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            color:
              location.pathname === '/trainer/chatbot' ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          <Bot size={18} />
        </button>
        <Notifications />
      </div>

      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto px-4 py-3 pb-2 scrollbar-hide relative"
        style={{ backgroundColor: 'var(--color-bg)' }}
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
