import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, Books, CalendarCheck, CalendarDots, ListChecks, Lock, type Icon } from '@phosphor-icons/react';
import { agoLabel as ago } from '../../utils/dates';
import { supabase } from '../../lib/supabaseClient';
import { LineRow, SectionHead, StatusPill } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { getCurrentMemberId } from '../../services/bookingService';
import { getTodayExtras } from '../../services/memberHomeService';
import { getOpenRoutineSession, getRoutine, listRoutines, type Routine } from '../../lib/api/routines';
import { DAY_LABELS, listMyPlan } from '../../lib/api/gymPlans';
import { programProgress, startProgramDay, type ProgressDay } from '../../lib/api/programs';
import { startPlannedRoutine } from '../../lib/startPlannedRoutine';
import { useGymApp } from '../../hooks/useGymApp';
import { useFeatures } from '../../hooks/useFeatures';
import { isEnabled } from '../../lib/api/planFeatures';
import { moduleOn } from '../../lib/gymApp';
import { errorMessage } from '../../utils/errorMessage';
import { useT } from '../../lib/i18n';

interface Plan {
  /** The weekdays the member trains (gym_plans), Monday first; empty when none are set. */
  days: number[];
  /** The gym program they follow (0122): its name, the next day not done, and how many weeks. */
  program: { name: string; next: ProgressDay | null; weeks: number } | null;
  /** Today's planned routine, read the same way Today reads it. */
  routine: Routine | null;
  /** A workout already under way — "Continue", not a second start. */
  openLogId: string | null;
  /** The last finished workout, for "last time …". */
  last: { at: string } | null;
  /** The member's own saved workouts; null when they could not be read. */
  saved: number | null;
}

/**
 * Train → Workout (simplify, 2026-10-28; the tab Train opens on). Five places
 * for "what do I do today" became two sections:
 *
 *   Your plan   your week and the program you follow, today's workout with
 *               its Start (a planned routine, else the program's next day),
 *               and your own saved workouts
 *   Library     free workouts (never gated) and programs to start
 *
 * Nothing new is read: the week is gym_plans, today's routine is the same
 * `getTodayExtras` Today uses, the program is `programProgress`.
 */
