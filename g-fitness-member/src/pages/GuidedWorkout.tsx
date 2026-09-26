import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, CaretDown, CaretLeft, CaretRight, Check, CheckCircle, CloudSlash, Flag, ListBullets, Pause, Play, Plus,
  SpeakerHigh, SpeakerSlash, SunDim, Timer, TrendUp, Trophy,
} from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { PageTitle } from '../components/ui/page';
import { NocButton } from '../components/ui/noc';
import FeatureLock from '../components/ui/FeatureLock';
import Modal from '../components/ui/Modal';
import GlassSheet from '../components/ui/GlassSheet';
import { ExerciseGuideFor } from '../components/workout/ExerciseGuide';
import { getGymWorkoutRoutine } from '../lib/api/programs';
import { toast } from '../components/ui/Toast';
import { Confetti, CountRing, Stepper, WorkoutBackdrop } from '../components/workout/WorkoutParts';
import { beep, buzz, glassCard, iconFor, useWakeLock } from '../components/workout/workoutFx';
import {
  addSet, completeSession, deleteSet, listSets, type WorkoutSet,
} from '../lib/api/workoutSets';
import {
  discardSession, getRoutine, getSession, lastSetsFor,
  type LastSet, type Routine, type RoutineExercise, type SessionHeader,
} from '../lib/api/routines';
import { errorMessage } from '../utils/errorMessage';
import { getCurrentMemberId } from '../services/bookingService';
import {
  dropQueued, flushOutbox, isNetworkError, newSetId, pendingFor, queueSet, type QueuedSet,
} from '../lib/offlineSets';

/** A set still on the phone, drawn like one the server has. */
const fromQueued = (q: QueuedSet): WorkoutSet => ({
  id: q.id, exerciseId: q.set.exerciseId ?? null, customName: q.set.customName ?? null, setNumber: q.set.setNumber,
  reps: q.set.reps ?? null, weightKg: q.set.weightKg ?? null, durationSeconds: q.set.durationSeconds ?? null, distanceM: null,
});

/** The values being typed into one not-yet-logged set. */
interface Draft { reps: string; kg: string; secs: string }

interface Finished { minutes: number; sets: number; volume: number; beat: number }

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

type SetLike = { reps: number | null; weightKg: number | null; durationSeconds: number | null };

function describeSet(s: SetLike): string {
  if (s.durationSeconds != null) return `${s.durationSeconds} s`;
  return s.weightKg != null ? `${s.weightKg} kg × ${s.reps ?? 0}` : `${s.reps ?? 0} reps`;
}

function describeDraft(d: Draft, timed: boolean): string {
  if (timed) return `${d.secs || '—'} s`;
  return d.kg ? `${d.kg} kg × ${d.reps || '—'}` : `${d.reps || '—'} reps`;
}

function targetLine(e: RoutineExercise): string {
  const work = e.isTimed
    ? `${e.targetSeconds ?? '—'} s`
    : `${e.targetReps ?? '—'} reps${e.targetWeightKg != null ? ` @ ${e.targetWeightKg} kg` : ''}`;
  const rest = e.restSeconds > 0 ? ` · ${clock(e.restSeconds)} rest` : '';
  return `${e.targetSets} × ${work}${rest}`;
}

/**
 * Did this set beat the same set last time? Weighted sets compare an estimated
 * one-rep max (Epley: kg × (1 + reps/30)), so 62.5 × 5 does not "beat" 60 × 10;
 * bodyweight sets compare reps, timed sets seconds. Nothing is stored — it is
 * worked out from last session's sets (member_last_sets) every time.
 */
function beatLast(s: SetLike, p: LastSet | undefined): boolean {
  if (!p) return false;
  if (s.durationSeconds != null || p.durationSeconds != null) return (s.durationSeconds ?? 0) > (p.durationSeconds ?? 0);
  const sw = s.weightKg ?? 0;
  const pw = p.weightKg ?? 0;
  const sr = s.reps ?? 0;
  const pr = p.reps ?? 0;
  if (sw > 0 && pw > 0) return sw * (1 + sr / 30) > pw * (1 + pr / 30) + 1e-9;
  if (sw === 0 && pw === 0) return sr > pr;
  return sw > 0 && sr >= pr;
}

const keyOf = (e: RoutineExercise) => e.exerciseId ?? `custom:${e.customName}`;
const setsFor = (sets: WorkoutSet[], e: RoutineExercise) =>
  sets.filter((s) => (e.exerciseId ? s.exerciseId === e.exerciseId : s.customName === e.customName))
    .sort((a, b) => a.setNumber - b.setNumber);

/**
 * A routine, run set by set (0086) — full screen since 2026-09-19.
 *
 * The shell drops its bar and chat head on this route (Layout's IMMERSIVE), so
 * the screen is the workout: the exercise's glyph blurred behind it, one set in
 * focus with big − / + controls, and a rest that takes over the screen with a
 * ring, a 3-2-1 and what comes next. The screen is kept awake while it runs.
 *
 * Logging a set writes it at once — a phone that dies mid-workout loses nothing
 * — and starts the rest the routine set for that exercise. After the last one,
 * **Finish workout** closes the session, which is what awards the points (0051)
 * and puts it on the day in Attendance.
 *
 * The database is the state. Reopening after a lock or a reload finds the sets
 * already written and resumes at the first unfinished exercise.
 */
export default function GuidedWorkout() {
  return (
    <div className="absolute inset-0 overflow-y-auto scrollbar-hide" style={{ padding: 'var(--gutter)' }}>
      <FeatureLock feature="workout_tracker" context={<PageTitle title="Workout" back fallback="/member/track" />}>
        <WorkoutRun />
      </FeatureLock>
    </div>
  );
}

