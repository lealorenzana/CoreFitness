import { panelStyle } from '../../../components/ui/Card';
import { Field, TextInput } from '../../../components/ui/Field';
import StepFlow, { ChoiceTile, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState } from 'react';
import { Target, Plus, Check, Trash2 } from 'lucide-react';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import { toast } from '../../../components/ui/Toast';
import { errorMessage } from '../../../utils/errorMessage';
import { progressService, goalProgressPct, type Goal } from '../../../services/progressService';

/**
 * Goals, from `fitness_goals` (migration 0020).
 *
 * Progress is **derived from the member's latest measurement**, not stored on
 * the goal. A `currentValue` column would drift the moment someone logged a new
 * weight and forgot to come back here, and a stale progress bar is worse than
 * none — it looks like a measurement.
 *
 * Goals tied to a metric this app can read (weight, body fat, waist) show a bar.
 * A custom goal shows none, because nothing measures it.
 */

const METRICS = [
  { id: 'weight_kg', label: 'Weight', unit: 'kg' },
  { id: 'body_fat_pct', label: 'Body fat', unit: '%' },
  { id: 'waist_cm', label: 'Waist', unit: 'cm' },
  { id: 'custom', label: 'Something else', unit: '' },
] as const;

const STATUS_STYLE: Record<Goal['status'], { bg: string; color: string; label: string }> = {
  active: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', label: 'In progress' },
  achieved: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: 'Achieved' },
  overdue: { bg: 'var(--color-secondary-light)', color: 'var(--color-secondary)', label: 'Past deadline' },
};

