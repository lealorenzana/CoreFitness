import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Trash } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { Page, PageTitle } from '../components/ui/page';
import { NocButton, SectionHead } from '../components/ui/noc';
import { Field, Select, TextInput } from '../components/ui/Field';
import ExercisePicker from '../components/ui/ExercisePicker';
import FeatureLock from '../components/ui/FeatureLock';
import Modal from '../components/ui/Modal';
import { toast } from '../components/ui/Toast';
import { getCurrentMemberId } from '../services/bookingService';
import { listExercises, type Exercise } from '../lib/api/workoutSets';
import {
  deleteRoutine, getRoutine, saveRoutine, type RoutineExercise,
} from '../lib/api/routines';
import { errorMessage } from '../utils/errorMessage';

const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 180, 240];

function restLabel(s: number): string {
  if (s === 0) return 'No rest';
  if (s < 60) return `${s} s rest`;
  return s % 60 === 0 ? `${s / 60} min rest` : `${Math.floor(s / 60)} min ${s % 60} s rest`;
}

/** Digits only, or '' — a phone keyboard happily types "1o". */
const num = (v: string) => v.replace(/[^\d.]/g, '');

/** A small − value + control: faster than a keyboard for a number that moves by one. */
function Stepper({
  label, value, onChange, min, max,
}: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  const btn = {
    width: 34, height: 38, fontSize: 18, lineHeight: 1, color: 'var(--color-text-secondary)',
  } as const;
  return (
    <div>
      <p style={{ fontSize: 12, marginBottom: 6, color: 'var(--color-text-muted)' }}>{label}</p>
      <div className="flex items-center justify-between" style={{
        height: 40, borderRadius: 'var(--radius-btn)', border: '1px solid var(--color-hairline)', background: 'var(--color-surface)',
      }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer ${label.toLowerCase()}`} style={btn}>−</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label.toLowerCase()}`} style={btn}>+</button>
      </div>
    </div>
  );
}

/**
 * Build or change a routine (0086): its name, then its exercises in order, each
 * with the sets, reps and weight you aim for (or time, for a timed exercise)
 * and the rest between sets. Saved whole; the guided workout reads it back.
 */