function WorkoutRun() {
  const navigate = useNavigate();
  const { logId } = useParams();
  const [session, setSession] = useState<SessionHeader | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [last, setLast] = useState<Map<string, LastSet[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [started, setStarted] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState<Set<number>>(new Set());
  /** Moved past with no set logged — out of the way, but not counted as done. */
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [extra, setExtra] = useState<Record<number, number>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  /** The set the member tapped to work on; null means "the first one not logged". */
  const [focusSet, setFocusSet] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  /** The rest folded down to a pill, to look at the sets while it runs. */
  const [restMin, setRestMin] = useState(false);
  const [holdStart, setHoldStart] = useState<number | null>(null);
  const [sound, setSound] = useState(true);
  const [overview, setOverview] = useState(false);
  /** The gym's guide for the exercise on screen (0121). */
  const [howTo, setHowTo] = useState(false);
  /** The set just logged, for its one ring-out. */
  const [flash, setFlash] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [done, setDone] = useState<Finished | null>(null);
  /** Who is signed in — the offline outbox only ever sends this member's sets. */
  const [memberId, setMemberId] = useState<string | null>(null);
  /** Ids of sets saved on the phone and not yet on the server (lib/offlineSets.ts). */
  const [queued, setQueued] = useState<Set<string>>(new Set());

  // What the clock below needs without re-subscribing: the rest end, whether
  // sound is on, which countdown second already beeped, and the hold.
  const restEndRef = useRef<number | null>(null);
  const soundRef = useRef(true);
  const beepedRef = useRef<number | null>(null);
  const holdRef = useRef<{ start: number; target: number | null; alerted: boolean } | null>(null);

  const setRest = useCallback((end: number | null) => {
    restEndRef.current = end;
    beepedRef.current = null;
    setRestEnd(end);
  }, []);

  const toggleSound = () => {
    soundRef.current = !soundRef.current;
    setSound(soundRef.current);
    if (soundRef.current) beep(880, 90);
  };

  // One clock for the elapsed time, the rest and a hold. The rest beeps on its
  // last three seconds and ends on its own with a buzz; a hold buzzes once when
  // it reaches the routine's target.
  useEffect(() => {
    const t = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      const end = restEndRef.current;
      if (end != null) {
        const left = Math.ceil((end - at) / 1000);
        if (at >= end) {
          restEndRef.current = null;
          beepedRef.current = null;
          setRestEnd(null);
          buzz([180, 80, 180]);
          if (soundRef.current) beep(988, 320, 0.18);
        } else if (left >= 1 && left <= 3 && beepedRef.current !== left) {
          beepedRef.current = left;
          if (soundRef.current) beep(660, 110);
        }
      }
      const h = holdRef.current;
      if (h && h.target && !h.alerted && at - h.start >= h.target * 1000) {
        h.alerted = true;
        buzz([120, 60, 120]);
        if (soundRef.current) beep(988, 260, 0.18);
      }
    }, 250);
    return () => window.clearInterval(t);
  }, []);

  const awake = useWakeLock(!loading && !error && !done && routine != null);

  /** The server's sets plus any still waiting on this phone. */
  const refresh = useCallback(async (id: string, member: string | null) => {
    const server = await listSets(id);
    const waiting = member ? pendingFor(id, member).filter((q) => !server.some((s) => s.id === q.id)) : [];
    setSets([...server, ...waiting.map(fromQueued)]);
    setQueued(new Set(waiting.map((q) => q.id)));
  }, []);

  // Send what is waiting whenever the connection comes back, and every 15 s
  // while anything is waiting (the "online" event is not reliable on Android).
  useEffect(() => {
    if (!logId || !memberId || queued.size === 0) return;
    const push = async () => {
      const { sent } = await flushOutbox(memberId);
      if (sent > 0) {
        await refresh(logId, memberId).catch(() => undefined);
        toast.success(sent === 1 ? 'Back online — your set is saved' : `Back online — ${sent} sets saved`);
      }
    };
    window.addEventListener('online', push);
    const t = window.setInterval(() => { void push(); }, 15_000);
    return () => { window.removeEventListener('online', push); window.clearInterval(t); };
  }, [logId, memberId, queued.size, refresh]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!logId) throw new Error('No workout to open.');
        const s = await getSession(logId);
        if (!s) throw new Error('That workout could not be found.');
        if (!s.routineId && !s.gymWorkoutId) { navigate('/member/track/log', { replace: true }); return; }
        // A program day (0122) runs the gym's workout in the same player.
        const [r, serverSets, me] = await Promise.all([
          s.routineId ? getRoutine(s.routineId) : getGymWorkoutRoutine(s.gymWorkoutId!),
          listSets(logId), getCurrentMemberId(),
        ]);
        // Anything logged offline last time is shown straight away and sent below.
        const waiting = me ? pendingFor(logId, me).filter((q) => !serverSets.some((x) => x.id === q.id)) : [];
        const recorded = [...serverSets, ...waiting.map(fromQueued)];
        if (!r) throw new Error('The routine for this workout was deleted. Finish or discard it from My routines.');
        const lastMap = await lastSetsFor(r.exercises.map((e) => e.exerciseId).filter(Boolean) as string[])
          .catch(() => new Map<string, LastSet[]>());
        if (!alive) return;
        setSession(s);
        setRoutine(r);
        setSets(recorded);
        setMemberId(me);
        setQueued(new Set(waiting.map((q) => q.id)));
        setLast(lastMap);
        // Resume: every exercise with its target reached is done; start at the
        // first that is not. Ones with sets already are "started".
        const doneSet = new Set<number>();
        const startedSet = new Set<number>();
        r.exercises.forEach((e, i) => {
          const n = setsFor(recorded, e).length;
          if (n > 0) startedSet.add(i);
          if (n >= e.targetSets) doneSet.add(i);
        });
        setFinished(doneSet);
        setStarted(startedSet);
        const firstOpen = r.exercises.findIndex((_, i) => !doneSet.has(i));
        setIdx(firstOpen === -1 ? r.exercises.length - 1 : firstOpen);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not open this workout'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [logId, navigate]);

  const ex = routine?.exercises[idx] ?? null;
  const exSets = ex ? setsFor(sets, ex) : [];
  const lastSets = ex?.exerciseId ? last.get(ex.exerciseId) ?? [] : [];
  const rows = ex ? Math.max(ex.targetSets + (extra[idx] ?? 0), exSets.length) : 0;
  const total = routine?.exercises.length ?? 0;
  const doneCount = [...finished].filter((i) => !skipped.has(i)).length;
  const allDone = total > 0 && doneCount === total;
  const elapsed = session ? (now - new Date(session.startedAt).getTime()) / 1000 : 0;
  const restLeft = restEnd == null ? 0 : Math.max(0, (restEnd - now) / 1000);
  const holdSecs = holdStart == null ? 0 : (now - holdStart) / 1000;
  const setNumbers = Array.from({ length: rows }, (_, i) => i + 1);
  const loggedAt = (n: number) => exSets.find((s) => s.setNumber === n) ?? null;
  const firstOpen = setNumbers.find((n) => !loggedAt(n)) ?? null;
  const focus = focusSet != null && focusSet <= rows && !loggedAt(focusSet) ? focusSet : firstOpen;
  const isStarted = started.has(idx) || exSets.length > 0;
  const prevFor = (n: number) => lastSets.find((l) => l.setNumber === n);

  /** A set's typed values, defaulting to the routine's target — or last time's when no target was set. */
  const draftFor = (setNumber: number): Draft => {
    const key = `${idx}:${setNumber}`;
    if (drafts[key]) return drafts[key];
    const prev = prevFor(setNumber) ?? lastSets[lastSets.length - 1];
    return {
      reps: ex?.targetReps != null ? String(ex.targetReps) : prev?.reps != null ? String(prev.reps) : '',
      kg: ex?.targetWeightKg != null ? String(ex.targetWeightKg) : prev?.weightKg != null ? String(prev.weightKg) : '',
      secs: ex?.targetSeconds != null ? String(ex.targetSeconds) : prev?.durationSeconds != null ? String(prev.durationSeconds) : '',
    };
  };
  const setDraft = (setNumber: number, p: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [`${idx}:${setNumber}`]: { ...draftFor(setNumber), ...p } }));

  /** Starts the countdown. The screen clock, not Date.now(): at most a quarter-second behind. */
  const startRest = (seconds: number) => {
    if (seconds <= 0) return;
    setRestTotal(seconds);
    setRestMin(false);
    setRest(now + seconds * 1000);
  };

  const tick = async (setNumber: number, override?: Partial<Draft>) => {
    if (!ex || !logId || busy) return;
    const d = { ...draftFor(setNumber), ...override };
    const reps = ex.isTimed ? null : Number(d.reps);
    const secs = ex.isTimed ? Number(d.secs) : null;
    if (ex.isTimed ? !(secs && secs > 0) : !(reps && reps > 0)) {
      toast.error(ex.isTimed ? 'How many seconds did you hold it?' : 'How many reps did you do?');
      return;
    }
    const weightKg = ex.isTimed || d.kg.trim() === '' ? null : Number(d.kg);
    setBusy(true);
    try {
      const payload = {
        exerciseId: ex.exerciseId,
        customName: ex.exerciseId ? null : ex.customName,
        setNumber,
        reps,
        weightKg,
        durationSeconds: secs,
      };
      const id = newSetId();
      try {
        await addSet(logId, payload, id);
        await refresh(logId, memberId);
      } catch (err) {
        // No signal: keep it on the phone and carry on as if it had saved —
        // the rest timer and the next set must not wait for the network.
        if (!memberId || !isNetworkError(err)) throw err;
        queueSet({ id, logId, memberId, set: payload, queuedAt: now });   // the screen clock, as startRest uses
        setSets((xs) => [...xs, fromQueued({ id, logId, memberId, set: payload, queuedAt: 0 })]);
        setQueued((q) => new Set(q).add(id));
        toast.info('No signal — saved on this phone. It uploads by itself when you are back online.');
      }
      setStarted((s) => new Set(s).add(idx));
      setFocusSet(null);
      setFlash(setNumber);
      if (beatLast({ reps, weightKg, durationSeconds: secs }, prevFor(setNumber))) {
        toast.success(`Set ${setNumber}: you beat last time`);
      }
      const doneNow = exSets.length + 1;
      const exerciseDone = doneNow >= ex.targetSets;
      if (exerciseDone) {
        setFinished((f) => new Set(f).add(idx));
        setSkipped((k) => { const n = new Set(k); n.delete(idx); return n; });
      }
      // Rest after every set — the last set of an exercise included, as the
      // break before the next one — except the very last set of the workout.
      const lastOfWorkout = exerciseDone
        && (routine?.exercises.every((_, i) => i === idx || finished.has(i)) ?? true);
      if (!lastOfWorkout) startRest(ex.restSeconds);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that set'));
    } finally {
      setBusy(false);
    }
  };

  const untick = async (s: WorkoutSet) => {
    if (!logId || busy) return;
    setBusy(true);
    try {
      if (queued.has(s.id)) {
        // Never reached the server — take it off the phone's list instead.
        dropQueued(s.id);
        setSets((xs) => xs.filter((x) => x.id !== s.id));
        setQueued((q) => { const n = new Set(q); n.delete(s.id); return n; });
      } else {
        await deleteSet(s.id);
        await refresh(logId, memberId);
      }
      setFinished((f) => { const n = new Set(f); n.delete(idx); return n; });
      setFocusSet(s.setNumber);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not undo that set'));
    } finally {
      setBusy(false);
    }
  };

  const startHold = () => {
    const start = Date.now();
    holdRef.current = { start, target: ex?.targetSeconds ?? null, alerted: false };
    setHoldStart(start);
    setStarted((s) => new Set(s).add(idx));
    if (soundRef.current) beep(880, 90);
  };
  const stopHold = (setNumber: number) => {
    const secs = Math.round(holdSecs);
    holdRef.current = null;
    setHoldStart(null);
    if (secs < 1) return;
    setDraft(setNumber, { secs: String(secs) });
    void tick(setNumber, { secs: String(secs) });
  };

  const go = (to: number) => {
    setIdx(to);
    setFocusSet(null);
    setFlash(null);
    holdRef.current = null;
    setHoldStart(null);
  };

  /** Moves on. With no set logged it is a skip, and a skip is not "done". */
  const finishExercise = () => {
    if (exSets.length === 0) setSkipped((k) => new Set(k).add(idx));
    setFinished((f) => new Set(f).add(idx));
    // A rest already running carries on into the next exercise.
    const next = routine?.exercises.findIndex((_, i) => i > idx && !finished.has(i)) ?? -1;
    if (next !== -1) go(next);
    else {
      const any = routine?.exercises.findIndex((_, i) => i !== idx && !finished.has(i)) ?? -1;
      if (any !== -1) go(any);
    }
  };

  const finishWorkout = async () => {
    if (!logId || busy || !routine) return;
    if (sets.length === 0) { toast.error('Log at least one set first, or discard the workout.'); return; }
    // Finishing is what awards the points, so every set must be on the server first.
    if (queued.size > 0 && memberId) {
      const { left } = await flushOutbox(memberId);
      if (left > 0) {
        toast.error(`${left} ${left === 1 ? 'set is' : 'sets are'} still waiting for signal. Finish when you are back online — nothing is lost.`);
        return;
      }
      await refresh(logId, memberId).catch(() => undefined);
    }
    setBusy(true);
    try {
      const minutes = Math.max(1, Math.round(elapsed / 60));
      await completeSession(logId, minutes);
      const volume = sets.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
      const beat = routine.exercises.reduce((n, e) => {
        const prev = e.exerciseId ? last.get(e.exerciseId) ?? [] : [];
        return n + setsFor(sets, e).filter((s) => beatLast(s, prev.find((l) => l.setNumber === s.setNumber))).length;
      }, 0);
      setRest(null);
      setDone({ minutes, sets: sets.length, volume, beat });
      buzz([90, 60, 90, 60, 220]);
      if (soundRef.current) { beep(784, 140); window.setTimeout(() => beep(1047, 260, 0.18), 150); }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not finish the workout'));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!logId) return;
    try {
      await discardSession(logId);
      toast.success('Workout discarded.');
      navigate('/member/track', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not discard the workout'));
    }
  };

  // ── Loading, failure, finished ───────────────────────────────────────────
  if (loading) return <SkeletonList count={4} />;
  if (error || !routine || !ex) {
    return (
      <div className="flex flex-col" style={{ gap: 14 }}>
        <PageTitle title="Workout" back fallback="/member/track" />
        <p role="alert" style={{ fontSize: 14, color: 'var(--color-secondary)' }}>{error ?? 'This routine has no exercises.'}</p>
        <NocButton variant="ghost" onClick={() => navigate('/member/track')}>Back to My routines</NocButton>
      </div>
    );
  }

  if (done) {
    return (
      <div className="absolute inset-0 flex flex-col overflow-hidden">
        <WorkoutBackdrop icon={Trophy} cue="done" />
        <Confetti />
        <FinishView routine={routine} sets={sets} last={last} done={done}
          onAttendance={() => navigate('/member/attendance-history')}
          onRoutines={() => navigate('/member/track', { replace: true })} />
      </div>
    );
  }

  // ── The run ──────────────────────────────────────────────────────────────
  const status = skipped.has(idx) ? 'Skipped' : finished.has(idx) ? 'Done' : isStarted ? 'In progress' : 'Up next';
  const volumeHere = exSets.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
  const focusDraft = focus != null ? draftFor(focus) : null;
  const focusPrev = focus != null ? prevFor(focus) : undefined;

  const nextIdx = (() => {
    const after = routine.exercises.findIndex((_, i) => i > idx && !finished.has(i));
    return after !== -1 ? after : routine.exercises.findIndex((_, i) => i !== idx && !finished.has(i));
  })();
  const upNext = !finished.has(idx) && firstOpen != null
    ? { title: `${ex.name} · set ${firstOpen} of ${rows}`, detail: describeDraft(draftFor(firstOpen), ex.isTimed) }
    : nextIdx !== -1
      ? { title: routine.exercises[nextIdx].name, detail: targetLine(routine.exercises[nextIdx]) }
      : { title: 'That was the last set', detail: 'Finish the workout when you are ready.' };

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <WorkoutBackdrop icon={iconFor(ex)} cue={keyOf(ex) + idx} />

      {/* ── Top bar ── */}
      <header className="relative flex items-center" style={{ gap: 10, padding: '10px var(--gutter) 0' }}>
        <RoundButton label="Leave the workout — it stays open to resume" onClick={() => navigate('/member/track')}>
          <CaretDown size={18} weight="bold" />
        </RoundButton>
        <div className="flex-1 min-w-0 text-center">
          <p className="truncate" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
            {routine.name}
          </p>
          <p className="inline-flex items-center justify-center tabular-nums" style={{ gap: 6, fontSize: 18, fontWeight: 700, marginTop: 1, color: 'var(--color-text-primary)' }}>
            {clock(elapsed)}
            {queued.size > 0 && (
              <span title="Saved on this phone, waiting for signal" aria-label={`${queued.size} waiting for signal`}
                className="inline-flex items-center" style={{ gap: 3, fontSize: 11.5, fontWeight: 600, color: 'var(--color-secondary)' }}>
                <CloudSlash size={14} weight="bold" /> {queued.size}
              </span>
            )}
            {awake && (
              <span title="Your screen stays on during the workout" aria-label="Screen stays on" className="inline-flex">
                <SunDim size={14} weight="fill" style={{ color: 'var(--color-primary-300)' }} />
              </span>
            )}
          </p>
        </div>
        <RoundButton label={sound ? 'Mute the timer sounds' : 'Turn the timer sounds on'} onClick={toggleSound}>
          {sound ? <SpeakerHigh size={17} /> : <SpeakerSlash size={17} />}
        </RoundButton>
        <RoundButton label="All exercises" onClick={() => setOverview(true)}>
          <ListBullets size={18} />
        </RoundButton>
      </header>

      {/* ── Where you are: one segment per exercise, filled by its sets ── */}
      <div className="relative flex" style={{ gap: 5, padding: '8px var(--gutter) 0' }} role="list" aria-label="Exercises">
        {routine.exercises.map((e, i) => {
          const n = setsFor(sets, e).length;
          const frac = skipped.has(i) ? 0 : Math.min(1, n / Math.max(1, e.targetSets));
          return (
            <button key={keyOf(e) + i} role="listitem" onClick={() => go(i)} className="flex-1 grid items-center"
              aria-label={`${e.name}: ${n} of ${e.targetSets} sets${i === idx ? ', current' : ''}`} style={{ height: 20 }}>
              <span className="relative block overflow-hidden" style={{
                height: i === idx ? 6 : 4, borderRadius: 3, background: 'rgba(233, 233, 237, 0.12)',
                boxShadow: i === idx ? '0 0 0 1px rgba(196, 181, 253, 0.45)' : undefined, transition: 'height 0.25s ease',
              }}>
                <span className="absolute inset-y-0 left-0" style={{
                  width: `${frac * 100}%`, background: 'linear-gradient(90deg, #7C3AED, #C4B5FD)',
                  boxShadow: '0 0 10px rgba(124, 58, 237, 0.9)', transition: 'width 0.5s var(--ease-out-soft)',
                }} />
              </span>
            </button>
          );
        })}
      </div>

      {/* ── The exercise ── */}
      <div className="relative flex-1 min-h-0 overflow-y-auto scrollbar-hide" style={{ padding: '10px var(--gutter) 20px' }}>
        <div key={idx} className="flex flex-col noc-gw-slide" style={{ gap: 18 }}>
          <div>
            <div className="flex items-center justify-between" style={{ gap: 12 }}>
              <StatusChip status={status} />
              <div className="flex items-center" style={{ gap: 4 }}>
                <RoundButton small label="Previous exercise" disabled={idx === 0} onClick={() => go(idx - 1)}>
                  <CaretLeft size={14} weight="bold" />
                </RoundButton>
                <span className="tabular-nums" style={{ fontSize: 12.5, minWidth: 38, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {idx + 1} / {total}
                </span>
                <RoundButton small label="Next exercise" disabled={idx === total - 1} onClick={() => go(idx + 1)}>
                  <CaretRight size={14} weight="bold" />
                </RoundButton>
              </div>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08, marginTop: 12, color: 'var(--color-text-primary)' }}>
              {ex.name}
            </h1>
            <div className="flex items-center justify-between" style={{ gap: 10, marginTop: 6 }}>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{targetLine(ex)}</p>
              {/* The gym's guide (0121), for a catalogue exercise. A custom one
                  the member typed has no guide to show. */}
              {ex.exerciseId && (
                <NocButton variant="ghost" onClick={() => setHowTo(true)} style={{ height: 32, padding: '0 12px', flex: 'none' }}>
                  How to
                </NocButton>
              )}
            </div>
            {lastSets.length > 0 && (
              <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-muted)' }}>
                Last time: {lastSets.map(describeSet).join(', ')}
              </p>
            )}
            <div className="grid" style={{ gridTemplateColumns: ex.isTimed ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
              <MiniStat value={`${exSets.length}/${ex.targetSets}`} label="sets" />
              {!ex.isTimed && <MiniStat value={Math.round(volumeHere).toLocaleString()} label="kg moved" />}
              <MiniStat value={ex.restSeconds > 0 ? clock(ex.restSeconds) : '—'} label="rest" />
            </div>
          </div>

          {/* ── The set in focus ── */}
          {isStarted && focus != null && focusDraft && (
            <section key={`focus-${focus}`} className="noc-gw-zoom" style={{ ...glassCard, padding: 18 }}>
              <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
                <p style={{ color: 'var(--color-text-primary)' }}>
                  <span style={{ fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Set </span>
                  <span style={{ fontSize: 24, fontWeight: 800 }}>{focus}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}> of {rows}</span>
                </p>
                {focusPrev && (
                  <span className="truncate" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Last time {describeSet(focusPrev)}</span>
                )}
              </div>

              {ex.isTimed ? (
                <div className="flex flex-col items-center" style={{ gap: 14, marginTop: 14 }}>
                  <CountRing size={176} stroke={9}
                    fraction={holdStart != null && ex.targetSeconds ? holdSecs / ex.targetSeconds : 0}>
                    <div>
                      <p className="tabular-nums" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: 'var(--color-text-primary)' }}>
                        {holdStart != null ? clock(holdSecs) : clock(Number(focusDraft.secs) || 0)}
                      </p>
                      <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>
                        {holdStart != null ? (ex.targetSeconds ? `target ${clock(ex.targetSeconds)}` : 'holding') : 'to log'}
                      </p>
                    </div>
                  </CountRing>
                  {holdStart != null ? (
                    <NocButton variant="fill" className="w-full" style={{ height: 52 }} icon={<Pause size={16} weight="fill" />}
                      disabled={busy} onClick={() => stopHold(focus)}>
                      Stop and log {Math.round(holdSecs)} s
                    </NocButton>
                  ) : (
                    <>
                      <div className="w-full" style={{ maxWidth: 220 }}>
                        <Stepper label="seconds" value={focusDraft.secs} step={5} onChange={(v) => setDraft(focus, { secs: v })} />
                      </div>
                      <div className="grid w-full" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                        <NocButton variant="structure" icon={<Play size={15} weight="fill" />} onClick={startHold}>Start hold</NocButton>
                        <NocButton variant="fill" icon={<Check size={15} weight="bold" />} disabled={busy} onClick={() => void tick(focus)}>
                          Log set {focus}
                        </NocButton>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, marginTop: 16 }}>
                    <Stepper label="kg" decimal step={2.5} value={focusDraft.kg} onChange={(v) => setDraft(focus, { kg: v })} />
                    <Stepper label="reps" step={1} value={focusDraft.reps} onChange={(v) => setDraft(focus, { reps: v })} />
                  </div>
                  <NocButton variant="fill" className="w-full" style={{ marginTop: 16, height: 52, fontSize: 15 }}
                    icon={<Check size={16} weight="bold" />} disabled={busy} onClick={() => void tick(focus)}>
                    {busy ? 'Saving…' : `Log set ${focus}`}
                  </NocButton>
                </>
              )}
              {/* Said until the first set: logging is what saves it and what
                  starts the rest. Without it, moving on looked like the way
                  through and the timer never appeared. */}
              {exSets.length === 0 && (
                <p style={{ fontSize: 12, marginTop: 10, textAlign: 'center', lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
                  Each set saves the moment you log it{ex.restSeconds > 0 ? `, and a ${clock(ex.restSeconds)} rest starts` : ''}.
                </p>
              )}
            </section>
          )}

          {isStarted && focus == null && (
            <section className="noc-gw-zoom flex items-center" style={{ ...glassCard, padding: 16, gap: 12 }}>
              <CheckCircle size={30} weight="fill" style={{ color: 'var(--color-primary-300)', flex: 'none' }} />
              <div className="min-w-0">
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>All {rows} sets logged</p>
                <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                  {allDone ? 'Every exercise is done — finish the workout below.' : 'Add a set if you have another in you, or move on.'}
                </p>
              </div>
            </section>
          )}

          {/* ── Every set of this exercise ── */}
          <section>
            <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 8 }}>
              <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Sets</p>
              <div className="flex items-center" style={{ gap: 14 }}>
                {isStarted && restEnd == null && (
                  <button onClick={() => startRest(ex.restSeconds > 0 ? ex.restSeconds : 60)}
                    className="inline-flex items-center noc-press" style={{ gap: 5, fontSize: 13, color: 'var(--color-secondary)' }}>
                    <Timer size={14} /> Rest {clock(ex.restSeconds > 0 ? ex.restSeconds : 60)}
                  </button>
                )}
                <button onClick={() => { setExtra((x) => ({ ...x, [idx]: (x[idx] ?? 0) + 1 })); setStarted((s) => new Set(s).add(idx)); }}
                  className="inline-flex items-center noc-press" style={{ gap: 5, fontSize: 13, color: 'var(--color-primary-300)' }}>
                  <Plus size={14} /> Add a set
                </button>
              </div>
            </div>
            <div className="flex flex-col noc-rows" style={{ gap: 8 }}>
              {setNumbers.map((n) => {
                const logged = loggedAt(n);
                return (
                  <SetRow key={n} n={n} logged={logged} queued={!!logged && queued.has(logged.id)} planned={describeDraft(draftFor(n), ex.isTimed)}
                    prev={prevFor(n)} focused={isStarted && focus === n} flashing={flash === n} busy={busy}
                    beat={logged ? beatLast(logged, prevFor(n)) : false}
                    onFocus={() => { setFocusSet(n); setStarted((s) => new Set(s).add(idx)); }}
                    onTick={() => void tick(n)} onUndo={() => logged && void untick(logged)} />
                );
              })}
            </div>
          </section>

          <button onClick={() => setConfirmDiscard(true)} className="self-center"
            style={{ fontSize: 12.5, padding: '6px 10px', color: 'var(--color-text-muted)' }}>
            Discard workout
          </button>
        </div>
      </div>

      {/* ── Moving on ── */}
      <footer className="relative flex flex-col" style={{
        gap: 8, padding: '10px var(--gutter) 12px',
        background: 'linear-gradient(180deg, rgba(8, 8, 14, 0) 0%, rgba(8, 8, 14, 0.88) 38%)',
      }}>
        {restEnd != null && restMin && (
          <button onClick={() => setRestMin(false)} className="flex items-center noc-press noc-gw-zoom"
            style={{ ...glassCard, borderRadius: 14, padding: '10px 14px', gap: 12 }}>
            <Timer size={17} style={{ color: 'var(--color-primary-300)' }} />
            <span className="tabular-nums" style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>{clock(restLeft)}</span>
            <span className="flex-1 overflow-hidden" style={{ height: 4, borderRadius: 2, background: 'rgba(233, 233, 237, 0.12)' }}>
              <span className="block" style={{ height: '100%', width: `${restTotal > 0 ? (restLeft / restTotal) * 100 : 0}%`, background: '#8B5CF6', transition: 'width 0.3s linear' }} />
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Rest</span>
          </button>
        )}
        {allDone ? (
          <NocButton variant="fill" className="w-full" style={{ height: 52 }} icon={<Flag size={16} weight="fill" />} onClick={finishWorkout} disabled={busy}>
            {busy ? 'Saving…' : 'Finish workout'}
          </NocButton>
        ) : !isStarted ? (
          <NocButton variant="fill" className="w-full" style={{ height: 52 }} icon={<Play size={16} weight="fill" />}
            onClick={() => setStarted((s) => new Set(s).add(idx))}>
            Start exercise
          </NocButton>
        ) : finished.has(idx) ? (
          <NocButton variant="action" className="w-full" style={{ height: 50 }} icon={<ArrowRight size={16} weight="bold" />} onClick={finishExercise}>
            Next exercise{nextIdx !== -1 ? ` · ${routine.exercises[nextIdx].name}` : ''}
          </NocButton>
        ) : exSets.length > 0 ? (
          <NocButton variant="action" className="w-full" style={{ height: 50 }} icon={<Check size={16} weight="bold" />} onClick={finishExercise}>
            Finish exercise
          </NocButton>
        ) : (
          <NocButton variant="ghost" className="w-full" style={{ height: 50 }} icon={<ArrowRight size={16} />} onClick={finishExercise}>
            Skip exercise
          </NocButton>
        )}
        {!allDone && sets.length > 0 && (
          <button onClick={finishWorkout} disabled={busy} className="self-center disabled:opacity-50"
            style={{ fontSize: 12.5, padding: '4px 10px', color: 'var(--color-text-secondary)' }}>
            Finish workout early
          </button>
        )}
      </footer>

      {/* ── The rest, taking over the screen ── */}
      {restEnd != null && !restMin && (
        <RestTakeover left={restLeft} total={restTotal} upNext={upNext}
          onAdjust={(delta) => setRest(Math.max(now + 1000, (restEndRef.current ?? now) + delta * 1000))}
          onSkip={() => setRest(null)} onHide={() => setRestMin(true)} />
      )}

      <GlassSheet open={howTo && !!ex?.exerciseId} onClose={() => setHowTo(false)} title={ex?.name ?? ''} subtitle="How your gym does it">
        {ex?.exerciseId && <ExerciseGuideFor exerciseId={ex.exerciseId} name={ex.name} />}
      </GlassSheet>

      <GlassSheet open={overview} onClose={() => setOverview(false)} title="Exercises" subtitle={`${doneCount} of ${total} done · ${sets.length} sets logged`}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          {routine.exercises.map((e, i) => {
            const Glyph = iconFor(e);
            const n = setsFor(sets, e).length;
            const state = skipped.has(i) ? 'Skipped' : finished.has(i) ? 'Done' : n > 0 ? 'In progress' : 'To do';
            return (
              <button key={keyOf(e) + i} onClick={() => { go(i); setOverview(false); }}
                className="flex items-center text-left noc-press-soft"
                style={{
                  gap: 12, padding: '10px 12px', borderRadius: 14,
                  background: i === idx ? 'rgba(124, 58, 237, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${i === idx ? 'rgba(196, 181, 253, 0.4)' : 'rgba(233, 233, 237, 0.08)'}`,
                }}>
                <span className="grid place-items-center" style={{ width: 38, height: 38, borderRadius: 12, flex: 'none', background: 'rgba(124, 58, 237, 0.18)', color: 'var(--color-primary-300)' }}>
                  <Glyph size={19} weight="duotone" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{e.name}</span>
                  <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
                    {n}/{e.targetSets} sets · {state}
                  </span>
                </span>
                {finished.has(i) && !skipped.has(i) && <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-primary-300)' }} />}
              </button>
            );
          })}
        </div>
      </GlassSheet>

      <Modal
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this workout"
        subtitle="Every set you logged in it is removed. Your routine stays."
        confirmLabel="Discard"
        cancelLabel="Keep going"
        onConfirm={() => { setConfirmDiscard(false); void discard(); }}
      >
        <span />
      </Modal>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function RoundButton({
  label, onClick, children, small = false, disabled = false,
}: { label: string; onClick: () => void; children: ReactNode; small?: boolean; disabled?: boolean }) {
  const size = small ? 30 : 40;
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="grid place-items-center noc-press disabled:opacity-30"
      style={{
        width: size, height: size, borderRadius: 999, flex: 'none',
        background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(233, 233, 237, 0.12)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'var(--color-text-primary)',
      }}>
      {children}
    </button>
  );
}

function StatusChip({ status }: { status: string }) {
  const live = status === 'In progress';
  const next = status === 'Up next';
  const color = next ? 'var(--color-secondary)' : status === 'Skipped' ? 'var(--color-text-muted)' : 'var(--color-primary-300)';
  return (
    <span className="inline-flex items-center" style={{
      gap: 7, height: 26, padding: '0 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
      letterSpacing: '0.1em', textTransform: 'uppercase', color,
      background: next ? 'rgba(245, 158, 11, 0.10)' : 'rgba(124, 58, 237, 0.14)',
      border: `1px solid ${next ? 'rgba(245, 158, 11, 0.35)' : 'rgba(196, 181, 253, 0.3)'}`,
    }}>
      <span className={live ? 'noc-gw-dot' : undefined} style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {status}
    </span>
  );
}

function MiniStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div style={{ ...glassCard, borderRadius: 14, padding: '10px 12px' }}>
      <p className="tabular-nums truncate" style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</p>
      <p style={{ fontSize: 11.5, marginTop: 1, color: 'var(--color-text-muted)' }}>{label}</p>
    </div>
  );
}