export default function GoalsTab() {
  const memberId = useMemberId();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', metric: 'weight_kg', startValue: '', targetValue: '', deadline: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      setGoals(await progressService.getGoals(memberId));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your goals'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  const save = async () => {
    if (!form.title.trim()) return toast.error('Give the goal a name');
    setSaving(true);
    try {
      const num = (v: string) => (v.trim() === '' ? null : Number(v));
      await progressService.addGoal(memberId, {
        title: form.title.trim(),
        metric: form.metric,
        startValue: num(form.startValue),
        targetValue: num(form.targetValue),
        deadline: form.deadline || null,
      });
      toast.success('Goal added');
      setShowForm(false);
      setForm({ title: '', metric: 'weight_kg', startValue: '', targetValue: '', deadline: '' });
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that goal'));
    } finally {
      setSaving(false);
    }
  };

  const markAchieved = async (g: Goal) => {
    try {
      await progressService.markGoalAchieved(g.id);
      toast.success('Nice work');
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update that goal'));
    }
  };

  const remove = async (g: Goal) => {
    try {
      await progressService.deleteGoal(g.id);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete that goal'));
    }
  };

  const unitFor = (metric: string) => METRICS.find((m) => m.id === metric)?.unit ?? '';

  // The values step only exists for a metric this app can actually read. A
  // custom goal has nothing to measure against, so asking for a start and a
  // target would collect two numbers that could never move a progress bar.
  const steps: FlowStep[] = [
    {
      id: 'title',
      title: "What's the goal?",
      hint: 'Name it the way you would say it out loud — you will read this back for weeks.',
      valid: form.title.trim() !== '',
      render: (
        <div className="space-y-4">
          <Field label="Goal">
            <TextInput
              className="py-3.5 text-base"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Get to 70 kg"
              autoFocus
            />
          </Field>

          {/* A bare input on an otherwise empty screen gives no sense of what a
              good answer looks like — the placeholder vanishes the moment you
              type, and "50" is a perfectly reasonable thing to end up with.
              These fill the field; they are examples, not preset goals. */}
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Not sure how to phrase it? Start from one of these:
            </p>
            <div className="flex flex-wrap gap-2">
              {['Get to 70 kg', 'Lose 5 kg', 'Train 3× a week', 'Drop to 20% body fat'].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setForm({ ...form, title: example })}
                  className="px-3 py-2 rounded-full text-xs font-semibold"
                  style={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'metric',
      title: 'How should we track it?',
      hint: 'Pick a measurement and the goal updates itself every time you log one.',
      valid: true,
      render: (
        <div className="space-y-2">
          {METRICS.map((m) => (
            <ChoiceTile
              key={m.id}
              label={m.label}
              description={m.id === 'custom' ? 'You decide when it is done' : `Tracked in ${m.unit}`}
              selected={form.metric === m.id}
              onClick={() => setForm({ ...form, metric: m.id })}
            />
          ))}
        </div>
      ),
    },
    ...(form.metric !== 'custom'
      ? [{
          id: 'values',
          title: 'Where are you now?',
          hint: `Your starting point and where you want to get to, in ${unitFor(form.metric)}.`,
          answered: form.startValue.trim() !== '' || form.targetValue.trim() !== '',
          render: (
            <div className="space-y-3">
              <Field label={`Starting at (${unitFor(form.metric)})`}>
                <TextInput type="number" inputMode="decimal" value={form.startValue}
                  onChange={(e) => setForm({ ...form, startValue: e.target.value })} />
              </Field>
              <Field label={`Target (${unitFor(form.metric)})`}>
                <TextInput type="number" inputMode="decimal" value={form.targetValue}
                  onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
              </Field>
            </div>
          ),
        } satisfies FlowStep]
      : []),
    {
      id: 'deadline',
      title: 'By when?',
      hint: 'Optional. A goal past its date is flagged, never deleted.',
      answered: form.deadline !== '',
      render: (
        <div className="space-y-4">
          {/* Chips first. Almost every fitness goal is "in about N months",
              and picking that off a calendar means counting weeks in your head
              and fighting a native date picker on a phone. */}
          <div className="grid grid-cols-2 gap-2">
            {([['1 month', 1], ['3 months', 3], ['6 months', 6], ['1 year', 12]] as const).map(
              ([label, months]) => {
                const d = new Date();
                d.setMonth(d.getMonth() + months);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const selected = form.deadline === iso;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setForm({ ...form, deadline: selected ? '' : iso })}
                    className="py-3 rounded-2xl text-sm font-semibold transition-colors"
                    style={{
                      background: selected ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
                      border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      color: selected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    In {label}
                  </button>
                );
              }
            )}
          </div>

          <Field label="Or pick an exact date">
            <TextInput type="date" value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </Field>

          {form.deadline && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Target:{' '}
              <span className="font-semibold" style={{ color: 'var(--color-secondary)' }}>
                {new Date(`${form.deadline}T00:00:00`).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </span>
            </p>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(true)}
        className="w-full py-2.5 rounded-full text-sm font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        <Plus size={15} /> Set a goal
      </button>

      <StepFlow
        open={showForm}
        title="Set a goal"
        steps={steps}
        submitLabel="Save goal"
        saving={saving}
        onClose={() => setShowForm(false)}
        onSubmit={save}
      />

      {goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet"
          message="Set one and it tracks itself from the measurements you log." />
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const pct = goalProgressPct(g);
            const style = STATUS_STYLE[g.status];
            const unit = unitFor(g.metric);
            return (
              <div key={g.id} className="rounded-2xl p-4" style={panelStyle}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    {/* The metric always shows, above the title.
                        A goal called "50" with no target rendered as the bare
                        string "50" and nothing else — the member could not tell
                        what they had meant by it either. The category and the
                        date it was set are the two things that make a terse
                        title readable again. */}
                    <p
                      className="text-xs font-bold uppercase tracking-wider mb-0.5"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      {METRICS.find((m) => m.id === g.metric)?.label ?? 'Goal'}
                    </p>
                    <p className="text-sm font-semibold text-white break-words">{g.title}</p>
                    {g.targetValue != null ? (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        Target {g.targetValue}{unit}
                        {g.currentValue != null && ` · now ${g.currentValue}${unit}`}
                        {g.deadline && ` · by ${new Date(`${g.deadline}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </p>
                    ) : (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        No target set
                        {g.deadline && ` · by ${new Date(`${g.deadline}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        {` · set ${new Date(g.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                    style={{ background: style.bg, color: style.color }}>
                    {style.label}
                  </span>
                </div>

                {pct != null ? (
                  <>
                    <div className="h-2 rounded-full" style={{ background: 'var(--color-border)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: g.status === 'achieved' ? '#22c55e' : 'var(--color-secondary)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{pct}% there</p>
                  </>
                ) : (
                  // No bar rather than a guessed one — see goalProgressPct.
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {g.metric === 'custom'
                      ? 'Tracked by you — mark it done when you get there.'
                      : 'Log a measurement to start tracking this.'}
                  </p>
                )}

                {g.status !== 'achieved' && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => markAchieved(g)}
                      className="flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                      <Check size={12} /> Mark achieved
                    </button>
                    <button onClick={() => remove(g)}
                      className="px-3 py-2 rounded-full text-xs font-semibold"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}