export default function WorkoutHome() {
  const navigate = useNavigate();
  const t = useT();
  const app = useGymApp();
  const { features } = useFeatures();
  const locked = features != null && !isEnabled(features, 'workout_tracker');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const programsOn = moduleOn(app, 'programs');
  const progressOn = moduleOn(app, 'progress');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) return;
        const [extras, open, week, prog, routines, lastLog] = await Promise.all([
          getTodayExtras(id), getOpenRoutineSession(id).catch(() => null), listMyPlan(id).catch(() => []),
          programProgress(id).catch(() => [] as ProgressDay[]), listRoutines(id).catch(() => null),
          supabase.from('workout_logs').select('completed_at').eq('member_id', id)
            .not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        const routine = extras.todayRoutine ? await getRoutine(extras.todayRoutine.id) : null;
        const last = (lastLog.error ? null : lastLog.data) as { completed_at: string } | null;
        if (!alive) return;
        setMemberId(id);
        setPlan({
          days: week.map((d) => d.day_of_week).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)),
          program: prog.length > 0 ? {
            name: prog[0].programName, next: prog.find((d) => !d.done) ?? null,
            weeks: Math.max(...prog.map((d) => d.week)),
          } : null,
          routine, openLogId: open?.logId ?? null, last: last ? { at: last.completed_at } : null,
          saved: routines ? routines.length : null,
        });
      } catch {
        if (alive) setPlan({ days: [], program: null, routine: null, openLogId: null, last: null, saved: null });
      }
    })();
    return () => { alive = false; };
  }, []);

  const r = plan?.routine ?? null;
  const next = programsOn ? plan?.program?.next ?? null : null;

  const start = async () => {
    if (locked || !memberId || !plan) { navigate('/member/track'); return; }
    if (plan.openLogId) { navigate(`/member/track/session/${plan.openLogId}`); return; }
    setBusy(true);
    try {
      if (r) navigate(await startPlannedRoutine(memberId, r.id));
      else if (next) navigate(`/member/track/session/${await startProgramDay(next.dayId)}`);
      else navigate('/member/track');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start that workout'));
      if (err instanceof Error && /routine is gone/.test(err.message)) navigate('/member/gym-plan');
    } finally {
      setBusy(false);
    }
  };

  const weekTitle = plan && plan.days.length > 0 ? plan.days.map((d) => t(DAY_LABELS[d])).join(' · ') : t('Plan your week');
  const weekMeta = plan?.program && programsOn
    ? `${t('Following')}: ${plan.program.name}${plan.program.next ? `, ${t('week')} ${plan.program.next.week} ${t('of')} ${plan.program.weeks}` : ` · ${t('every day done')}`}`
    : plan && plan.days.length > 0 ? t('Your training days and reminders') : t('Pick your training days and get a reminder');

  const todayTitle = plan?.openLogId ? t('A workout is under way')
    : r ? `${t('Today')}: ${r.name}`
    : next ? `${t('Next')}: ${next.workoutName}`
    : t('Nothing planned today');
  const todayMeta = plan?.openLogId ? t('Pick up where you left off') : [
    r ? `${r.exercises.length} ${r.exercises.length === 1 ? t('exercise') : t('exercises')}`
      : next ? `${t('Week')} ${next.week} · ${t('Day')} ${next.day}` : t('Start one of your workouts, or an empty one'),
    plan?.last ? `${t('last time')} ${ago(plan.last.at)}` : null,
  ].filter(Boolean).join(' · ');
  const startLabel = locked ? t('See workouts') : plan?.openLogId ? t('Continue') : r || next ? t('Start') : t('Start one');

  const library: { label: string; blurb: string; path: string; icon: Icon; on: boolean }[] = [
    { label: 'Free workouts', blurb: 'No plan needed', path: '/member/workouts', icon: Books, on: true },
    { label: 'Programs', blurb: 'Multi-week plans to follow', path: '/member/programs', icon: CalendarDots, on: programsOn },
  ];

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <section aria-label={t('Your plan')} data-your-plan>
        <SectionHead title={t('Your plan')} />
        {plan == null ? <SkeletonList count={3} /> : (
          <>
            {progressOn && (
              <LineRow icon={CalendarCheck} tone="mine" title={weekTitle} meta={weekMeta} onClick={() => navigate('/member/gym-plan')} />
            )}
            <div data-train-today>
              <LineRow icon={locked ? Lock : Barbell} tone="act" title={todayTitle} meta={todayMeta}
                action={<StatusPill label={busy ? t('Starting…') : startLabel} tone="action" />}
                onClick={busy ? undefined : () => void start()} last={!progressOn} />
            </div>
            {progressOn && (
              <LineRow icon={ListChecks} tone="info" title={t('Your workouts')} last
                meta={plan.saved == null ? t('Your saved workouts') : `${plan.saved} ${t('saved')} · ${t('make your own')}`}
                onClick={() => navigate('/member/track')} />
            )}
          </>
        )}
      </section>

      <section aria-label={t('Library')} data-library>
        <SectionHead title={t('Library')} />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
          {library.filter((d) => d.on).map((d) => {
            const I = d.icon;
            return (
              <button key={d.path} type="button" onClick={() => navigate(d.path)} data-library-tile className="noc-press flex flex-col text-left"
                style={{ gap: 4, alignItems: 'flex-start', padding: 14, borderRadius: 14, border: '1px solid var(--color-hairline)', background: 'var(--color-surface)' }}>
                <I size={22} aria-hidden style={{ color: 'var(--color-primary-300)' }} />
                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{t(d.label)}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t(d.blurb)}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
