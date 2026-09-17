import { Outlet, useLocation } from 'react-router-dom';
import { useRef } from 'react';
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
            its composer to sit on the bar.

            Keyed on the pathname so each screen arrives with `.noc-screen` and
            its sections rise in turn (`.noc-stack` on <Page>). CSS rather than
            the framer fade this replaced: framer's `initial={{ opacity: 0 }}`
            is driven by rAF, and on a page that is not compositing it stays at
            zero — the trap CLAUDE.md names. */}
        <div key={location.pathname} className="min-h-full flex flex-col noc-screen">
          <Outlet />
        </div>
      </main>

      <TabBar />

      {/* Sits at shell level so an unlock earned on any screen can surface
          there, rather than only on the page that happened to load it. */}
      <AchievementWatcher />
    </PhoneChassis>
  );
}
