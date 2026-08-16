import { panelStyle } from '../../../components/ui/Card';
import { Field, TextInput, TextArea } from '../../../components/ui/Field';
import StepFlow, { BigNumberInput, ChoiceTile, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState } from 'react';
import { Dumbbell, Plus } from 'lucide-react';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import { toast } from '../../../components/ui/Toast';
import { errorMessage } from '../../../utils/errorMessage';
import { progressService, type WorkoutLog } from '../../../services/progressService';
import { getGymSettings } from '../../../lib/api/settings';

/**
 * The member's own workout log, from `workout_logs` (migration 0020).
 *
 * The old version tracked calories burned and a "personal record" flag. Both
 * are gone: calories need body mass and heart rate, a PR needs per-exercise
 * weights, and this schema models neither. The numbers in the old fixture were
 * simply typed in.
 *
 * Activity choices come from the same `gym_settings.activity_options` list the
 * front desk tags check-ins with, so a member's log and the gym's attendance
 * records describe workouts in the same vocabulary.
 */

export default function WorkoutProgressTab() {
  const memberId = useMemberId();
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: '', duration: '', notes: '' });

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

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

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

  // Real totals over real rows. Nothing estimated.
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthLogs = logs.filter((l) => l.date.startsWith(thisMonth));
  const monthMinutes = monthLogs.reduce((sum, l) => sum + (l.duration ?? 0), 0);

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(true)}
        className="w-full py-2.5 rounded-full text-sm font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        <Plus size={15} /> Log a workout
      </button>

      <StepFlow
        open={showForm}
        title="Log a workout"
        steps={steps}
        submitLabel="Save workout"
        saving={saving}
        onClose={() => setShowForm(false)}
        onSubmit={save}
      />

      {logs.length === 0 ? (
        <EmptyState icon={Dumbbell} title="No workouts logged"
          message="Log what you do and it builds a history you can look back on." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl p-4" style={panelStyle}>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>This month</p>
              <p className="text-2xl font-bold text-white">{monthLogs.length}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                workout{monthLogs.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="rounded-2xl p-4" style={panelStyle}>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Time trained</p>
              <p className="text-2xl font-bold text-white">
                {monthMinutes >= 60 ? `${Math.floor(monthMinutes / 60)}h` : `${monthMinutes}m`}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {monthMinutes >= 60 ? `${monthMinutes % 60}m more` : 'this month'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="rounded-2xl p-4" style={panelStyle}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{l.type}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(`${l.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {l.duration != null && ` · ${l.duration} min`}
                    </p>
                  </div>
                  <Dumbbell size={16} style={{ color: 'var(--color-secondary)' }} />
                </div>
                {l.notes && (
                  <p className="text-xs mt-2 px-2 py-1 rounded-lg"
                    style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                    {l.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}