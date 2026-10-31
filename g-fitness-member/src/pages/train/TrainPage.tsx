import { useEffect } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Barbell, ChalkboardTeacher, UsersThree } from '@phosphor-icons/react';
import { Page } from '../../components/ui/page';
import { TextTabs } from '../../components/ui/noc';
import BookClass from '../BookClass';
import WorkoutHome from './WorkoutHome';
import CoachHome from './CoachHome';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';
import { useT } from '../../lib/i18n';
import { useTour } from '../../components/tour/Tour';
import { tourFor } from '../../lib/tours';

type TrainTab = 'workout' | 'classes' | 'coach';

/**
 * Train (simplify, 2026-10-28): **Workout** (the default) and **Coach**
 * (personal training: your package, your sessions, book one) — and, only when
 * the gym switches Classes on, **Classes** between them (group classes and the
 * gym's events).
 *
 * The tab is in the address (`?tab=`), so Back and notification links land on
 * the right one. Older links still work: `?show=pt` was the 1-on-1 tab and
 * `?show=events` / `?show=classes` the booking page. A coach's "Book" (router
 * state `trainerId`) opens Book a session with that coach.
 */
export default function TrainPage() {
  const t = useT();
  const app = useGymApp();
  const [params, setParams] = useSearchParams();
  const deepLinkTrainer = (useLocation().state as { trainerId?: string } | null)?.trainerId ?? null;
  const classesOn = moduleOn(app, 'classes');
  const coachOn = moduleOn(app, 'coaching');
  const legacy = params.get('show');
  const fallback: TrainTab = legacy === 'pt' ? 'coach' : (legacy === 'classes' || legacy === 'events') && classesOn ? 'classes' : 'workout';
  const asked = params.get('tab');
  const offered: TrainTab[] = ['workout', ...(classesOn ? ['classes' as const] : []), ...(coachOn ? ['coach' as const] : [])];
  const active: TrainTab = offered.includes(asked as TrainTab) ? asked as TrainTab : offered.includes(fallback) ? fallback : 'workout';
  const setTab = (next: TrainTab) => setParams((old) => {
    const p = new URLSearchParams(old);
    p.set('tab', next);
    p.delete('show');
    return p;
  }, { replace: true });

  // An old `?show=` link becomes the tab it meant, once, so the address reads right.
  useEffect(() => {
    if (!legacy) return;
    setParams((old) => {
      const p = new URLSearchParams(old);
      p.delete('show');
      if (fallback !== 'workout') p.set('tab', fallback);
      return p;
    }, { replace: true });
  }, [legacy, fallback, setParams]);

  // The first-visit tour of the tab you are on (guides G4).
  useTour(tourFor('member', active === 'coach' ? 'coach' : active === 'workout' ? 'train' : ''), t);

  if (deepLinkTrainer) return <Navigate to="/member/book-session" replace state={{ trainerId: deepLinkTrainer }} />;

  return (
    <div className="flex flex-col">
      {offered.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <TextTabs<TrainTab>
            label={t('Train')}
            tabs={[
              { id: 'workout' as const, label: t('Workout'), icon: <Barbell size={15} weight="bold" /> },
              { id: 'classes' as const, label: t('Classes'), icon: <UsersThree size={15} weight="bold" /> },
              { id: 'coach' as const, label: t('Coach'), icon: <ChalkboardTeacher size={15} weight="bold" /> },
            ].filter((x) => offered.includes(x.id))}
            active={active}
            onChange={(next) => setTab(next)}
          />
        </div>
      )}

      {active === 'workout' && <Page><WorkoutHome /></Page>}
      {active === 'classes' && <BookClass mode="classes" />}
      {active === 'coach' && <Page><CoachHome /></Page>}
    </div>
  );
}