function SetRow({
  n, logged, queued, planned, prev, focused, flashing, beat, busy, onFocus, onTick, onUndo,
}: {
  n: number;
  logged: WorkoutSet | null;
  /** Saved on the phone, not on the server yet. */
  queued: boolean;
  planned: string;
  prev: LastSet | undefined;
  focused: boolean;
  flashing: boolean;
  beat: boolean;
  busy: boolean;
  onFocus: () => void;
  onTick: () => void;
  onUndo: () => void;
}) {
  return (
    <div className={`flex items-center ${flashing ? 'noc-gw-ring-out' : ''}`} style={{
      gap: 10, padding: '8px 8px 8px 10px', borderRadius: 16,
      background: logged ? 'rgba(124, 58, 237, 0.14)' : 'rgba(18, 17, 28, 0.55)',
      border: `1px solid ${focused ? 'rgba(245, 158, 11, 0.55)' : logged ? 'rgba(196, 181, 253, 0.28)' : 'rgba(233, 233, 237, 0.08)'}`,
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      transition: 'border-color 0.25s ease, background-color 0.25s ease',
    }}>
      <button onClick={onFocus} disabled={!!logged} aria-label={`Work on set ${n}`}
        className="flex-1 min-w-0 flex items-center justify-start text-left" style={{ gap: 12 }}>
        <span className="grid place-items-center tabular-nums" style={{
          width: 30, height: 30, borderRadius: 999, flex: 'none', fontSize: 13, fontWeight: 700,
          background: logged ? 'linear-gradient(135deg, #7C3AED, #A78BFA)' : 'rgba(255, 255, 255, 0.06)',
          color: logged ? '#fff' : focused ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
        }}>{n}</span>
        <span className="min-w-0">
          <span className="flex items-center" style={{ gap: 8 }}>
            <span className="truncate tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: logged ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
              {logged ? describeSet(logged) : planned}
            </span>
            {beat && (
              <span className="inline-flex items-center noc-pop" style={{ gap: 3, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, flex: 'none', color: 'var(--color-primary-300)', background: 'rgba(124, 58, 237, 0.22)' }}>
                <TrendUp size={11} weight="bold" /> Beat last time
              </span>
            )}
          </span>
          <span className="block truncate" style={{ fontSize: 12, marginTop: 1, color: 'var(--color-text-muted)' }}>
            {logged ? (queued ? 'On this phone · uploads when online' : 'Saved') : focused ? 'In focus' : 'Planned'}{prev ? ` · last ${describeSet(prev)}` : ''}
          </span>
        </span>
      </button>
      <button onClick={logged ? onUndo : onTick} disabled={busy}
        aria-label={logged ? `Undo set ${n}` : `Log set ${n}`}
        className="grid place-items-center noc-press disabled:opacity-50"
        style={{
          width: 44, height: 44, borderRadius: 13, flex: 'none',
          background: logged ? 'linear-gradient(135deg, #7C3AED, #8B5CF6)' : 'rgba(255, 255, 255, 0.04)',
          border: logged ? '1px solid rgba(196, 181, 253, 0.5)' : '1px solid rgba(233, 233, 237, 0.16)',
          boxShadow: logged ? '0 0 18px -4px rgba(124, 58, 237, 0.8)' : undefined,
          color: logged ? '#fff' : 'var(--color-text-secondary)',
        }}>
        <Check size={18} weight="bold" />
      </button>
    </div>
  );
}

