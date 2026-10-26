import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Barbell, CalendarCheck, ChalkboardTeacher, ChatsCircle, UsersThree } from '@phosphor-icons/react';
import { Page } from '../../components/ui/page';
import { LineRow, TextTabs } from '../../components/ui/noc';
import BookClass from '../BookClass';
import WorkoutTab from './WorkoutTab';
import { useGymApp } from '../../hooks/useGymApp';
import { visibleDestinations, type Destination } from '../../components/layout/memberNav';
import { useT } from '../../lib/i18n';

type TrainTab = 'workout' | 'classes' | 'coach';

/**
 * Train (redesign, 2026-10-26): every training feature behind one row of tabs —
 * **Workout** (the default, owner's choice), **Classes** (group classes and the
 * gym's events) and **Coach** (1-on-1 booking, bookings, coaches, rooms).
 *
 * The tab is in the address (`?tab=`), so Back and notification links land on
 * the right one. Older links still work: `?show=pt` was the 1-on-1 tab and
 * `?show=events` / `?show=classes` the booking page — they open Coach and
 * Classes. A coach's "Book" (router state `trainerId`) opens Coach.
 */
export default function TrainPage() {
  const t = useT();
  const navigate = useNavigate();
  const app = useGymApp();
  const [params, setParams] = useSearchParams();
  const deepLinkTrainer = (useLocation().state as { trainerId?: string } | null)?.trainerId ?? null;
  const legacy = params.get('show');
  const fallback: TrainTab = deepLinkTrainer || legacy === 'pt' ? 'coach' : legacy === 'classes' || legacy === 'events' ? 'classes' : 'workout';
  const asked = params.get('tab');
  const active: TrainTab = asked === 'workout' || asked === 'classes' || asked === 'coach' ? asked : fallback;
  // Always written, Workout included: with nothing in the address a coach's
  // "Book" (router state) would pull the page back to Coach.
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

  const coachRows: (Destination & { blurb: string })[] = [
    { label: 'My bookings', path: '/member/booking-history', module: 'classes', icon: CalendarCheck, blurb: 'Classes and 1-on-1 sessions, coming and past' },
    { label: 'Coaches', path: '/member/trainers', module: 'coaching', icon: ChalkboardTeacher, blurb: 'Who coaches here, and their hours' },
    { label: 'Rooms', path: '/member/rooms', module: 'rooms', icon: ChatsCircle, blurb: 'Your coach’s rooms and messages' },
  ];
  const shownCoach = visibleDestinations(coachRows, app) as typeof coachRows;

  return (
    <div className="flex flex-col">
      <div style={{ marginBottom: 14 }}>
        <TextTabs<TrainTab>
          label={t('Train')}
          tabs={[
            { id: 'workout', label: t('Workout'), icon: <Barbell size={15} weight="bold" /> },
            { id: 'classes', label: t('Classes'), icon: <UsersThree size={15} weight="bold" /> },
            { id: 'coach', label: t('Coach'), icon: <ChalkboardTeacher size={15} weight="bold" /> },
          ]}
          active={active}
          onChange={(next) => setTab(next)}
        />
      </div>

      {active === 'workout' && <Page><WorkoutTab /></Page>}
      {active === 'classes' && <BookClass mode="classes" />}
      {active === 'coach' && (
        <>
          <BookClass mode="pt" />
          <Page>
            <section aria-label={t('Coaching')}>
              {shownCoach.map((d, i) => (
                <LineRow key={d.label} icon={d.icon} title={t(d.label)} meta={t(d.blurb)}
                  onClick={() => navigate(d.path)} last={i === shownCoach.length - 1} />
              ))}
            </section>
          </Page>
        </>
      )}
    </div>
  );
}
