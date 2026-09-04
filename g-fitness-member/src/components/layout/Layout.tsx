import { Outlet, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from './BottomNav';
import FloatingChathead from '../ui/FloatingChathead';
import AchievementWatcher from '../ui/AchievementWatcher';
import { Toaster } from '../ui/Toast';
import PhoneChassis from './PhoneChassis';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { useFeatures } from '../../hooks/useFeatures';
import { isEnabled } from '../../lib/api/planFeatures';

/**
 * The assistant chathead, shown only for plans that include it (`ai_model`,
 * 0049).
 *
 * A Free Plan member was told "AI assistant - not on this plan" on their
 * membership card and then had this button following them around every screen,
 * which reads as either a broken lock or an empty promise. The route still
 * exists and explains itself (see ChatbotPage) - it is the floating button that
 * stops advertising something the plan does not include.
 *
 * Its own component so `Layout` can remount it per route. A failed check
 * deliberately falls through to *showing* it: a lock that appears because the
 * network dropped is the same lie as an empty list reading "nothing here", and
 * `FeatureLock` treats a failed check the same way.
 */
function ChatheadGate() {
  const { features, loading, error } = useFeatures();
  if (!error && (loading || !isEnabled(features, 'ai_model'))) return null;
  return <FloatingChathead />;
}

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

      {/* Draggable floating AI chathead — only for plans that include it.
          Keyed by route so it re-reads entitlements on every navigation: this
          sits in the shell, which never remounts, and `invalidateFeatures()`
          only affects the next mount. Without the key a member who upgraded
          mid-session would keep the free layout until they restarted the app. */}
      <ChatheadGate key={location.pathname} />

      {/* Sits at shell level so an unlock earned on any screen can surface
          there, rather than only on the page that happened to load it. */}
      <AchievementWatcher />
    </PhoneChassis>
  );
}
