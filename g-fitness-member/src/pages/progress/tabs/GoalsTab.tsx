import { Field, TextInput } from '../../../components/ui/Field';
import StepFlow, { ChoiceTile, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState } from 'react';
import { Plus, Check, Lightbulb, Trophy } from '@phosphor-icons/react';
import { InlineStat, NocButton, ProgressBar, StatusPill } from '../../../components/ui/noc';
import { useMemberId } from '../hooks/useMemberId';
import PresetGoals from '../../../components/ui/PresetGoals';
import { Skeleton } from '../../../components/ui/Skeleton';
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
 * Status, in the kit's roles.
 *
 * "Achieved" was once `#22c55e` — a green, in an app whose design system has
 * none. It is amber: reaching a goal is the thing that matters. In progress is
 * state, so violet. Past deadline steps back to muted rather than shouting: a
 * missed date is information, not a failure to punish someone with.
 */
const STATUS: Record<Goal['status'], { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  active: { label: 'In progress', tone: 'structure' },
  achieved: { label: 'Achieved', tone: 'action' },
  overdue: { label: 'Past deadline', tone: 'muted' },
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

  // Refetches when the member id resolves; `load` is rebuilt each render and is
  // deliberately not a dependency. The IIFE is what the set-state-in-effect rule
  // needs — it follows a directly called function into its setState.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void (async () => { await load(); })(); }, [memberId]);

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
                  style={{
                    padding: '8px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12.5,
                    border: '1px solid var(--color-hairline)', color: 'var(--color-text-secondary)',
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
                    style={{
                      height: 48, borderRadius: 'var(--radius-btn)', fontSize: 14,
                      background: selected ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)' : 'transparent',
                      border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
                      color: selected ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
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
              <span style={{ color: 'var(--color-primary-300)' }}>
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

  // Achieved goals are the ones that pile up. Splitting them out lets the tab
  // open onto what is still in play rather than a mixed list where a goal
  // finished in March sits above one due next week.
  const open = goals.filter((g) => g.status !== 'achieved');
  const done = goals.filter((g) => g.status === 'achieved');

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stack)' }}>
      <StepFlow
        open={showForm}
        title="Set a goal"
        steps={steps}
        submitLabel="Save goal"
        saving={saving}
        onClose={() => setShowForm(false)}
        onSubmit={save}
      />

      {goals.length > 0 && (
        <div className="flex" style={{ gap: 24 }}>
          <InlineStat value={open.length} label="in progress" />
          <InlineStat value={done.length} label="achieved" />
        </div>
      )}

      {goals.length === 0 ? (
        // A sentence, not a zero: a goal is the only thing that turns a reading
        // into a fraction, and without one the app shows numbers and nothing else.
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          No goal set. A goal is what turns a reading into progress — set one and it tracks itself from the
          measurements you log.
        </p>
      ) : (
        <section className="flex flex-col" style={{ gap: 22 }}>
          {open.map((g) => <GoalRow key={g.id} goal={g} onAchieve={markAchieved} onRemove={remove} />)}
          {open.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Nothing in progress. Set another goal, or look back at what you have already done.
            </p>
          )}
        </section>
      )}

      <NocButton variant="action" icon={<Plus size={15} />} onClick={() => setShowForm(true)}>
        Set a goal
      </NocButton>

      {/* The presets (0055), behind a control. They are for someone who does
          not know what to set; a member who already has goals should not
          scroll past five suggestions every visit to reach their own. */}
      {memberId && (
        <section>
          <button onClick={() => setShowIdeas((v) => !v)} className="flex items-center"
            style={{ gap: 7, fontSize: 12.5, color: 'var(--color-primary-300)' }}>
            <Lightbulb size={15} />
            {showIdeas ? 'Hide goal ideas' : 'Not sure what to aim for? Browse ideas'}
          </button>
          {showIdeas && (
            <div style={{ marginTop: 12 }}>
              <PresetGoals memberId={memberId} onCreated={load} />
            </div>
          )}
        </section>
      )}

      {/* Achieved goals behind a control: worth keeping — the count above means
          something only because they are still there — but a finished goal has
          nothing left to act on. */}
      {done.length > 0 && (
        <section>
          <NocButton variant="ghost" className="w-full" icon={<Trophy size={15} />}
            onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide achieved goals' : `Show ${done.length} achieved goal${done.length === 1 ? '' : 's'}`}
          </NocButton>
          {showDone && (
            <div className="flex flex-col" style={{ gap: 22, marginTop: 18 }}>
              {done.map((g) => <GoalRow key={g.id} goal={g} onAchieve={markAchieved} onRemove={remove} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const shortDay = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * One goal: name and where it stands, a bar only when there is a real
 * denominator, then what to do about it.
 *
 * Module level, not declared inside the tab's render — a component defined
 * during render is a fresh type every pass and remounts its subtree.
 */
function GoalRow({
  goal: g, onAchieve, onRemove,
}: {
  goal: Goal;
  onAchieve: (g: Goal) => void;
  onRemove: (g: Goal) => void;
}) {
  const pct = goalProgressPct(g);
  const status = STATUS[g.status];
  const metric = METRICS.find((m) => m.id === g.metric);
  const unit = metric?.unit ?? '';
  return (
    <div>
      {/* The metric always shows above the title: a goal called "50" with no
          target rendered as the bare string "50", and the member could not
          tell what they had meant by it either. */}
      <div className="flex items-center justify-between" style={{ gap: 10 }}>
        <p className="eyebrow">{metric?.label ?? 'Goal'}</p>
        <StatusPill label={status.label} tone={status.tone} />
      </div>
      <div className="flex items-baseline justify-between" style={{ gap: 12, marginTop: 6 }}>
        <span className="break-words min-w-0" style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{g.title}</span>
        {g.currentValue != null && (
          <span className="flex-none" style={{ fontSize: 13.5, color: 'var(--color-primary-300)' }}>
            {g.currentValue}{unit ? ` ${unit}` : ''}
          </span>
        )}
      </div>

      {pct != null ? (
        <>
          <ProgressBar fraction={pct / 100} style={{ marginTop: 9 }} />
          <p className="flex justify-between" style={{ fontSize: 12, marginTop: 7, color: 'var(--color-text-secondary)' }}>
            <span>
              {g.currentValue != null && g.targetValue != null
                ? `${Math.abs(g.targetValue - g.currentValue).toFixed(1).replace(/\.0$/, '')}${unit ? ` ${unit}` : ''} to go · ${pct}% there`
                : `${pct}% there`}
            </span>
            {g.deadline && <span>by {shortDay(g.deadline)}</span>}
          </p>
        </>
      ) : (
        // No bar rather than a guessed one — see goalProgressPct.
        <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          {g.metric === 'custom'
            ? 'Tracked by you — mark it done when you get there.'
            : 'Log a measurement to start tracking this.'}
          {g.targetValue != null ? ` Target ${g.targetValue}${unit ? ` ${unit}` : ''}.` : ''}
          {g.deadline ? ` By ${shortDay(g.deadline)}.` : ''}
        </p>
      )}

      {g.status !== 'achieved' && (
        <div className="flex items-center justify-between" style={{ marginTop: 10, fontSize: 12.5 }}>
          <button onClick={() => onAchieve(g)} className="flex items-center" style={{ gap: 6, color: 'var(--color-secondary)' }}>
            <Check size={14} /> Mark achieved
          </button>
          <button onClick={() => onRemove(g)} aria-label={`Remove goal: ${g.title}`}
            style={{ color: 'var(--color-text-secondary)' }}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
