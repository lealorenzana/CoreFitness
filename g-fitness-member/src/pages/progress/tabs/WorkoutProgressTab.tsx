import { panelStyle } from '../../../components/ui/Card';
import { Field, TextInput, TextArea } from '../../../components/ui/Field';
import StepFlow, { BigNumberInput, ChoiceTile, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Plus, ChevronDown, ChevronRight, History } from 'lucide-react';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
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
  //
  // Built from local parts, not `toISOString()`. Manila is UTC+8, so for the
  // first eight hours of every local day the UTC date is still yesterday — and
  // on the 1st of a month that means "this month" silently reports last
  // month's totals until 8am. Same bug that hid every pre-8am check-in.
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthLogs = logs.filter((l) => l.date.startsWith(thisMonth));
  const monthMinutes = monthLogs.reduce((sum, l) => sum + (l.duration ?? 0), 0);

  const lastLog = logs[0] ?? null;

  return (
    <div className="space-y-4">
      {/*
        ONE way in, not two.

        This used to be "Quick log" and "Track sets" side by side, equal weight,
        neither explaining itself — and the difference between them is not a
        difference in the *thing* being recorded. It is **when** you are
        recording it: afterwards, from memory, or live between sets. Two buttons
        made that look like two features and the member had to guess which one
        their workout was.

        So the button is the ordinary case, and the live tracker is a line under
        it that says what it is for. Both still reach the same history.
      */}
      <button
        onClick={() => setShowForm(true)}
        className="w-full py-3.5 rounded-2xl text-sm font-bold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}
      >
        <Plus size={17} /> Log a workout
      </button>

      <button
        onClick={() => navigate('/member/track')}
        className="w-full -mt-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--color-primary)' }}
      >
        <Dumbbell size={13} /> Training right now? Track sets as you go
        <ChevronRight size={13} />
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

          {/* The most recent session only. Everything before it is history and
              sits behind the button below — a tab that opens onto forty cards
              is a tab nobody reads, and the one fact worth seeing on arrival is
              when you last trained. */}
          {lastLog && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-2"
                style={{ color: 'var(--color-text-muted)' }}>
                Last session
              </p>
              <LogCard log={lastLog} />
            </div>
          )}

          {logs.length > 1 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="w-full py-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
              >
                <History size={14} />
                {showHistory
                  ? 'Hide earlier workouts'
                  : `Show ${logs.length - 1} earlier workout${logs.length - 1 === 1 ? '' : 's'}`}
                <ChevronDown
                  size={14}
                  style={{
                    transform: showHistory ? 'rotate(180deg)' : 'none',
                    transition: 'transform 150ms',
                  }}
                />
              </button>

              {/* Rendered only when open. `hidden` would keep forty cards in the
                  tree, and this list grows for the life of the membership. */}
              {showHistory && (
                <div className="space-y-2">
                  {logs.slice(1).map((l) => <LogCard key={l.id} log={l} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One row of the log. Module level — see the note in ResourceThumb about why. */
function LogCard({ log: l }: { log: WorkoutLog }) {
  return (
    <div className="rounded-2xl p-4" style={panelStyle}>
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
  );
}