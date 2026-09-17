import { Outlet, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TabBar from './TabBar';
import TabHeader from './TabHeader';
import { tabRootFor } from './memberNav';
import AchievementWatcher from '../ui/AchievementWatcher';
import { Toaster } from '../ui/Toast';
import PhoneChassis from './PhoneChassis';
import { useScrollMemory } from '../../hooks/useScrollMemory';

/**
 * The member shell (Nocturne redesign, 2026-09-16), top to bottom:
 *
 *   header   — only on the three tab roots: title, eyebrow, bell, rail
 *   <main>   — the one scroller
 *   bar      — Today · Train · You · More, and the check-in block
 *
 * All three are in flow. Nothing floats over the scroller: the old dock did,
 * and so did the assistant's draggable chat head, and between them they covered
 * the last row of most long screens (measured on Home: the chat head sat 40×48px
 * over the Next session button).
 *
 * **The chat head is gone; the assistant is not.** It is at `/member/chatbot`,
 * reached from the Today rail, Today's "Ask the assistant" button and Everything —
 * three places a member will look, instead of one bubble following them over
 * every screen. `ChatbotPage` still gates it by plan (0049) and explains itself.
 */
export default function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);
  const root = tabRootFor(location.pathname);

  // Was `mainRef.current.scrollTo(0, 0)` on every pathname change — a deliberate
  // reset that sent the member back to the top of Home every time they came
  // back to it. A screen visited before now resumes where it was left; a screen
  // seen for the first time still starts at the top.
  useScrollMemory(mainRef, location.pathname);

  return (
    <PhoneChassis>
      <Toaster />

      {root && <TabHeader tab={root} />}

      {/* The gutter lives here and nowhere else, so every screen starts at the
          same left edge.

          No bottom padding on purpose — `<Page>` owns the breathing room at the
          end of a screen, because screens with their own footer (Track, the
          assistant's composer) opt out of it. */}
      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-hide relative"
        style={{
          backgroundColor: 'var(--color-bg)',
          paddingLeft: 'var(--gutter)',
          paddingRight: 'var(--gutter)',
          // A root's header already ends in the rail's own padding.
          paddingTop: root ? 4 : 'var(--gutter)',
        }}
      >
        {/* `min-h-full flex flex-col` so a page can ask to fill the screen with
            `flex-1` — the assistant needs its transcript to take the slack and
            its composer to sit on the bar. Opacity only, 150ms: animation is
            decoration, and nothing here waits for it to finish. */}
        <AnimatePresence mode="popLayout">
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

      <TabBar />

      {/* Sits at shell level so an unlock earned on any screen can surface
          there, rather than only on the page that happened to load it. */}
      <AchievementWatcher />
    </PhoneChassis>
  );
}
