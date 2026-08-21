import { Outlet, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from './BottomNav';
import FloatingChathead from '../ui/FloatingChathead';
import AchievementWatcher from '../ui/AchievementWatcher';
import { Toaster } from '../ui/Toast';
import PhoneChassis from './PhoneChassis';
import { useScrollMemory } from '../../hooks/useScrollMemory';

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);

  // Was `mainRef.current.scrollTo(0, 0)` on every pathname change — a deliberate
  // reset that sent the member back to the top of Home every time they came
  // back to it. A screen visited before now resumes where it was left; a screen
  // seen for the first time still starts at the top, which is all the old line
  // was ever getting right.
  useScrollMemory(mainRef, location.pathname);

  return (
    <PhoneChassis>
      <Toaster />

      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto px-4 py-4 pb-2 scrollbar-hide relative"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        {/* Animated page transitions — 200ms fade + slide.
            `min-h-full flex flex-col` so a page can ask to fill the screen with
            `flex-1` — the assistant needs its transcript to take the slack and
            its composer to sit on the dock. Ordinary pages are unaffected: they
            still size to their content. */}
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

      <BottomNav />

      {/* Draggable floating AI chathead */}
      <FloatingChathead />

      {/* Sits at shell level so an unlock earned on any screen can surface
          there, rather than only on the page that happened to load it. */}
      <AchievementWatcher />
    </PhoneChassis>
  );
}
