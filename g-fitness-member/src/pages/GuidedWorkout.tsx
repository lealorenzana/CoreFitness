import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Flag, Play, Plus, Timer, Trophy,
} from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { Page } from '../components/ui/page';
import { Eyebrow, NocButton, Panel, ProgressBar } from '../components/ui/noc';
import FeatureLock from '../components/ui/FeatureLock';
import Modal from '../components/ui/Modal';
import { toast } from '../components/ui/Toast';
import {
  addSet, completeSession, deleteSet, listSets, type WorkoutSet,
} from '../lib/api/workoutSets';
import {
  discardSession, getRoutine, getSession, lastSetsFor,
  type LastSet, type Routine, type RoutineExercise, type SessionHeader,
} from '../lib/api/routines';
import { errorMessage } from '../utils/errorMessage';

/** The values being typed into one not-yet-ticked set row. */
interface Draft { reps: string; kg: string; secs: string }

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function describeSet(s: { reps: number | null; weightKg: number | null; durationSeconds: number | null }): string {
  if (s.durationSeconds != null) return `${s.durationSeconds} s`;
  return s.weightKg != null ? `${s.weightKg} kg × ${s.reps ?? 0}` : `${s.reps ?? 0} reps`;
}

const keyOf = (e: RoutineExercise) => e.exerciseId ?? `custom:${e.customName}`;
const setsFor = (sets: WorkoutSet[], e: RoutineExercise) =>
  sets.filter((s) => (e.exerciseId ? s.exerciseId === e.exerciseId : s.customName === e.customName))
    .sort((a, b) => a.setNumber - b.setNumber);

/**
 * A routine, run set by set (0086).
 *
 * One exercise on screen at a time: **Start exercise**, then each set is a row
 * filled in from the routine (and beside it what you did last time); adjust it
 * if today was different and tick it. A tick writes the set at once — a phone
 * that dies mid-workout loses nothing — and starts the rest countdown the
 * routine set for that exercise. **Finish exercise** moves on; after the last
 * one, **Finish workout** closes the session, which is what awards the points
 * (0051) and puts it on the day in Attendance.
 *
 * The database is the state. Reopening this screen after a lock or a reload
 * finds the sets already written and resumes at the first unfinished exercise.
 */
