import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Books, CalendarBlank, Sparkle } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, LineRow, NocButton, Panel, SectionHead, SeeAll, StatusPill } from '../components/ui/noc';
import WeekMarks from '../components/ui/WeekMarks';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { getCurrentMemberId } from '../services/bookingService';
import { loadTrainingPlan, type TrainingPlanView } from '../services/trainingPlanService';
import { listGymPrograms, programProgress, startProgramDay, type ProgressDay } from '../lib/api/programs';
import { routineSourceLabel, routineSummary, startRoutineSession, type Routine } from '../lib/api/routines';
import { todayDow } from '../lib/api/gymPlans';
import { coachReady } from '../lib/api/aiCoach';
import { markWorkoutsIntroSeen, workoutsIntroSeen } from '../lib/api/workoutsIntro';
import { useGymApp } from '../hooks/useGymApp';
import { useFeatures } from '../hooks/useFeatures';
import { isEnabled } from '../lib/api/planFeatures';
import { Lock } from '@phosphor-icons/react';
import { word } from '../lib/gymApp';
import { errorMessage } from '../utils/errorMessage';

/**
 * Workouts → Today (2026-10-10). One section replaced four overlapping tabs
 * (This week · Programs · Routines · Free workouts), with the three words used
 * one way everywhere:
 *
 *   workout  one session, today        routine  a saved, repeatable list
 *   program  weeks that build on each other (heavier, more reps)
 *
 * The first visit explains those in order — 1 your program, 2 your routines,
 * 3 today's workout — until the member starts a first workout or taps Skip
 * (0172, per member, in the database). After that this screen is just today:
 * the next workout with one Start, "or do something else", and the week. With
 * no program and no plan for today it says what to do next — "No program? No
 * problem" — rather than a blank.
 */
type Next =
  | { kind: 'program'; day: ProgressDay; total: number; done: number }
  | { kind: 'routine'; routine: Routine }
  | null;