function RestTakeover({
  left, total, upNext, onAdjust, onSkip, onHide,
}: {
  left: number;
  total: number;
  upNext: { title: string; detail: string };
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
  onHide: () => void;
}) {
  const urgent = left <= 3.05;
  const pill = {
    height: 40, padding: '0 18px', borderRadius: 999, fontSize: 14, fontWeight: 600,
    background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-primary)',
  } as const;
  return (
    <div role="dialog" aria-label="Rest" className="absolute inset-0 flex flex-col" style={{
      zIndex: 30, background: 'rgba(8, 8, 14, 0.62)', backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)',
    }}>
      <div className="flex items-center" style={{ padding: '10px var(--gutter) 0', gap: 10 }}>
        <RoundButton label="Hide the rest timer" onClick={onHide}><CaretDown size={18} weight="bold" /></RoundButton>
        <p className="flex-1 text-center" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
          Rest
        </p>
        <span style={{ width: 40 }} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center noc-gw-zoom" style={{ gap: 22, padding: '0 var(--gutter)' }}>
        <CountRing size={248} stroke={12} fraction={total > 0 ? left / total : 0}>
          <div>
            <p className={`tabular-nums ${urgent ? 'noc-gw-urgent' : ''}`} style={{
              fontSize: 62, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em',
              color: urgent ? 'var(--color-secondary)' : 'var(--color-text-primary)',
            }}>
              {clock(left)}
            </p>
            <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-muted)' }}>of {clock(total)}</p>
          </div>
        </CountRing>
        <div className="flex" style={{ gap: 10 }}>
          <button className="noc-press" style={pill} onClick={() => onAdjust(-15)}>−15 s</button>
          <button className="noc-press" style={pill} onClick={() => onAdjust(15)}>+15 s</button>
        </div>
        <div className="w-full" style={{ ...glassCard, padding: '14px 16px' }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-secondary)' }}>Up next</p>
          <p className="truncate" style={{ fontSize: 17, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{upNext.title}</p>
          <p style={{ fontSize: 13, marginTop: 2, color: 'var(--color-text-secondary)' }}>{upNext.detail}</p>
        </div>
      </div>
      <div style={{ padding: '0 var(--gutter) 14px' }}>
        <NocButton variant="fill" className="w-full" style={{ height: 52 }} icon={<ArrowRight size={16} weight="bold" />} onClick={onSkip}>
          Skip rest
        </NocButton>
      </div>
    </div>
  );
}

