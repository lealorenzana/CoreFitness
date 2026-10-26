import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Barbell, Books, CalendarCheck, ChartLineUp, ListChecks, Lock, Play, Trophy, Wrench, CalendarDots,
} from '@phosphor-icons/react';
import { Eyebrow, LineRow, NocButton, Panel, StatusPill } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import ProgramNext from '../../components/workout/ProgramNext';
import { toast } from '../../components/ui/Toast';
import { getCurrentMemberId } from '../../services/bookingService';
import { getTodayExtras } from '../../services/memberHomeService';
import { getOpenRoutineSession, getRoutine, type Routine } from '../../lib/api/routines';
import { startPlannedRoutine } from '../../lib/startPlannedRoutine';
import { visibleDestinations, hubEntry, type Destination } from '../../components/layout/memberNav';
import { useGymApp } from '../../hooks/useGymApp';
import { useFeatures } from '../../hooks/useFeatures';
import { isEnabled } from '../../lib/api/planFeatures';
import { moduleOn } from '../../lib/gymApp';
import { errorMessage } from '../../utils/errorMessage';
import { useT } from '../../lib/i18n';

interface Today {
  routine: Routine | null;
  /** A workout already under way — "Continue", not a second start. */
  openLogId: string | null;
}

/**
 * Train → Workout (redesign, 2026-10-26; the tab Train opens on).
 *
 * Today's planned routine first, as the screen's one hero with its exercises
 * and one filled button, then the program's next day, then every training
 * screen as a described row — the places the old rail of pills and More led.
 * Nothing new is read: today's routine is the same `getTodayExtras` Today uses.
 */
export default function WorkoutTab() {
  const navigate = useNavigate();
  const t = useT();
  const app = useGymApp();
  const { features } = useFeatures();
  const locked = features != null && !isEnabled(features, 'workout_tracker');
  const [today, setToday] = useState<Today | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) return;
        const [extras, open] = await Promise.all([getTodayExtras(id), getOpenRoutineSession(id).catch(() => null)]);
        const routine = extras.todayRoutine ? await getRoutine(extras.todayRoutine.id) : null;
        if (alive) { setMemberId(id); setToday({ routine, openLogId: open?.logId ?? null }); }
      } catch {
        if (alive) setToday({ routine: null, openLogId: null });
      }
    })();
    return () => { alive = false; };
  }, []);

  const start = async () => {
    if (locked) { navigate('/member/track'); return; }
    if (today?.openLogId) { navigate(`/member/track/session/${today.openLogId}`); return; }
    if (!memberId || !today?.routine) { navigate('/member/track'); return; }
    try {
      navigate(await startPlannedRoutine(memberId, today.routine.id));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start that workout'));
      if (err instanceof Error && /routine is gone/.test(err.message)) navigate('/member/gym-plan');
    }
  };

  const rows: (Destination & { blurb: string; tone?: 'mine' | 'act' | 'info' })[] = [
    { label: 'This week', path: '/member/gym-plan', module: 'progress', icon: CalendarCheck, blurb: 'Plan your training days and reminders' },
    { label: "Today's workout", path: '/member/workouts/today', icon: CalendarDots, blurb: 'Everything planned for today' },
    { label: 'Routines', path: '/member/track', module: 'progress', icon: ListChecks, blurb: 'Your saved workouts, and your coach’s' },
    { label: 'Programs', path: '/member/programs', module: 'programs', icon: Barbell, blurb: 'Multi-week plans from the gym' },
    { label: 'Free workouts', path: '/member/workouts', icon: Books, blurb: 'Workouts anyone can do, no plan needed' },
    { label: 'Equipment', path: '/member/equipment', module: 'equipment', icon: Wrench, blurb: 'What the gym has, and how to use it' },
    { label: 'Progress', path: hubEntry('progress', app), module: 'progress', icon: ChartLineUp, blurb: 'Body, targets, photos and badges' },
    { label: 'Challenges', path: hubEntry('compete', app), module: 'engagement', icon: Trophy, blurb: 'What you have joined, and the season' },
  ];
  const shown = visibleDestinations(rows, app) as typeof rows;

  const r = today?.routine;
  return (
    <>
      {today == null ? <SkeletonList count={2} /> : (
        <Panel glow="structure" style={{ padding: 16 }}>
          <div data-train-hero>
            <div className="flex items-center justify-between" style={{ gap: 10 }}>
              <Eyebrow>{t('Today')}</Eyebrow>
              {r?.source === 'trainer' && r.authorName && <StatusPill label={`${t('From')} ${r.authorName}`} tone="structure" />}
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--color-text-primary)' }}>
              {r ? r.name : t('Nothing planned today')}
            </p>
            <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-secondary)' }}>
              {today.openLogId ? t('A workout is under way')
                : r ? `${r.exercises.length} ${r.exercises.length === 1 ? t('exercise') : t('exercises')}`
                : t('Start one of your routines, or an empty workout.')}
            </p>
            <div style={{ marginTop: 12 }}>
              <NocButton variant="fill" className="w-full" onClick={() => void start()}
                icon={locked ? <Lock size={15} aria-label="Not on your plan" /> : <Play size={15} weight="fill" />}>
                {locked ? t('See routines') : today.openLogId ? t('Continue') : r ? t('Start workout') : t('Start a workout')}
              </NocButton>
            </div>
          </div>
          {r && r.exercises.length > 0 && (
            <div style={{ marginTop: 12 }} data-train-exercises>
              {r.exercises.slice(0, 5).map((x, i) => (
                <div key={x.id ?? i} className="flex items-center" style={{ gap: 10, padding: '8px 0', borderTop: '1px solid var(--color-separator)', fontSize: 14 }}>
                  <span className="grid place-items-center flex-none" style={{ width: 24, height: 24, borderRadius: 7, fontSize: 12,
                    background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--color-text-primary)' }}>{x.name}</span>
                  <span className="flex-none" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {x.targetSets} × {x.isTimed ? `${x.targetReps ?? '—'} s` : (x.targetReps ?? '—')}
                    {x.targetWeightKg ? ` · ${x.targetWeightKg} kg` : ''}
                  </span>
                </div>
              ))}
              {r.exercises.length > 5 && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', paddingTop: 6 }}>+{r.exercises.length - 5} {t('more')}</p>
              )}
            </div>
          )}
        </Panel>
      )}

      {moduleOn(app, 'programs') && <ProgramNext />}

      <section aria-label={t('Training')}>
        {shown.map((d, i) => (
          <LineRow key={d.label} icon={d.icon} tone="info" title={t(d.label)} meta={t(d.blurb)}
            onClick={() => navigate(d.path)} last={i === shown.length - 1} />
        ))}
      </section>
    </>
  );
}
