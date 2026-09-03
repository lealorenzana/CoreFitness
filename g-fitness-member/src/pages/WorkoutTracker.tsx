import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Check, AlertTriangle, Dumbbell } from 'lucide-react';
import { panelStyle } from '../components/ui/Card';
import FeatureLock from '../components/ui/FeatureLock';
import { getCurrentMemberId } from '../services/bookingService';
import {
  listExercises, getOpenSession, startSession, completeSession,
  listSets, addSet, deleteSet,
  type Exercise, type WorkoutSet,
} from '../lib/api/workoutSets';
import { errorMessage } from '../utils/errorMessage';

/**
 * Recording a workout while you are doing it (migration 0050).
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
      navigate('/member/progress?tab=workouts');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  // Distinct exercises, in the order they were first performed.
  const grouped = exercises
    .filter((e) => sets.some((s) => s.exerciseId === e.id))
    .map((e) => ({ exercise: e, rows: sets.filter((s) => s.exerciseId === e.id) }));

  const Header = (
    <div className="flex items-center gap-3 mb-4">
      <button onClick={() => navigate(-1)}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={18} />
      </button>
      <div className="min-w-0">
        <h1 className="display text-xl text-white leading-none">Track a workout</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {logId ? `${grouped.length} exercise${grouped.length === 1 ? '' : 's'} · ${sets.length} set${sets.length === 1 ? '' : 's'}` : 'Record what you lift, set by set'}
        </p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {Header}
        <p className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    );
  }

  const Err = error && (
    <div className="px-3 py-2.5 rounded-xl flex items-start gap-2 text-[11px] leading-relaxed mb-3"
         style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );

  return (
    <FeatureLock
      feature="workout_tracker"
      context={<div className="flex-1 min-h-0 flex flex-col">{Header}</div>}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        {Header}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 pb-4">
          {Err}

          {!logId ? (
            <div className="p-5 rounded-2xl text-center" style={panelStyle}>
              <span className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: 'var(--color-primary-light)' }}>
                <Dumbbell size={26} style={{ color: 'var(--color-primary)' }} />
              </span>
              <p className="display text-lg text-white">Start a session</p>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Add each set as you finish it. Nothing is lost if you lock your
                phone — every set saves as you enter it.
              </p>
              <button onClick={begin} disabled={busy}
                className="w-full h-12 rounded-2xl font-semibold text-sm mt-4 disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: '#fff' }}>
                {busy ? 'Starting…' : 'Start workout'}
              </button>
            </div>
          ) : (
            <>
              {/* ── The set entry form ─────────────────────────────────────── */}
              <div className="p-4 rounded-2xl space-y-2.5" style={panelStyle}>
                <p className="text-xs font-bold text-white">Add a set</p>

                <select
                  value={exerciseId}
                  onChange={(e) => setExerciseId(e.target.value)}
                  className="field-input w-full h-11 px-3 rounded-xl text-xs text-white"
                  style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
                >
                  <option value="">Choose an exercise…</option>
                  {exercises.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>

                {chosen && (chosen.isTimed ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Minutes</span>
                      <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)}
                        placeholder="0"
                        className="field-input w-full h-11 px-3 rounded-xl text-xs text-white mt-1"
                        style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
                    </label>
                    <label className="block">
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Seconds</span>
                      <input inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)}
                        placeholder="0"
                        className="field-input w-full h-11 px-3 rounded-xl text-xs text-white mt-1"
                        style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Reps</span>
                      <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)}
                        placeholder="8"
                        className="field-input w-full h-11 px-3 rounded-xl text-xs text-white mt-1"
                        style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
                    </label>
                    <label className="block">
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Weight (kg)</span>
                      <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)}
                        placeholder="Optional"
                        className="field-input w-full h-11 px-3 rounded-xl text-xs text-white mt-1"
                        style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
                    </label>
                  </div>
                ))}

                <button onClick={record} disabled={!canAdd || busy}
                  className="w-full h-11 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ background: 'var(--color-secondary)', color: '#1A1200' }}>
                  <Plus size={14} /> Add set
                </button>
              </div>

              {/* ── What has been recorded ─────────────────────────────────── */}
              {grouped.map(({ exercise, rows }) => (
                <div key={exercise.id} className="p-4 rounded-2xl" style={panelStyle}>
                  <p className="text-xs font-bold text-white mb-2">{exercise.name}</p>
                  <div className="space-y-1.5">
                    {rows.map((s) => (
                      <div key={s.id} className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>Set {s.setNumber}</span>
                          {'  '}
                          {s.durationSeconds != null
                            ? `${Math.floor(s.durationSeconds / 60)}m ${s.durationSeconds % 60}s`
                            : `${s.reps} reps${s.weightKg != null ? ` × ${s.weightKg} kg` : ''}`}
                        </span>
                        <button onClick={() => remove(s.id)} className="p-1.5 rounded-lg"
                          style={{ color: 'var(--color-text-muted)' }} aria-label="Remove set">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {sets.length > 0 && (
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={finish} disabled={busy}
                  className="w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  <Check size={16} /> {busy ? 'Finishing…' : 'Finish workout'}
                </motion.button>
              )}
            </>
          )}
        </div>
      </div>
    </FeatureLock>
  );
}
