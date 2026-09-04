import { panelStyle } from '../../../components/ui/Card';
import { Field, TextInput } from '../../../components/ui/Field';
import StepFlow, { ChoiceTile, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState } from 'react';
import { Target, Plus, Check, Trash2, ChevronDown, Lightbulb, Trophy } from 'lucide-react';
import { useMemberId } from '../hooks/useMemberId';
import PresetGoals from '../../../components/ui/PresetGoals';
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

/**
 * Status colours, in the app's two hues.
 *
 * "Achieved" used to be `#22c55e` — a green, in an app whose design system has
 * none, sitting next to a green progress bar. It read as a traffic light in a
 * palette that deliberately avoids them, and it was the only green on the
 * screen. Achieved is now **amber**, the colour this app already uses for the
 * thing that matters, and past-deadline steps back to muted rather than
 * shouting: a missed date is information, not a failure to punish someone with.
 */
const STATUS_STYLE: Record<Goal['status'], { bg: string; color: string; label: string }> = {
  active: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', label: 'In progress' },
  achieved: { bg: 'var(--color-secondary-light)', color: 'var(--color-secondary)', label: 'Achieved' },
  overdue: { bg: 'var(--color-bg)', color: 'var(--color-text-muted)', label: 'Past deadline' },
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
  const [showDone, setShowDone] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);

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

  // Achieved goals are the ones that pile up. Splitting them out is what lets
  // the tab open onto what is still in play rather than a mixed list where a
  // goal finished in March sits above one due next week.
  const open = goals.filter((g) => g.status !== 'achieved');
  const done = goals.filter((g) => g.status === 'achieved');
  const closest = open
    .map((g) => ({ g, pct: goalProgressPct(g) }))
    .filter((x): x is { g: Goal; pct: number } => x.pct != null)
    .sort((a, b) => b.pct - a.pct)[0];

  return (
    <div className="space-y-4">
      {/* Two real counts and, when there is one, the goal closest to done.
          Every number here is derived from rows — an empty section says zero
          rather than being hidden, so "no goals achieved yet" is a fact the
          member can read instead of an absence they have to infer. */}
      {goals.length > 0 && (
        <div className="rounded-2xl p-4" style={panelStyle}>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-2xl font-bold text-white leading-none">{open.length}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>in progress</p>
            </div>
            <div>
              <p className="text-2xl font-bold leading-none" style={{ color: 'var(--color-secondary)' }}>
                {done.length}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>achieved</p>
            </div>
          </div>
          {closest && (
            <p className="text-xs mt-3 pt-3" style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
              Closest to done:{' '}
              <span className="font-semibold text-white">{closest.g.title}</span>
              {' '}— {closest.pct}% there
            </p>
          )}
        </div>
      )}

      <button onClick={() => setShowForm(true)}
        className="w-full py-3.5 rounded-2xl text-sm font-bold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        <Plus size={17} /> Set a goal
      </button>

      {/* The five presets (0055), behind a toggle rather than always open.
          They are for someone who does not know what to set; a member who
          already has goals scrolls past five suggestion cards every visit to
          reach their own. Collapsed by default, one tap away. */}
      {memberId && (
        <div>
          <button
            onClick={() => setShowIdeas((v) => !v)}
            className="w-full py-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5"
            style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          >
            <Lightbulb size={14} />
            {showIdeas ? 'Hide goal ideas' : 'Not sure what to aim for? Browse ideas'}
            <ChevronDown size={14} style={{
              transform: showIdeas ? 'rotate(180deg)' : 'none', transition: 'transform 150ms',
            }} />
          </button>
          {showIdeas && (
            <div className="mt-2">
              <PresetGoals memberId={memberId} onCreated={load} />
            </div>
          )}
        </div>
      )}

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
        <div className="space-y-4">
          {open.length > 0 && (
            <div className="space-y-2">
              {open.map((g) => (
                <GoalCard key={g.id} goal={g} onAchieve={markAchieved} onRemove={remove} />
              ))}
            </div>
          )}

          {/* Completed goals behind a button. They are worth keeping — the
              count above is only meaningful because they are still there — but
              a finished goal has nothing left to act on, so it does not earn
              space above the ones that do. */}
          {done.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowDone((v) => !v)}
                className="w-full py-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
              >
                <Trophy size={14} style={{ color: 'var(--color-secondary)' }} />
                {showDone
                  ? 'Hide achieved goals'
                  : `Show ${done.length} achieved goal${done.length === 1 ? '' : 's'}`}
                <ChevronDown size={14} style={{
                  transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 150ms',
                }} />
              </button>
              {showDone && (
                <div className="space-y-2">
                  {done.map((g) => (
                    <GoalCard key={g.id} goal={g} onAchieve={markAchieved} onRemove={remove} />
                  ))}
                </div>
              )}
            </div>
          )}

          {open.length === 0 && done.length > 0 && !showDone && (
            <p className="text-xs text-center px-6" style={{ color: 'var(--color-text-muted)' }}>
              Nothing in progress. Set another goal, or look back at what you have already done.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One goal.
 *
 * Module level, not declared inside the tab's render — a component defined
 * during render is a fresh type every pass and remounts its subtree, which
 * would restart the progress bar's transition on every keystroke in the form
 * above it.
 */
function GoalCard({
  goal: g, onAchieve, onRemove,
}: {
  goal: Goal;
  onAchieve: (g: Goal) => void;
  onRemove: (g: Goal) => void;
}) {
  const pct = goalProgressPct(g);
  const style = STATUS_STYLE[g.status];
  const unit = METRICS.find((m) => m.id === g.metric)?.unit ?? '';
  return (
              <div className="rounded-2xl p-4" style={panelStyle}>
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
                    {/* The two numbers the bar is drawn from, spelled out.
                        A bar alone says "some of the way" and makes the member
                        do the arithmetic to find out how far is left. */}
                    {g.currentValue != null && g.targetValue != null && (
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-lg font-bold text-white">
                          {g.currentValue}<span className="text-xs font-normal">{unit}</span>
                        </span>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {Math.abs(g.targetValue - g.currentValue).toFixed(1).replace(/\.0$/, '')}{unit} to go
                        </span>
                      </div>
                    )}
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: 'var(--color-secondary)' }} />
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
                    <button onClick={() => onAchieve(g)}
                      className="flex-1 py-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5"
                      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                      <Check size={12} /> Mark achieved
                    </button>
                    <button onClick={() => onRemove(g)}
                      aria-label={`Delete goal: ${g.title}`}
                      className="px-3.5 py-2.5 rounded-full text-xs font-semibold"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
  );
}