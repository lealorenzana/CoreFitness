import { Field, TextInput, TextArea } from '../../../components/ui/Field';
import StepFlow, { BigNumberInput, ChoiceTile, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, CaretRight, Plus, ClockCounterClockwise } from '@phosphor-icons/react';
import { NocButton, SectionHead } from '../../../components/ui/noc';
import DayWorkoutsSheet from '../../../components/ui/DayWorkoutsSheet';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import { toast } from '../../../components/ui/Toast';
import { errorMessage } from '../../../utils/errorMessage';
import { progressService, type WorkoutLog } from '../../../services/progressService';
import { getGymSettings } from '../../../lib/api/settings';
import FeatureLock from '../../../components/ui/FeatureLock';

/**
 * The member's own workout log, from `workout_logs` (migration 0020).
 *
 * The old version tracked calories burned and a "personal record" flag. Both
 * were removed because the numbers in the old fixture were simply typed in:
 * calories need body mass and heart rate, which this schema still does not
 * model and will not guess.
 *
 * Per-exercise weight is a different story now. 0050 added `workout_sets`, so
 * "Track a workout" below records exercise, sets, reps and load, and a session
 * logged there appears in this list like any other. This screen stays the quick
 * version — "Cardio, 30 minutes" — because that is all most sessions need and
 * it is the one every tier can use.
 *
 * Activity choices come from the same `gym_settings.activity_options` list the
 * front desk tags check-ins with, so a member's log and the gym's attendance
 * records describe workouts in the same vocabulary.
 */

/**
 * The workout log is the `workout_tracker` entitlement (0049), and this tab is
 * where a member reads it back. It was the one surface of that feature with no
 * gate on it: the tracker itself and its Add button were both locked, so a Free
 * Plan member was told "Workout tracker - not on this plan" on their membership
 * card and then shown the tracker's own history tab anyway.
 *
 * Locked and explained rather than removed from the tab strip - a tab that
 * vanishes teaches nobody that the paid plan has more in it.
 */
export default function WorkoutProgressTab() {
  return (
    <FeatureLock feature="workout_tracker">
      <WorkoutProgress />
    </FeatureLock>
  );
}

