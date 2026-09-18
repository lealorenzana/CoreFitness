import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, Trash } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { Field, TextInput } from '../components/ui/Field';
import ExercisePicker from '../components/ui/ExercisePicker';
import { Page, PageTitle } from '../components/ui/page';
import { NocButton, Panel, SectionHead } from '../components/ui/noc';
import FeatureLock from '../components/ui/FeatureLock';
import { getCurrentMemberId } from '../services/bookingService';
import {
  listExercises, getOpenSession, startSession, completeSession,
  listSets, addSet, deleteSet,
  type Exercise, type WorkoutSet,
} from '../lib/api/workoutSets';
import { errorMessage } from '../utils/errorMessage';

/**
 * Recording a workout while you are doing it (migration 0050) — Nocturne redesign.
 *
 * ## One open session, resumed
 *
 * `workout_logs.completed_at IS NULL` is the session in progress. A member sets
 * their phone down between sets and comes back to a locked screen — without
 * resuming, that second visit would start a second session and split one
 * workout into two, wrecking both the count and the history.
 *
 * ## Every set is written when it is entered
 *
 * Not batched into a save at the end. A gym phone runs out of battery, drops
 * off wifi and gets locked constantly; a "Save workout" button at the end is a
 * button that eventually loses an hour of someone's training.
 *
 * ## The set form knows what it is measuring
 *
 * `exercises.is_timed` switches reps+weight for time — asking a member how much
 * weight they used on a plank is how a form teaches people it was not written
 * for them.
 */