function FinishView({
  routine, sets, last, done, onAttendance, onRoutines,
}: {
  routine: Routine;
  sets: WorkoutSet[];
  last: Map<string, LastSet[]>;
  done: Finished;
  onAttendance: () => void;
  onRoutines: () => void;
}) {
  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto scrollbar-hide" style={{ padding: '28px var(--gutter) 20px' }}>
      <div className="flex flex-col items-center text-center">
        <div className="relative grid place-items-center" style={{ width: 132, height: 132 }}>
          <span aria-hidden className="absolute rounded-full noc-gw-burst" style={{ inset: 18, border: '2px solid rgba(196, 181, 253, 0.6)' }} />
          <span aria-hidden className="absolute rounded-full noc-gw-burst noc-gw-burst--late" style={{ inset: 18, border: '2px solid rgba(245, 158, 11, 0.5)' }} />
          <span className="grid place-items-center noc-pop" style={{
            width: 96, height: 96, borderRadius: 999, color: '#fff',
            background: 'radial-gradient(120% 120% at 30% 20%, #A78BFA 0%, #7C3AED 55%, #4C1D95 100%)',
            boxShadow: '0 0 60px -8px rgba(124, 58, 237, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          }}>
            <Trophy size={46} weight="fill" />
          </span>
        </div>
        <p className="noc-rise" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 14, color: 'var(--color-primary-300)' }}>
          Workout complete
        </p>
        <h1 className="noc-rise" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 6, color: 'var(--color-text-primary)' }}>
          {routine.name}
        </h1>
        <p className="noc-rise" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
          Saved to today. Tap today in your Attendance calendar to see every set.
        </p>
      </div>

      <div className="grid noc-stack" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 22 }}>
        <BigStat value={done.minutes} label="minutes" />
        <BigStat value={done.sets} label="sets" />
        <BigStat value={Math.round(done.volume).toLocaleString()} label="kg lifted" />
        <BigStat value={done.beat} label={done.beat === 1 ? 'set beat last time' : 'sets beat last time'} highlight={done.beat > 0} />
      </div>

      <div className="noc-rise" style={{ ...glassCard, padding: '6px 16px', marginTop: 14 }}>
        {routine.exercises.map((e, i) => {
          const mine = setsFor(sets, e);
          const prev = e.exerciseId ? last.get(e.exerciseId) ?? [] : [];
          const beat = mine.filter((s) => beatLast(s, prev.find((l) => l.setNumber === s.setNumber))).length;
          return (
            <div key={keyOf(e) + i} className="flex items-start" style={{ gap: 10, padding: '11px 0', borderTop: i ? '1px solid rgba(233, 233, 237, 0.07)' : undefined }}>
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{e.name}</p>
                <p style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
                  {mine.length ? mine.map(describeSet).join(' · ') : 'Skipped'}
                </p>
              </div>
              {beat > 0 && (
                <span className="inline-flex items-center" style={{ gap: 3, fontSize: 11.5, fontWeight: 700, flex: 'none', color: 'var(--color-primary-300)' }}>
                  <TrendUp size={12} weight="bold" /> {beat}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col" style={{ gap: 10, marginTop: 18 }}>
        <NocButton variant="action" className="w-full" onClick={onAttendance}>See it in Attendance</NocButton>
        <NocButton variant="ghost" className="w-full" onClick={onRoutines}>Back to My routines</NocButton>
      </div>
    </div>
  );
}

function BigStat({ value, label, highlight = false }: { value: ReactNode; label: string; highlight?: boolean }) {
  return (
    <div style={{ ...glassCard, padding: '14px 16px', border: `1px solid ${highlight ? 'rgba(196, 181, 253, 0.4)' : 'rgba(233, 233, 237, 0.10)'}` }}>
      <p className="tabular-nums" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: highlight ? 'var(--color-primary-300)' : 'var(--color-text-primary)' }}>
        {value}
      </p>
      <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>{label}</p>
    </div>
  );
}
