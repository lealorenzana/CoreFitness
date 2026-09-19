import { Suspense } from 'react';
import { SkeletonList } from '../ui/Skeleton';
import { Outlet, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import TabBar from './TabBar';
import TabHeader from './TabHeader';
import { tabRootFor } from './memberNav';
import AchievementWatcher from '../ui/AchievementWatcher';
import FloatingChathead from '../ui/FloatingChathead';
import { useFeatures } from '../../hooks/useFeatures';
import { isEnabled } from '../../lib/api/planFeatures';
import { Toaster } from '../ui/Toast';
import PhoneChassis from './PhoneChassis';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { loadLanguagePreference } from '../../lib/i18n';
import { useGymBrand } from '../../hooks/useGymBrand';
import GymLockBanner from '../ui/GymLockBanner';
import { getCurrentMemberId } from '../../services/bookingService';
import { useEffect } from 'react';

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
 * **The chat head is back** (2026-09-17), because without it nobody found the
 * assistant. It floats over the scroller but stops at the bar, and it is gated by
 * plan exactly as before (see `ChatheadGate`).
 */
/**
 * The assistant chathead, shown only for plans that include it (`ai_model`,
 * 0049/0059), and not on the full assistant screen it would open.
 *
 * A failed check deliberately falls through to *showing* it: a lock that appears
 * because the network dropped is the same lie as an empty list reading "nothing
 * here", and `FeatureLock` treats a failed check the same way. The route itself
 * still locks and explains for a plan without it.
 */
function ChatheadGate({ pathname }: { pathname: string }) {
  const { features, loading, error } = useFeatures();
  if (pathname.startsWith('/member/chatbot')) return null;
  if (!error && (loading || !isEnabled(features, 'ai_model'))) return null;
  return <FloatingChathead />;
}

/** Screens that draw their own full-screen chrome. */
const IMMERSIVE = /^\/member\/track\/session\//;

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);
  const root = tabRootFor(location.pathname);
  // A routine being run takes the whole screen (2026-09-19): no bar, no chat
  // head, no gutter — the page draws its own chrome, and its way out is its own
  // close button (the session stays open and Today offers to resume it).
  const immersive = IMMERSIVE.test(location.pathname);

  // Was `mainRef.current.scrollTo(0, 0)` on every pathname change — a deliberate
  // reset that sent the member back to the top of Home every time they came
  // back to it. A screen visited before now resumes where it was left; a screen
  // seen for the first time still starts at the top.
  useScrollMemory(mainRef, location.pathname);

  // The gym's colour and name, and whether it is read-only (0104).
  const gym = useGymBrand();

  // The member's language (0095), once per shell mount. Missing column or a
  // failed read leaves English, which is what every screen falls back to.
  useEffect(() => {
    void (async () => {
      const id = await getCurrentMemberId().catch(() => null);
      if (id) await loadLanguagePreference(id).catch(() => undefined);
    })();
  }, []);

  return (
    <PhoneChassis>
      <Toaster />

      {root && <TabHeader tab={root} />}
      {!immersive && <GymLockBanner ctx={gym} />}

      {/* The gutter lives here and nowhere else, so every screen starts at the
          same left edge.

          No bottom padding on purpose — `<Page>` owns the breathing room at the
          end of a screen, because screens with their own footer (Track, the
          assistant's composer) opt out of it. */}
      <main
        ref={mainRef}
        className={`flex-1 min-h-0 scrollbar-hide relative ${immersive ? 'overflow-hidden' : 'overflow-y-auto'}`}
        style={{
          backgroundColor: 'var(--color-bg)',
          paddingLeft: immersive ? 0 : 'var(--gutter)',
          paddingRight: immersive ? 0 : 'var(--gutter)',
          // A root's header already ends in the rail's own padding.
          paddingTop: immersive ? 0 : root ? 4 : 'var(--gutter)',
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
          {/* A screen's code arrives on first open (lib/lazyPage.ts); the shell
              stays and the page area shows the usual skeleton meanwhile. */}
          <Suspense fallback={<SkeletonList count={4} />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {!immersive && <TabBar />}

      {!immersive && <ChatheadGate pathname={location.pathname} />}

      {/* Sits at shell level so an unlock earned on any screen can surface
          there, rather than only on the page that happened to load it. */}
      <AchievementWatcher />
    </PhoneChassis>
  );
}
