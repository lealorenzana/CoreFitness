import PushBanner from '../PushBanner';
import { useSyncExternalStore, useEffect } from 'react';
import { subscribeSaved, syncTick } from '../../lib/offlineReads';
import { Suspense } from 'react';
import { SkeletonList } from '../ui/Skeleton';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { recordLocation } from '../../lib/navTrail';
import { useRef } from 'react';
import TrainerTabHeader from './TrainerTabHeader';
import { trainerTabRootFor } from './trainerNav';
import AchievementWatcher from '../ui/AchievementWatcher';
import MomentHost from '../moments/MomentHost';
import { Toaster } from '../ui/Toast';
import PhoneChassis from './PhoneChassis';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { useGymBrand } from '../../hooks/useGymBrand';
import GymLockBanner from '../ui/GymLockBanner';
import GymPaused from '../ui/GymPaused';
import ModuleGate from '../ModuleGate';

/**
 * The trainer shell — the member shell's structure (Nocturne), top to bottom:
 *
 *   hub      — /trainer/home is TrainerHub, Discord style: a rail of Today,
 *              Personal training and package trainees, the coach at the bottom
 *   header   — Schedule and Profile: a Back to the hub, the title, the rail
 *   <main>   — the one scroller; every other screen is full screen with Back
 *   toolbar  — on Profile only: Schedule · Hours · Coaching · Library · Settings
 *
 * It used to be a floating dock over the scroller with a lone bell row above
 * every screen, and a framer fade — the pieces the member app replaced
 * (2026-09-16/17). Aligned with it on the trainer's request (2026-09-18) so
 * both roles read as one app.
 *
 * **There is no assistant on the trainer side** (removed 2026-09-11, at the
 * gym's request). It is a member feature, gated by plan (`ai_model`, 0049).
 */
export default function TrainerLayout() {
  const location = useLocation();
  // Back online after showing saved data: the page reads again (offlineReads.ts).
  const sync = useSyncExternalStore(subscribeSaved, syncTick, () => 0);
  const mainRef = useRef<HTMLDivElement>(null);
  // Every screen this visit steps through, for Back's "up within your tab" rule (lib/navTrail.ts).
  const how = useNavigationType();
  useEffect(() => { recordLocation(location.key, location.pathname + location.search, how); }, [location.key, location.pathname, location.search, how]);
  // The hub (TrainerHub) is the app's home, Discord style: no header, no gutter, no bar.
  const hub = location.pathname === '/trainer/home';
  const root = hub ? null : trainerTabRootFor(location.pathname);
  // The reels player (0245) takes the whole screen, as the member's does: no gutter, no page scroll.
  const immersive = /^\/trainer\/(reels\/watch|gym-chat)\/?$/.test(location.pathname);

  useScrollMemory(mainRef, location.pathname + location.search);

  // The gym's colour and name, and whether it is read-only (0104).
  const gym = useGymBrand();

  // The gym's free trial has ended (0198): the app stops for coaches too.
  if (gym?.lockReason === 'trial_ended') {
    return <PhoneChassis><GymPaused ctx={gym} role="trainer" /></PhoneChassis>;
  }

  return (
    <PhoneChassis>
      <Toaster />
      {/* A push while the app is open slides down from the top. */}
      <PushBanner />

      {root && <TrainerTabHeader tab={root} />}
      {!immersive && <GymLockBanner ctx={gym} />}

      <main
        ref={mainRef}
        className={`flex-1 min-h-0 scrollbar-hide relative ${immersive ? 'overflow-hidden' : 'overflow-y-auto'}`}
        style={hub || immersive ? { backgroundColor: 'transparent' } : {
          backgroundColor: 'transparent',
          paddingLeft: 'var(--gutter)',
          paddingRight: 'var(--gutter)',
          paddingTop: root ? 4 : 'var(--gutter)',
        }}
      >
        {/* CSS entrance, keyed on the path — never framer's rAF-driven
            `initial`, which stays at zero on a page that is not compositing. */}
        <div key={`${location.pathname}#${sync}`} className="min-h-full flex flex-col noc-screen">
          {/* A screen's code arrives on first open (lib/lazyPage.ts); the shell
              stays and the page area shows the usual skeleton meanwhile. */}
          <Suspense fallback={<SkeletonList count={4} />}>
            <ModuleGate home="/trainer/home"><Outlet /></ModuleGate>
          </Suspense>
        </div>
      </main>

      {/* No tab bar and no toolbar (2026-10-27): the coach's screens are in the
          You sheet, opened from their name at the bottom of the hub. */}

      {/* Same component as the member shell — it grades by the caller's role. */}
      <AchievementWatcher />
      {/* A coach's badges play here too (the member's other moments are theirs). */}
      <MomentHost />
    </PhoneChassis>
  );
}