export default function WorkoutTracker() {
  const navigate = useNavigate();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The set being entered.
  const [exerciseId, setExerciseId] = useState('');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [seconds, setSeconds] = useState('');
  const [minutes, setMinutes] = useState('');

  const chosen = exercises.find((e) => e.id === exerciseId) ?? null;

  const refreshSets = useCallback(async (id: string) => {
    setSets(await listSets(id));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Could not identify your account.');
        const [ex, open] = await Promise.all([listExercises(), getOpenSession(id)]);
        if (!alive) return;
        setMemberId(id);
        setExercises(ex);
        if (open) {
          setLogId(open.id);
          await refreshSets(open.id);
        }
      } catch (err) {
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshSets]);

  const begin = async () => {
    if (!memberId) return;
    setBusy(true);
    setError(null);
    try {
      const id = await startSession(memberId);
      setLogId(id);
      setSets([]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /** Next set number for this exercise — so three sets of squats read 1, 2, 3. */
  const nextSetNumber = (exId: string) =>
    sets.filter((s) => s.exerciseId === exId).length + 1;

  const canAdd =
    !!chosen &&
    (chosen.isTimed ? seconds.trim() !== '' || minutes.trim() !== '' : reps.trim() !== '');

  const record = async () => {
    if (!logId || !chosen || !canAdd) return;
    setBusy(true);
    setError(null);
    try {
      const total = chosen.isTimed
        ? (Number(minutes || 0) * 60) + Number(seconds || 0)
        : null;
      await addSet(logId, {
        exerciseId: chosen.id,
        setNumber: nextSetNumber(chosen.id),
        reps: chosen.isTimed ? null : Number(reps),
        weightKg: chosen.isTimed || weight.trim() === '' ? null : Number(weight),
        durationSeconds: total,
      });
      // Weight is kept between sets — it usually stays the same or moves a
      // little, and retyping 62.5 for every set is how a tracker stops being
      // used. Reps and time clear, because those are what change.
      setReps('');
      setSeconds('');
      setMinutes('');
      await refreshSets(logId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!logId) return;
    try {
      await deleteSet(id);
      await refreshSets(logId);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const finish = async () => {
    if (!logId) return;
    setBusy(true);
    try {
      await completeSession(logId, null);
      navigate('/member/progress?tab=overview');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  // Distinct exercises, in the order they were first performed.
  const grouped = exercises
    .filter((e) => sets.some((s) => s.exerciseId === e.id))
    .map((e) => ({ exercise: e, rows: sets.filter((s) => s.exerciseId === e.id) }));

  const title = (
    <PageTitle back fallback="/member/track" title="Track a workout"
      subtitle={logId
        ? `${grouped.length} exercise${grouped.length === 1 ? '' : 's'} · ${sets.length} set${sets.length === 1 ? '' : 's'} so far`
        : 'Record what you lift, set by set'} />
  );

  if (loading) {
    return (
      <Page>
        {title}
        <SkeletonList count={2} />
      </Page>
    );
  }

  const Err = error && (
    <p role="alert" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-secondary)' }}>{error}</p>
  );

  return (
    <FeatureLock feature="workout_tracker" context={<Page>{title}</Page>}>
      <Page>
        {title}
        {Err}

        {!logId ? (
          <>
            <Panel glow="structure" filled>
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>Start a session</p>
              <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, color: 'var(--color-text-secondary)' }}>
                Add each set as you finish it. Nothing is lost if you lock your phone — every set saves as you
                enter it, and coming back here picks the session up where you left it.
              </p>
            </Panel>
            <NocButton variant="action" onClick={begin} disabled={busy} className="w-full">
              {busy ? 'Starting…' : 'Start workout'}
            </NocButton>
          </>
        ) : (
          <>
            {/* ── The set entry form ── */}
            <section className="flex flex-col" style={{ gap: 12 }}>
              <SectionHead title="Add a set"
                meta={chosen ? `Set ${nextSetNumber(chosen.id)} of ${chosen.name}` : undefined} />

              {/* A searchable glass sheet, not a native <select> — the open list of
                  a native select is browser chrome and rendered white-on-blue. */}
              <Field label="Exercise" as="div">
                <ExercisePicker exercises={exercises} value={exerciseId} onChange={setExerciseId} />
              </Field>

              {chosen && (chosen.isTimed ? (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <Field label="Minutes">
                    <TextInput inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" />
                  </Field>
                  <Field label="Seconds">
                    <TextInput inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="0" />
                  </Field>
                </div>
              ) : (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <Field label="Reps">
                    <TextInput inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="8" />
                  </Field>
                  <Field label="Weight (kg)">
                    <TextInput inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Optional" />
                  </Field>
                </div>
              ))}

              <NocButton variant="action" onClick={record} disabled={!canAdd || busy} icon={<Plus size={15} />} className="w-full">
                Add set
              </NocButton>
            </section>

            {/* ── What has been recorded ── */}
            {grouped.map(({ exercise, rows }) => (
              <section key={exercise.id}>
                <SectionHead title={exercise.name} meta={`${rows.length} set${rows.length === 1 ? '' : 's'}`} />
                <div style={{ marginTop: 2 }}>
                  {rows.map((s, i) => (
                    <div key={s.id}>
                      <div className="flex items-center" style={{ gap: 12, minHeight: 44 }}>
                        <span className="flex-none" style={{ width: 48, fontSize: 13, color: 'var(--color-text-muted)' }}>
                          Set {s.setNumber}
                        </span>
                        <span className="flex-1" style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>
                          {s.durationSeconds != null
                            ? `${Math.floor(s.durationSeconds / 60)}m ${s.durationSeconds % 60}s`
                            : `${s.reps} reps${s.weightKg != null ? ` × ${s.weightKg} kg` : ''}`}
                        </span>
                        <button onClick={() => remove(s.id)} aria-label={`Remove set ${s.setNumber} of ${exercise.name}`}
                          className="grid place-items-center flex-none"
                          style={{ width: 44, height: 44, marginRight: -12, color: 'var(--color-text-muted)' }}>
                          <Trash size={15} />
                        </button>
                      </div>
                      {i < rows.length - 1 && <div className="hair" />}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* Finishing is the member saying the session is over — structure,
                not the next action, which is still "Add set" until it is. */}
            {sets.length > 0 && (
              <NocButton variant="structure" onClick={finish} disabled={busy} icon={<Check size={15} />} className="w-full">
                {busy ? 'Finishing…' : 'Finish workout'}
              </NocButton>
            )}
          </>
        )}
      </Page>
    </FeatureLock>
  );
}