export default function GuidedWorkout() {
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
  const [extra, setExtra] = useState<Record<number, number>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [done, setDone] = useState<{ minutes: number; sets: number; volume: number } | null>(null);

  // The rest end is mirrored in a ref so the clock below can end it on the
  // tick it runs out, rather than an effect reacting to its own render.
  const restEndRef = useRef<number | null>(null);
  const setRest = useCallback((end: number | null) => {
    restEndRef.current = end;
    setRestEnd(end);
  }, []);

  // One clock for the elapsed time and the rest countdown. The rest ends on its
  // own, with a short buzz where the phone supports it.
  useEffect(() => {
    const t = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (restEndRef.current != null && at >= restEndRef.current) {
        restEndRef.current = null;
        setRestEnd(null);
        try { navigator.vibrate?.([180, 80, 180]); } catch { /* not every phone */ }
      }
    }, 250);
    return () => window.clearInterval(t);
  }, []);

  const restLeft = restEnd == null ? 0 : Math.max(0, (restEnd - now) / 1000);

  const refresh = useCallback(async (id: string) => setSets(await listSets(id)), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!logId) throw new Error('No workout to open.');
        const s = await getSession(logId);
        if (!s) throw new Error('That workout could not be found.');
        if (!s.routineId) { navigate('/member/track/log', { replace: true }); return; }
        const [r, recorded] = await Promise.all([getRoutine(s.routineId), listSets(logId)]);
        if (!r) throw new Error('The routine for this workout was deleted. Finish or discard it from My routines.');
        const lastMap = await lastSetsFor(r.exercises.map((e) => e.exerciseId).filter(Boolean) as string[])
          .catch(() => new Map<string, LastSet[]>());
        if (!alive) return;
        setSession(s);
        setRoutine(r);
        setSets(recorded);
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
  const exSets = useMemo(() => (ex ? setsFor(sets, ex) : []), [sets, ex]);
  const lastSets = ex?.exerciseId ? last.get(ex.exerciseId) ?? [] : [];
  const rows = ex ? Math.max(ex.targetSets + (extra[idx] ?? 0), exSets.length) : 0;
  const total = routine?.exercises.length ?? 0;
  const doneCount = finished.size;
  const allDone = total > 0 && doneCount === total;
  const elapsed = session ? (now - new Date(session.startedAt).getTime()) / 1000 : 0;

  /** A row's typed values, defaulting to the routine's target — or last time's weight when no target was set. */
  const draftFor = (setNumber: number): Draft => {
    const key = `${idx}:${setNumber}`;
    if (drafts[key]) return drafts[key];
    const prev = lastSets.find((l) => l.setNumber === setNumber) ?? lastSets[lastSets.length - 1];
    return {
      reps: ex?.targetReps != null ? String(ex.targetReps) : prev?.reps != null ? String(prev.reps) : '',
      kg: ex?.targetWeightKg != null ? String(ex.targetWeightKg) : prev?.weightKg != null ? String(prev.weightKg) : '',
      secs: ex?.targetSeconds != null ? String(ex.targetSeconds) : prev?.durationSeconds != null ? String(prev.durationSeconds) : '',
    };
  };
  const setDraft = (setNumber: number, p: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [`${idx}:${setNumber}`]: { ...draftFor(setNumber), ...p } }));

  const tick = async (setNumber: number) => {
    if (!ex || !logId || busy) return;
    const d = draftFor(setNumber);
    const reps = ex.isTimed ? null : Number(d.reps);
    const secs = ex.isTimed ? Number(d.secs) : null;
    if (ex.isTimed ? !(secs && secs > 0) : !(reps && reps > 0)) {
      toast.error(ex.isTimed ? 'How many seconds did you hold it?' : 'How many reps did you do?');
      return;
    }
    setBusy(true);
    try {
      await addSet(logId, {
        exerciseId: ex.exerciseId,
        customName: ex.exerciseId ? null : ex.customName,
        setNumber,
        reps,
        weightKg: ex.isTimed || d.kg.trim() === '' ? null : Number(d.kg),
        durationSeconds: secs,
      });
      await refresh(logId);
      const doneNow = exSets.length + 1;
      if (doneNow >= ex.targetSets) {
        setFinished((f) => new Set(f).add(idx));
      } else if (ex.restSeconds > 0) {
        setRestTotal(ex.restSeconds);
        // The screen clock, not Date.now(): it is at most a quarter-second behind.
        setRest(now + ex.restSeconds * 1000);
      }
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
      await deleteSet(s.id);
      await refresh(logId);
      setFinished((f) => { const n = new Set(f); n.delete(idx); return n; });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not undo that set'));
    } finally {
      setBusy(false);
    }
  };

  const go = (to: number) => { setRest(null); setIdx(to); };

  const finishExercise = () => {
    setFinished((f) => new Set(f).add(idx));
    setRest(null);
    const next = routine?.exercises.findIndex((_, i) => i > idx && !finished.has(i)) ?? -1;
    if (next !== -1) setIdx(next);
    else {
      const any = routine?.exercises.findIndex((_, i) => i !== idx && !finished.has(i)) ?? -1;
      if (any !== -1) setIdx(any);
    }
  };

  const finishWorkout = async () => {
    if (!logId || busy) return;
    if (sets.length === 0) { toast.error('Tick at least one set first, or discard the workout.'); return; }
    setBusy(true);
    try {
      const minutes = Math.max(1, Math.round(elapsed / 60));
      await completeSession(logId, minutes);
      const volume = sets.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
      setDone({ minutes, sets: sets.length, volume });
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

  const cellStyle = { minHeight: 40, textAlign: 'center' as const, padding: '0 6px' };

  return (
    <FeatureLock feature="workout_tracker" context={<Page><p>Workout</p></Page>}>
      <Page>
        {loading ? <SkeletonList count={4} /> : error || !routine || !ex ? (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <p role="alert" style={{ fontSize: 14, color: 'var(--color-secondary)' }}>{error ?? 'This routine has no exercises.'}</p>
            <NocButton variant="ghost" onClick={() => navigate('/member/track')}>Back to My routines</NocButton>
          </div>
        ) : done ? (
          /* ── Finished ── */
          <div className="flex flex-col noc-stack" style={{ gap: 'var(--stack)' }}>
            <Panel glow="structure">
              <div className="flex items-center" style={{ gap: 12 }}>
                <span className="grid place-items-center orb-cell orb-cell--on noc-pop" style={{ width: 52, height: 52, borderRadius: 16 }}>
                  <Trophy size={24} weight="fill" />
                </span>
                <div>
                  <Eyebrow>Workout finished</Eyebrow>
                  <p style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{routine.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-3" style={{ gap: 12, marginTop: 18 }}>
                <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{done.minutes}</p><p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>minutes</p></div>
                <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{done.sets}</p><p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>sets</p></div>
                <div><p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{Math.round(done.volume)}</p><p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>kg lifted</p></div>
              </div>
              <p style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                Saved to today. Tap today in your Attendance calendar to see every set.
              </p>
            </Panel>
            <NocButton variant="action" className="w-full" onClick={() => navigate('/member/attendance-history')}>
              See it in Attendance
            </NocButton>
            <NocButton variant="ghost" className="w-full" onClick={() => navigate('/member/track', { replace: true })}>
              Back to My routines
            </NocButton>
          </div>
        ) : (
          <>
            {/* ── Header: routine, time, where you are ── */}
            <div>
              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <button onClick={() => navigate('/member/track')} className="inline-flex items-center"
                  style={{ gap: 6, fontSize: 13, color: 'var(--color-primary-300)' }}>
                  <ArrowLeft size={15} /> My routines
                </button>
                <span className="inline-flex items-center tabular-nums" style={{ gap: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <Timer size={15} /> {clock(elapsed)}
                </span>
              </div>
              <h1 style={{ fontSize: 'var(--text-display)', fontWeight: 700, marginTop: 8, color: 'var(--color-text-primary)' }}>{routine.name}</h1>
              <div className="flex" style={{ gap: 5, marginTop: 12 }} role="list" aria-label="Exercises">
                {routine.exercises.map((e, i) => (
                  <button key={keyOf(e) + i} role="listitem" onClick={() => go(i)} aria-label={`${e.name}${finished.has(i) ? ', done' : ''}`}
                    className={`flex-1 orb-cell ${finished.has(i) ? 'orb-cell--on' : i === idx ? 'orb-cell--ring orb-spin' : ''}`}
                    style={{ height: 8, borderRadius: 4, padding: 0 }} />
                ))}
              </div>
              <p style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
                Exercise {idx + 1} of {total} · {doneCount} done
              </p>
            </div>

            {/* ── The exercise ── */}
            <Panel glow={finished.has(idx) ? 'structure' : 'action'} key={idx} className="noc-pop">
              <Eyebrow tone={finished.has(idx) ? undefined : 'action'}>
                {finished.has(idx) ? 'Done' : started.has(idx) ? 'In progress' : 'Up next'}
              </Eyebrow>
              <p style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: 'var(--color-text-primary)' }}>{ex.name}</p>
              <p style={{ fontSize: 13, marginTop: 4, color: 'var(--color-text-secondary)' }}>
                {ex.targetSets} × {ex.isTimed ? `${ex.targetSeconds ?? '—'} s` : `${ex.targetReps ?? '—'} reps${ex.targetWeightKg != null ? ` @ ${ex.targetWeightKg} kg` : ''}`}
                {ex.restSeconds > 0 ? ` · ${ex.restSeconds >= 60 ? `${Math.round(ex.restSeconds / 6) / 10} min` : `${ex.restSeconds} s`} rest` : ''}
              </p>
              {lastSets.length > 0 && (
                <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>
                  Last time: {lastSets.map(describeSet).join(', ')}
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <ProgressBar fraction={Math.min(1, exSets.length / ex.targetSets)} tone={finished.has(idx) ? 'structure' : 'action'} />
              </div>
            </Panel>

            {/* ── Rest countdown ── */}
            {restEnd != null && (
              <div className="orb-cell orb-cell--ring noc-pop flex items-center" style={{ borderRadius: 16, padding: '14px 16px', gap: 14 }}>
                <div className="flex-1">
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Rest</p>
                  <p className="tabular-nums" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1, color: 'var(--color-text-primary)' }}>{clock(restLeft)}</p>
                  <div style={{ marginTop: 8 }}><ProgressBar fraction={restTotal > 0 ? 1 - restLeft / restTotal : null} /></div>
                </div>
                <div className="flex flex-col" style={{ gap: 6 }}>
                  <button onClick={() => setRest((restEndRef.current ?? now) + 15_000)} className="noc-press"
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12.5, border: '1px solid var(--color-hairline)', color: 'var(--color-text-secondary)' }}>+15 s</button>
                  <button onClick={() => setRest(null)} className="noc-press"
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: '1px solid var(--color-secondary)', color: 'var(--color-secondary)' }}>Skip</button>
                </div>
              </div>
            )}

            {/* ── Sets ── */}
            {!started.has(idx) && exSets.length === 0 ? (
              <NocButton variant="fill" className="w-full" icon={<Play size={16} weight="fill" />}
                onClick={() => setStarted((s) => new Set(s).add(idx))}>
                Start exercise
              </NocButton>
            ) : (
              <section>
                <div className="grid" style={{
                  gridTemplateColumns: ex.isTimed ? '34px minmax(0,1fr) minmax(0,1.2fr) 46px' : '34px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 46px',
                  gap: 8, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)',
                }}>
                  <span>Set</span><span>Last</span>
                  {ex.isTimed ? <span className="text-center">Seconds</span> : <><span className="text-center">kg</span><span className="text-center">Reps</span></>}
                  <span />
                </div>
                <div className="flex flex-col" style={{ gap: 8, marginTop: 8 }}>
                  {Array.from({ length: rows }, (_, i) => i + 1).map((n) => {
                    const doneSet = exSets.find((s) => s.setNumber === n) ?? null;
                    const prev = lastSets.find((l) => l.setNumber === n);
                    const d = draftFor(n);
                    return (
                      <div key={n} className={`grid items-center ${doneSet ? 'orb-cell orb-cell--busy' : ''}`} style={{
                        gridTemplateColumns: ex.isTimed ? '34px minmax(0,1fr) minmax(0,1.2fr) 46px' : '34px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 46px',
                        gap: 8, borderRadius: 10, padding: doneSet ? '4px 0 4px 6px' : '0 0 0 6px',
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: doneSet ? 'var(--color-primary-300)' : 'var(--color-text-secondary)' }}>{n}</span>
                        <span className="truncate" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{prev ? describeSet(prev) : '—'}</span>
                        {doneSet ? (
                          ex.isTimed
                            ? <span className="text-center" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{doneSet.durationSeconds}</span>
                            : <>
                                <span className="text-center" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{doneSet.weightKg ?? '—'}</span>
                                <span className="text-center" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{doneSet.reps}</span>
                              </>
                        ) : ex.isTimed ? (
                          <input inputMode="numeric" aria-label={`Set ${n} seconds`} className="field-input" style={cellStyle}
                            value={d.secs} onChange={(e) => setDraft(n, { secs: e.target.value.replace(/\D/g, '') })} />
                        ) : (
                          <>
                            <input inputMode="decimal" aria-label={`Set ${n} kilograms`} className="field-input" style={cellStyle} placeholder="—"
                              value={d.kg} onChange={(e) => setDraft(n, { kg: e.target.value.replace(/[^\d.]/g, '') })} />
                            <input inputMode="numeric" aria-label={`Set ${n} reps`} className="field-input" style={cellStyle}
                              value={d.reps} onChange={(e) => setDraft(n, { reps: e.target.value.replace(/\D/g, '') })} />
                          </>
                        )}
                        <button onClick={() => (doneSet ? untick(doneSet) : tick(n))} disabled={busy}
                          aria-label={doneSet ? `Undo set ${n}` : `Done with set ${n}`}
                          className={`grid place-items-center noc-press disabled:opacity-50 ${doneSet ? 'orb-cell orb-cell--on' : ''}`}
                          style={{
                            width: 40, height: 40, borderRadius: 10,
                            border: doneSet ? undefined : '1px solid var(--color-hairline)',
                            color: doneSet ? '#fff' : 'var(--color-text-secondary)',
                          }}>
                          <Check size={17} weight="bold" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => setExtra((x) => ({ ...x, [idx]: (x[idx] ?? 0) + 1 }))}
                  className="inline-flex items-center noc-press" style={{ gap: 6, marginTop: 12, fontSize: 13, color: 'var(--color-primary-300)' }}>
                  <Plus size={14} /> Add a set
                </button>
              </section>
            )}

            {/* ── Moving on ── */}
            <div className="flex flex-col" style={{ gap: 10 }}>
              {allDone ? (
                <NocButton variant="fill" className="w-full" icon={<Flag size={16} weight="fill" />} onClick={finishWorkout} disabled={busy}>
                  {busy ? 'Saving…' : 'Finish workout'}
                </NocButton>
              ) : finished.has(idx) ? (
                <NocButton variant="fill" className="w-full" icon={<ArrowRight size={16} weight="bold" />} onClick={finishExercise}>
                  Next exercise
                </NocButton>
              ) : started.has(idx) || exSets.length > 0 ? (
                <NocButton variant="action" className="w-full" icon={<Check size={16} weight="bold" />} onClick={finishExercise}>
                  Finish exercise
                </NocButton>
              ) : null}
              {!allDone && sets.length > 0 && (
                <NocButton variant="ghost" className="w-full" onClick={finishWorkout} disabled={busy}>
                  Finish workout early
                </NocButton>
              )}
              <button onClick={() => setConfirmDiscard(true)} className="self-center"
                style={{ fontSize: 12.5, padding: '6px 0', color: 'var(--color-text-muted)' }}>
                Discard workout
              </button>
            </div>
          </>
        )}

        <Modal
          isOpen={confirmDiscard}
          onClose={() => setConfirmDiscard(false)}
          title="Discard this workout"
          subtitle="Every set you ticked in it is removed. Your routine stays."
          confirmLabel="Discard"
          cancelLabel="Keep going"
          onConfirm={() => { setConfirmDiscard(false); void discard(); }}
        >
          <span />
        </Modal>
      </Page>
    </FeatureLock>
  );
}