export default function RoutineEditor() {
  const navigate = useNavigate();
  const { routineId } = useParams();
  const isNew = !routineId || routineId === 'new';
  const [memberId, setMemberId] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<Exercise[]>([]);
  const [name, setName] = useState('');
  const [items, setItems] = useState<RoutineExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Could not identify your account.');
        const [ex, existing] = await Promise.all([
          listExercises(),
          isNew ? Promise.resolve(null) : getRoutine(routineId as string),
        ]);
        if (!alive) return;
        setMemberId(id);
        setCatalogue(ex);
        if (existing) {
          setName(existing.name);
          setItems(existing.exercises);
        } else if (!isNew) {
          setError('That routine could not be found.');
        }
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load the routine'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isNew, routineId]);

  const add = (exerciseId: string) => {
    const ex = catalogue.find((e) => e.id === exerciseId);
    if (!ex) return;
    setItems((prev) => [...prev, {
      exerciseId: ex.id, customName: null, name: ex.name, isTimed: ex.isTimed,
      targetSets: 3, targetReps: ex.isTimed ? null : 10, targetWeightKg: null,
      targetSeconds: ex.isTimed ? 30 : null, restSeconds: 90,
    }]);
  };

  const patch = (i: number, p: Partial<RoutineExercise>) =>
    setItems((prev) => prev.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const move = (i: number, d: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setItems((prev) => prev.filter((_, j) => j !== i));

  const valid = name.trim().length > 0 && items.length > 0
    && items.every((e) => (e.isTimed ? (e.targetSeconds ?? 0) > 0 : (e.targetReps ?? 0) > 0));

  const save = async () => {
    if (!memberId || !valid || saving) return;
    setSaving(true);
    try {
      await saveRoutine(memberId, { id: isNew ? undefined : routineId, name, notes: null, exercises: items });
      toast.success(`${name.trim()} saved.`);
      navigate('/member/track', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that routine'));
      setSaving(false);
    }
  };

  const destroy = async () => {
    if (isNew) return;
    try {
      await deleteRoutine(routineId as string);
      toast.success('Routine deleted. Workouts you already did with it are kept.');
      navigate('/member/track', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete that routine'));
    }
  };

  const title = (
    <PageTitle back fallback="/member/track" title={isNew ? 'New routine' : 'Edit routine'}
      subtitle="The exercises, in order, and what you aim for on each" />
  );

  return (
    <FeatureLock feature="workout_tracker" context={<Page>{title}</Page>}>
      <Page>
        {title}
        {error && <p role="alert" style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>}

        {loading ? <SkeletonList count={3} /> : (
          <>
            <Field label="Routine name" hint="What kind of day it is — Leg day, Push day, Back and arms">
              <TextInput value={name} maxLength={40} placeholder="e.g. Leg day" onChange={(e) => setName(e.target.value)} />
            </Field>

            <section>
              <SectionHead title="Exercises" meta={items.length > 0 ? `${items.length}` : undefined} />
              {items.length === 0 && (
                <p style={{ fontSize: 12.5, marginTop: 8, color: 'var(--color-text-muted)' }}>
                  Add the first exercise below. You can reorder them any time.
                </p>
              )}
              <div className="flex flex-col noc-rows" style={{ gap: 12, marginTop: 12 }}>
                {items.map((e, i) => (
                  <div key={`${e.exerciseId ?? e.customName}-${i}`} className="orb-cell"
                    style={{ borderRadius: 14, padding: 14 }}>
                    <div className="flex items-center" style={{ gap: 10 }}>
                      <span className="flex-none grid place-items-center" style={{
                        width: 26, height: 26, borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                        color: 'var(--color-primary-300)', background: 'rgba(124, 58, 237, 0.18)',
                      }}>{i + 1}</span>
                      <p className="flex-1 min-w-0 truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{e.name}</p>
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${e.name} up`}
                        className="grid place-items-center disabled:opacity-25" style={{ width: 32, height: 32, color: 'var(--color-text-secondary)' }}>
                        <ArrowUp size={15} />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${e.name} down`}
                        className="grid place-items-center disabled:opacity-25" style={{ width: 32, height: 32, color: 'var(--color-text-secondary)' }}>
                        <ArrowDown size={15} />
                      </button>
                      <button type="button" onClick={() => remove(i)} aria-label={`Remove ${e.name}`}
                        className="grid place-items-center" style={{ width: 32, height: 32, color: 'var(--color-text-muted)' }}>
                        <Trash size={15} />
                      </button>
                    </div>

                    <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
                      <Stepper label="Sets" value={e.targetSets} min={1} max={20} onChange={(n) => patch(i, { targetSets: n })} />
                      {e.isTimed ? (
                        <Field label="Seconds">
                          <TextInput inputMode="numeric" value={e.targetSeconds ?? ''} style={{ minHeight: 40 }}
                            onChange={(ev) => patch(i, { targetSeconds: ev.target.value ? Number(num(ev.target.value)) : null })} />
                        </Field>
                      ) : (
                        <>
                          <Field label="Reps">
                            <TextInput inputMode="numeric" value={e.targetReps ?? ''} style={{ minHeight: 40 }}
                              onChange={(ev) => patch(i, { targetReps: ev.target.value ? Number(num(ev.target.value)) : null })} />
                          </Field>
                          <Field label="kg">
                            <TextInput inputMode="decimal" value={e.targetWeightKg ?? ''} placeholder="—" style={{ minHeight: 40 }}
                              onChange={(ev) => patch(i, { targetWeightKg: ev.target.value ? Number(num(ev.target.value)) : null })} />
                          </Field>
                        </>
                      )}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <Select value={String(e.restSeconds)} aria-label={`Rest after each set of ${e.name}`}
                        onChange={(ev) => patch(i, { restSeconds: Number(ev.target.value) })}>
                        {REST_OPTIONS.map((s) => <option key={s} value={s}>{restLabel(s)} between sets</option>)}
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Field label="Add an exercise" as="div">
              {/* Always shows "choose": picking adds a row and the field clears. */}
              <ExercisePicker exercises={catalogue} value="" onChange={add} />
            </Field>

            <div className="flex flex-col" style={{ gap: 10 }}>
              <NocButton variant="fill" className="w-full" onClick={save} disabled={!valid || saving}>
                {saving ? 'Saving…' : 'Save routine'}
              </NocButton>
              {!isNew && (
                <NocButton variant="ghost" className="w-full" onClick={() => setConfirmDelete(true)}>
                  Delete routine
                </NocButton>
              )}
            </div>
          </>
        )}

        <Modal
          isOpen={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete this routine"
          subtitle="Workouts you already did with it stay in your history."
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={() => { setConfirmDelete(false); void destroy(); }}
        >
          <span />
        </Modal>
      </Page>
    </FeatureLock>
  );
}
