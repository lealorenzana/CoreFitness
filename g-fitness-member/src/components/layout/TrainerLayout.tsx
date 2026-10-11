import { Suspense } from 'react';
import { SkeletonList } from '../ui/Skeleton';
import { Outlet, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import TrainerToolbar from './TrainerToolbar';
import TrainerTabHeader from './TrainerTabHeader';
import { trainerTabRootFor } from './trainerNav';
import AchievementWatcher from '../ui/AchievementWatcher';
import { Toaster } from '../ui/Toast';
import PhoneChassis from './PhoneChassis';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { useGymBrand } from '../../hooks/useGymBrand';
import GymLockBanner from '../ui/GymLockBanner';
import ModuleGate from '../ModuleGate';

/**
 * The trainer shell — the member shell's structure (Nocturne), top to bottom:
 *
 *   hub      — /trainer/home and /trainer/rooms are TrainerHub, Discord style:
 *              a rail of rooms, Messages, and the coach floating at the bottom
 *   header   — Schedule, Bookings and Profile: a Back to the hub, the title, the rail
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
  const mainRef = useRef<HTMLDivElement>(null);
  // The hub (TrainerHub) is the app's home, Discord style: no header, no gutter, no bar.
  const hub = location.pathname === '/trainer/home' || location.pathname === '/trainer/rooms';
  const root = hub ? null : trainerTabRootFor(location.pathname);
  const isProfile = location.pathname === '/trainer/profile';

  useScrollMemory(mainRef, location.pathname + location.search);

  // The gym's colour and name, and whether it is read-only (0104).
  const gym = useGymBrand();

  return (
    <PhoneChassis>
      <Toaster />

      {root && <TrainerTabHeader tab={root} />}
      <GymLockBanner ctx={gym} />

      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-hide relative"
        style={hub ? { backgroundColor: 'var(--color-bg)' } : {
          backgroundColor: 'var(--color-bg)',
          paddingLeft: 'var(--gutter)',
          paddingRight: 'var(--gutter)',
          paddingTop: root ? 4 : 'var(--gutter)',
          paddingBottom: isProfile ? 96 : undefined,
        }}
      >
        {/* CSS entrance, keyed on the path — never framer's rAF-driven
            `initial`, which stays at zero on a page that is not compositing. */}
        <div key={location.pathname} className="min-h-full flex flex-col noc-screen">
          {/* A screen's code arrives on first open (lib/lazyPage.ts); the shell
              stays and the page area shows the usual skeleton meanwhile. */}
          <Suspense fallback={<SkeletonList count={4} />}>
            <ModuleGate home="/trainer/home"><Outlet /></ModuleGate>
          </Suspense>
        </div>
      </main>

      {/* No tab bar (2026-10-11): the hub is home; the coach's tools ride on their profile. */}
      {isProfile && <TrainerToolbar />}

      {/* Same component as the member shell — it grades by the caller's role. */}
      <AchievementWatcher />
    </PhoneChassis>
  );
}