function WorkoutProgress() {
  const memberId = useMemberId();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: '', duration: '', notes: '' });
  const [showHistory, setShowHistory] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rows, settings] = await Promise.all([
        progressService.getWorkoutLogs(memberId),
        getGymSettings().catch(() => null),
      ]);
      setLogs(rows);
      const opts = settings?.activity_options ?? [];
      setOptions(opts);
      setForm((f) => ({ ...f, type: f.type || opts[0] || '' }));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your workouts'));
    } finally {
      setLoading(false);
    }
  };

  // Refetches when the member id resolves; `load` is rebuilt each render and is
  // deliberately not a dependency. The IIFE is what the set-state-in-effect rule
  // needs — it follows a directly called function into its setState.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void (async () => { await load(); })(); }, [memberId]);

  const save = async () => {
    if (!form.type.trim()) return toast.error('Pick what you did');
    setSaving(true);
    try {
      await progressService.addWorkoutLog(memberId, {
        type: form.type,
        duration: form.duration.trim() === '' ? null : Number(form.duration),
        notes: form.notes.trim() || undefined,
      });
      toast.success('Workout logged');
      setShowForm(false);
      setForm({ type: options[0] ?? '', duration: '', notes: '' });
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that workout'));
    } finally {
      setSaving(false);
    }
  };

  // "What did you do" is the one required answer — a log with no activity says
  // nothing. Minutes and notes can both be skipped.
  const steps: FlowStep[] = [
    {
      id: 'type',
      title: 'What did you do?',
      hint: 'These are the same activities the front desk tags check-ins with.',
      valid: form.type.trim() !== '',
      render: options.length > 0 ? (
        <div className="space-y-2">
          {options.map((o) => (
            <ChoiceTile key={o} label={o} selected={form.type === o} onClick={() => setForm({ ...form, type: o })} />
          ))}
        </div>
      ) : (
        <Field label="Activity">
          <TextInput value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            placeholder="e.g. Strength" />
        </Field>
      ),
    },
    {
      id: 'duration',
      title: 'How long?',
      hint: 'Roughly is fine. Skip if you did not keep track.',
      answered: form.duration.trim() !== '',
      render: (
        <BigNumberInput
          value={form.duration}
          onChange={(v) => setForm({ ...form, duration: v })}
          unit="min"
          step={5}
          // Most people train for roughly the same length each time, so their
          // own last session is a better starting point than zero.
          seed={logs.find((l) => l.duration != null)?.duration ?? null}
          seedLabel={
            logs.find((l) => l.duration != null)
              ? `Last session ${logs.find((l) => l.duration != null)!.duration} min`
              : undefined
          }
        />
      ),
    },
    {
      id: 'notes',
      title: 'How did it go?',
      hint: 'A line for your future self — what felt heavy, what to try next time.',
      answered: form.notes.trim() !== '',
      render: (
        <Field label="Notes">
          <TextArea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Optional" />
        </Field>
      ),
    },
  ];

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;

  // The five most recent sessions are the list; anything older sits behind a
  // control. This list grows for the life of the membership, and a section
  // that opens onto forty rows is a section nobody reads.
  const RECENT = 5;
  const shown = showHistory ? logs : logs.slice(0, RECENT);

  return (
    <section className="flex flex-col" style={{ gap: 14 }}>
      <StepFlow
        open={showForm}
        title="Log an activity"
        steps={steps}
        submitLabel="Save"
        saving={saving}
        onClose={() => setShowForm(false)}
        onSubmit={save}
      />

      <SectionHead title="Recent workouts" meta={logs.length > 0 ? `${logs.length} in all` : undefined} />

      {logs.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          Nothing yet. Start one of your routines and every set you tick is kept here, day by day.
        </p>
      ) : (
        <div className="noc-rows">
          {shown.map((l, i) => (
            <div key={l.id}>
              {/* The whole row opens that day's workout, set by set. */}
              <button onClick={() => setOpenDay(l.date)} className="w-full flex items-center text-left noc-row"
                style={{ gap: 12, padding: '12px 0' }}>
                <span className="flex-none flex flex-col items-center justify-center orb-cell orb-cell--busy"
                  style={{ width: 46, height: 46, borderRadius: 12 }}>
                  <span style={{ fontSize: 11, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-primary-300)' }}>
                    {new Date(`${l.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                  <span style={{ fontSize: 17, lineHeight: 1.1, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {new Date(`${l.date}T00:00:00`).getDate()}
                  </span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{l.type}</span>
                  <span className="block truncate" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                    {[l.duration != null ? `${l.duration} min` : null, l.notes].filter(Boolean).join(' · ') || 'Tap to see what you did'}
                  </span>
                </span>
                <CaretRight size={15} className="flex-none" style={{ color: 'var(--color-text-muted)' }} />
              </button>
              {i < shown.length - 1 && <div className="hair" />}
            </div>
          ))}
        </div>
      )}

      {logs.length > RECENT && (
        <button onClick={() => setShowHistory((v) => !v)} className="self-start inline-flex items-center noc-press"
          style={{ gap: 6, fontSize: 13, color: 'var(--color-primary-300)' }}>
          <ClockCounterClockwise size={14} />
          {showHistory ? 'Show recent only' : `Show ${logs.length - RECENT} earlier`}
        </button>
      )}

      {/* ONE way in: the guided workout. The quick after-the-fact log stays,
          as the line under it, for a session that was not a routine. */}
      <div className="flex flex-col" style={{ gap: 10, marginTop: 4 }}>
        <NocButton variant="action" icon={<Barbell size={16} weight="fill" />} onClick={() => navigate('/member/track')}>
          Start a workout
        </NocButton>
        <button onClick={() => setShowForm(true)} className="self-center inline-flex items-center"
          style={{ gap: 6, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
          <Plus size={13} /> Log an activity from memory — a run, a class, a swim
        </button>
      </div>

      <DayWorkoutsSheet memberId={memberId} day={openDay} onClose={() => setOpenDay(null)} />
    </section>
  );
}