export default function WorkoutsToday() {
  const navigate = useNavigate();
  const app = useGymApp();
  // Routines are the tracker (0049's workout_tracker): a plan without it sees
  // them locked and explained here too, never started from this screen.
  const { features, loading: featuresLoading } = useFeatures();
  const tracker = isEnabled(features, 'workout_tracker');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [plan, setPlan] = useState<TrainingPlanView | null>(null);
  const [progress, setProgress] = useState<ProgressDay[]>([]);
  const [gymPrograms, setGymPrograms] = useState(0);
  const [coach, setCoach] = useState(false);
  const [intro, setIntro] = useState<boolean | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Your session could not be verified.');
        const [p, prog, gym, seen, ready] = await Promise.all([
          loadTrainingPlan(id), programProgress(id), listGymPrograms().catch(() => null),
          workoutsIntroSeen(id), coachReady().catch(() => false),
        ]);
        if (!alive) return;
        setMemberId(id); setPlan(p); setProgress(prog); setGymPrograms(gym?.length ?? 0);
        setIntro(!seen); setCoach(ready);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your workouts.'));
      }
    })();
    return () => { alive = false; };
  }, []);

  if (error) return <Page><PageTitle back title="Workouts" /><p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p></Page>;
  if (!plan || intro === null || featuresLoading) return <Page><PageTitle back title="Workouts" /><SkeletonList count={3} /></Page>;

  // The next workout: the program's first day not done, else today's planned routine.
  const programDays = progress;
  const nextDay = programDays.find((d) => !d.done) ?? null;
  const dow = todayDow();
  const plannedId = plan.days.includes(dow) ? plan.routineByDay[dow] ?? null : null;
  const routines = tracker ? plan.routines ?? [] : [];
  const planned = plannedId ? routines.find((r) => r.id === plannedId) ?? null : null;
  const next: Next = nextDay
    ? { kind: 'program', day: nextDay, total: programDays.length, done: programDays.filter((d) => d.done).length }
    : planned ? { kind: 'routine', routine: planned } : null;
  const others = routines.filter((r) => next?.kind !== 'routine' || r.id !== next.routine.id);
  const trainerCap = word(app, 'trainer', true);

  const start = async () => {
    if (!memberId || !next || busy) return;
    setBusy(true);
    try {
      const logId = next.kind === 'program'
        ? await startProgramDay(next.day.dayId)
        : await startRoutineSession(memberId, next.routine);
      void markWorkoutsIntroSeen();
      navigate(`/member/track/session/${logId}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start that workout'));
      setBusy(false);
    }
  };
  const skip = () => { void markWorkoutsIntroSeen(); setIntro(false); setShowIntro(false); };

  const nextTitle = next?.kind === 'program' ? `${next.day.workoutName} · Week ${next.day.week}, Day ${next.day.day}`
    : next?.kind === 'routine' ? next.routine.name : null;
  const nextMeta = next?.kind === 'program' ? `From the ${next.day.programName} program · ${next.done} of ${next.total} days done`
    : next?.kind === 'routine' ? `Your plan for today · ${routineSummary(next.routine)}` : null;

  const noProgram = (
    <Panel>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>No program? No problem</p>
      <p style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
        Nothing is planned for today. Pick something to do, or let someone build you a plan.
      </p>
      <div style={{ marginTop: 8 }}>
        <LineRow gutter={<Books size={20} />} gutterWidth={36} title="Browse the free library" meta="Workouts and exercises — always free"
          onClick={() => navigate('/member/workouts')} last={!coach && gymPrograms === 0} />
        {coach && (
          <LineRow gutter={<Sparkle size={20} />} gutterWidth={36} title="Ask the AI coach to build one" meta="A routine or a program around your goals"
            onClick={() => navigate('/member/chatbot')} last={gymPrograms === 0} />
        )}
        {gymPrograms > 0 && (
          <LineRow gutter={<CalendarBlank size={20} />} gutterWidth={36} title={`Your gym's programs · ${gymPrograms}`} meta="Weeks that build on each other"
            onClick={() => navigate('/member/programs')} last />
        )}

      </div>
    </Panel>
  );

  // ---- The introduction: shown once, in order ----
  if (intro || showIntro) {
    const step = (n: number, title: string, body: string, amber = false) => (
      <div className="flex items-start" style={{ gap: 12 }} data-intro-step={n}>
        <span className="flex-none grid place-items-center" style={{ width: 28, height: 28, borderRadius: 14, fontSize: 13, fontWeight: 800,
          background: amber ? 'var(--color-secondary)' : 'var(--color-primary)', color: amber ? 'var(--color-bg)' : '#fff' }}>{n}</span>
        <div className="min-w-0">
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</p>
          <p style={{ fontSize: 13, marginTop: 2, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{body}</p>
        </div>
      </div>
    );
    return (
      <Page>
        <PageTitle back title="Workouts" subtitle="Three things, in order. Skip any time." />
        <div className="flex flex-col" style={{ gap: 18 }}>
          {step(1, 'A program', nextDay
            ? `The long plan: weeks that build on each other. You follow ${nextDay.programName} — ${programDays.filter((d) => d.done).length} of ${programDays.length} days done.`
            : 'The long plan: weeks that build on each other, heavier or longer each week. Optional — follow one from your gym, your coach or the AI coach.')}
          {step(2, 'Your routines', routines.length
            ? `Saved lists you repeat — ${routines.length} so far: ${routines.slice(0, 3).map((r) => `${r.name} (${routineSourceLabel(r, trainerCap)})`).join(', ')}.`
            : 'Saved lists you repeat, like "Monday chest". Yours, or from your coach or the AI coach — each says which.')}
          {step(3, "Today's workout", nextTitle ? `${nextTitle}. One session — start it and tick off your sets.` : 'One session, today. With nothing planned, pick one from the library.', true)}
        </div>
        {next ? (
          <NocButton variant="fill" onClick={() => void start()} disabled={busy} style={{ marginTop: 22 }}>
            {busy ? 'Starting…' : "Start today's workout"}
          </NocButton>
        ) : <div style={{ marginTop: 18 }}>{noProgram}</div>}
        <button type="button" onClick={skip} data-intro-skip
          style={{ marginTop: 14, fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-muted)', padding: '8px 0' }}>
          {intro ? 'Skip' : 'Close'}
        </button>
      </Page>
    );
  }

  // ---- Today ----
  return (
    <Page>
      <PageTitle back title="Workouts" subtitle="Today's workout, your routines, your programs" />
      {next ? (
        <Panel glow="action" filled>
          <Eyebrow>Today's workout</Eyebrow>
          <p style={{ fontSize: 17, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }} data-next-workout>{nextTitle}</p>
          <p style={{ fontSize: 13, marginTop: 2, color: 'var(--color-text-secondary)' }}>{nextMeta}</p>
          <NocButton variant="fill" onClick={() => void start()} disabled={busy} style={{ marginTop: 12 }}>
            {busy ? 'Starting…' : 'Start workout'}
          </NocButton>
        </Panel>
      ) : noProgram}

      {others.length > 0 && (
        <section>
          <SectionHead title={next ? 'Or do something else today' : 'Your routines'} />
          {others.slice(0, 3).map((r, i, list) => (
            <LineRow key={r.id} title={r.name} meta={routineSummary(r)} last={i === list.length - 1}
              action={<StatusPill label={routineSourceLabel(r, trainerCap)} tone={r.source === 'member' ? 'muted' : 'structure'} />}
              onClick={() => navigate(`/member/track/routine/${r.id}`)} />
          ))}
          {others.length > 3 && <SeeAll count={others.length} onClick={() => navigate('/member/track')} />}
        </section>
      )}

      {!tracker && (
        <LineRow gutter={<Lock size={18} />} gutterWidth={32} title="Routines are part of a paid plan"
          meta="Save workouts you repeat and let the app walk you through them" onClick={() => navigate('/member/track')} />
      )}

      {plan.weekCheckIns && (
        <section>
          <SectionHead title="This week" meta={plan.days.length ? `${plan.days.length} days planned` : undefined} />
          <div style={{ marginTop: 8 }}>
            <WeekMarks days={plan.weekCheckIns} dayNumbers={plan.weekDayNumbers} todayIndex={dow} planned={plan.days} />
          </div>
          <SeeAll label="Plan your week" onClick={() => navigate('/member/gym-plan')} />
        </section>
      )}

      <button type="button" onClick={() => setShowIntro(true)} data-how-it-works
        style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary-300)', padding: '8px 0', alignSelf: 'flex-start' }}>
        How this works
      </button>
    </Page>
  );
}
