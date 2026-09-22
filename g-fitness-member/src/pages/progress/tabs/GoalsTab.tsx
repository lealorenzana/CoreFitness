import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useGymApp } from '../../../hooks/useGymApp';
import { pointsWord } from '../../../lib/gymApp';
import {
  Barbell, CalendarCheck, Check, Flag, PencilSimple, Percent, Plus, Ruler, Scales, Sparkle, Trash, Trophy,
} from '@phosphor-icons/react';
import StepFlow, { ChoiceTile, type FlowStep } from '../../../components/ui/StepFlow';
import { Field, TextInput } from '../../../components/ui/Field';
import ExercisePicker from '../../../components/ui/ExercisePicker';
import GlassSheet from '../../../components/ui/GlassSheet';
import Modal from '../../../components/ui/Modal';
import Disclosure from '../../../components/ui/Disclosure';
import { Eyebrow, InlineStat, NocButton, Panel, ProgressBar, StatusPill } from '../../../components/ui/noc';
import { Skeleton } from '../../../components/ui/Skeleton';
import { toast } from '../../../components/ui/Toast';
import { errorMessage } from '../../../utils/errorMessage';
import { useMemberId } from '../hooks/useMemberId';
import {
  BODY_METRICS, addGoal, editGoal, loadGoals, markCustomDone, removeGoal,
  type BodyMetric, type GoalKind, type GoalView, type GoalsSnapshot, type Pace,
} from '../../../services/goalsService';

/**
 * Goals (reworked 2026-09-18, with migration 0087).
 *
 * What changed, and why:
 *
 *   - **Goals track themselves.** Body goals read the latest reading that has
 *     their number, strength goals the heaviest finished set, habit goals are
 *     counted in SQL — and all three are marked reached by the database when
 *     the numbers get there (opening this screen settles them). Preset goals
 *     used to show "log a measurement" forever; a weight goal went blank after
 *     a reading with no weight in it.
 *   - **Pace and a projected date.** "Behind — 40% there, 60% of the time gone"
 *     and "at this rate, Oct 30", computed from the member's own readings, and
 *     silent when there is not enough to say.
 *   - **Strength goals** — "Squat 100 kg" — from the sets My routines records.
 *   - **Edit** instead of delete-and-redo, and **Remove asks first**.
 *   - One goal leads, as a ring: the one closest to its deadline.
 */

const KIND_ICON: Record<GoalKind, (size: number) => ReactNode> = {
  body: (s) => <Scales size={s} weight="duotone" />,
  strength: (s) => <Barbell size={s} weight="duotone" />,
  habit: (s) => <CalendarCheck size={s} weight="duotone" />,
  custom: (s) => <Flag size={s} weight="duotone" />,
};

const PACE: Record<Exclude<Pace, null>, { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  ahead: { label: 'Ahead', tone: 'structure' },
  on_track: { label: 'On track', tone: 'structure' },
  behind: { label: 'Behind', tone: 'action' },
};

const fmt = (n: number) => String(Number(n.toFixed(1)));
const shortDay = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "12 kg to go" / "3 of 6 weeks" / "Done". */
function remainingLine(g: GoalView): string | null {
  if (g.achievedOn) return `Reached ${shortDay(g.achievedOn)}`;
  if (g.kind === 'habit' && g.currentValue != null && g.targetValue != null) {
    return `${g.currentValue} of ${g.targetValue}`;
  }
  if (g.currentValue != null && g.targetValue != null) {
    const left = Math.abs(g.targetValue - g.currentValue);
    return left === 0 ? 'Right on target' : `${fmt(left)} ${g.unit} to go`;
  }
  return null;
}

/** The goal's ring: a violet arc on a faint track, the percentage inside. */
function Ring({ pct, size = 96, children }: { pct: number | null; size?: number; children?: ReactNode }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const f = pct == null ? 0 : pct / 100;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <defs>
          <linearGradient id="goal-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="60%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(233,233,237,0.08)" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#goal-ring)" strokeWidth={8}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)}
          className="goal-ring-arc" style={{ ['--ring-len' as string]: c }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

function GoalCard({
  g, onEdit, onRemove, onDone,
}: {
  g: GoalView;
  onEdit: (g: GoalView) => void;
  onRemove: (g: GoalView) => void;
  onDone: (g: GoalView) => void;
}) {
  const line = remainingLine(g);
  return (
    <div className="orb-cell" style={{ borderRadius: 16, padding: 14 }}>
      <div className="flex items-start" style={{ gap: 12 }}>
        <span className={`flex-none grid place-items-center orb-cell ${g.achievedOn ? 'orb-cell--on' : 'orb-cell--busy'}`}
          style={{ width: 38, height: 38, borderRadius: 11, color: g.achievedOn ? '#fff' : 'var(--color-primary-300)' }}>
          {g.achievedOn ? <Trophy size={18} weight="fill" /> : KIND_ICON[g.kind](18)}
        </span>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{g.subject}</p>
          <p className="break-words" style={{ fontSize: 15, fontWeight: 600, marginTop: 1, color: 'var(--color-text-primary)' }}>{g.title}</p>
        </div>
        {g.achievedOn ? <StatusPill label="Reached" tone="action" />
          : g.overdue ? <StatusPill label="Past date" tone="muted" />
          : g.pace ? <StatusPill label={PACE[g.pace].label} tone={PACE[g.pace].tone} /> : null}
      </div>

      {g.pct != null && (
        <div style={{ marginTop: 12 }}>
          <ProgressBar fraction={g.pct / 100} tone={g.pace === 'behind' ? 'action' : 'structure'} />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap" style={{ gap: 8, marginTop: 9, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
        <span>
          {g.currentValue != null && g.kind !== 'habit' && <span style={{ color: 'var(--color-primary-300)' }}>Now {fmt(g.currentValue)} {g.unit} · </span>}
          {line ?? (g.kind === 'custom' ? 'You mark this one done yourself.'
            : g.kind === 'strength' ? 'Finish a workout with this lift to start tracking.'
            : 'Log a reading to start tracking.')}
          {g.pct != null && !g.achievedOn && ` · ${g.pct}%`}
        </span>
        {g.deadline && !g.achievedOn && <span style={{ color: 'var(--color-text-muted)' }}>by {shortDay(g.deadline)}</span>}
      </div>

      {g.measuredAs && !g.achievedOn && (
        <p style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>{g.measuredAs}</p>
      )}
      {g.projected && !g.achievedOn && (
        <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
          <Sparkle size={13} style={{ color: 'var(--color-secondary)', display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
          At your current rate you'll get there around <strong style={{ color: 'var(--color-text-primary)' }}>{g.projected}</strong>.
        </p>
      )}

      {!g.achievedOn && (
        <div className="flex items-center" style={{ gap: 16, marginTop: 12, fontSize: 12.5 }}>
          {g.kind === 'custom' && (
            <button onClick={() => onDone(g)} className="inline-flex items-center noc-press" style={{ gap: 5, color: 'var(--color-secondary)' }}>
              <Check size={14} weight="bold" /> Mark done
            </button>
          )}
          <button onClick={() => onEdit(g)} className="inline-flex items-center noc-press" style={{ gap: 5, color: 'var(--color-primary-300)' }}>
            <PencilSimple size={14} /> Edit
          </button>
          <button onClick={() => onRemove(g)} aria-label={`Remove goal: ${g.title}`}
            className="inline-flex items-center noc-press ml-auto" style={{ gap: 5, color: 'var(--color-text-muted)' }}>
            <Trash size={14} /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

const DEADLINES = [['1 month', 1], ['3 months', 3], ['6 months', 6], ['1 year', 12]] as const;
function monthsAhead(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The deadline picker: four chips and an exact date, shared by create and edit. */
function DeadlinePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {DEADLINES.map(([label, m]) => {
          const iso = monthsAhead(m);
          const on = value === iso;
          return (
            <button key={label} type="button" onClick={() => onChange(on ? '' : iso)}
              className={`orb-cell ${on ? 'orb-cell--on' : ''} noc-press`}
              style={{ height: 46, borderRadius: 'var(--radius-btn)', fontSize: 14, color: on ? '#fff' : 'var(--color-text-secondary)' }}>
              In {label}
            </button>
          );
        })}
      </div>
      <Field label="Or an exact date">
        <TextInput type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
    </div>
  );
}

const blankDraft = {
  kind: '' as GoalKind | '', metric: 'weight_kg' as BodyMetric, exerciseId: '', templateKey: '',
  start: '', target: '', title: '', deadline: '',
};

export default function GoalsTab() {
  const gymApp = useGymApp();
  const memberId = useMemberId();
  const [snap, setSnap] = useState<GoalsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [d, setD] = useState(blankDraft);
  const [editing, setEditing] = useState<GoalView | null>(null);
  const [edit, setEdit] = useState({ title: '', target: '', deadline: '' });
  const [removing, setRemoving] = useState<GoalView | null>(null);

  const load = useCallback(async (announce = false) => {
    if (!memberId) return;
    try {
      const s = await loadGoals(memberId);
      setSnap(s);
      if (announce && s.justReached > 0) {
        toast.success(s.justReached === 1 ? 'Goal reached — points added!' : `${s.justReached} goals reached — points added!`);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your goals'));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { void (async () => { await load(true); })(); }, [load]);

  if (loading || !snap) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;

  const active = snap.goals.filter((g) => !g.achievedOn);
  const done = snap.goals.filter((g) => g.achievedOn);
  // Only goals with a start, a target and a date have a pace; a count over the
  // rest would call a goal off pace when nothing was measured.
  const paced = active.filter((g) => g.pace != null);
  const onTrack = paced.filter((g) => g.pace === 'ahead' || g.pace === 'on_track').length;

  // The goal that leads: the soonest deadline, else the furthest along.
  const focus = [...active].sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return (b.pct ?? -1) - (a.pct ?? -1);
  })[0] ?? null;
  const others = active.filter((g) => g !== focus);

  // ── Create ──
  const bodyUnit = BODY_METRICS.find((m) => m.id === d.metric)?.unit ?? '';
  const exercise = snap.exercises.find((e) => e.id === d.exerciseId) ?? null;
  const template = snap.templates.find((t) => t.key === d.templateKey) ?? null;
  const setDraft = (p: Partial<typeof blankDraft>) => setD((x) => ({ ...x, ...p }));

  const suggestedTitle = (): string => {
    if (d.kind === 'body' && d.target) {
      return d.metric === 'weight_kg' ? `Get to ${d.target} kg` : d.metric === 'body_fat_pct' ? `Body fat to ${d.target}%` : `Waist to ${d.target} cm`;
    }
    if (d.kind === 'strength' && exercise && d.target) return `${exercise.name} ${d.target} kg`;
    if (d.kind === 'habit' && template) return template.label;
    return '';
  };

  const openCreate = () => { setD(blankDraft); setCreating(true); };

  const steps: FlowStep[] = [
    {
      id: 'kind',
      title: 'What kind of goal?',
      hint: 'Every kind except the last tracks itself from what you already log.',
      valid: d.kind !== '',
      render: (
        <div className="space-y-2">
          <ChoiceTile label="A body number" description="Weight, body fat or waist — from your readings" selected={d.kind === 'body'} onClick={() => setDraft({ kind: 'body' })} />
          <ChoiceTile label="A lift" description="Heavier on one exercise — from your workouts" selected={d.kind === 'strength'} onClick={() => setDraft({ kind: 'strength' })} />
          <ChoiceTile label="A habit" description="Train more often, build consistency — counted for you" selected={d.kind === 'habit'} onClick={() => setDraft({ kind: 'habit' })} />
          <ChoiceTile label="Something else" description="Your own words — you mark it done" selected={d.kind === 'custom'} onClick={() => setDraft({ kind: 'custom' })} />
        </div>
      ),
    },
    ...(d.kind === 'body' ? [{
      id: 'body',
      title: 'Which number, and where to?',
      hint: 'Your latest reading is filled in as the start.',
      valid: d.target.trim() !== '',
      render: (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {BODY_METRICS.map((m) => {
              const on = d.metric === m.id;
              const Icon = m.id === 'weight_kg' ? Scales : m.id === 'body_fat_pct' ? Percent : Ruler;
              return (
                <button key={m.id} type="button"
                  onClick={() => setDraft({ metric: m.id, start: snap.latestBody[m.id] != null ? String(snap.latestBody[m.id]) : '' })}
                  className={`orb-cell ${on ? 'orb-cell--on' : ''} flex flex-col items-center noc-press`}
                  style={{ gap: 6, padding: '12px 4px', borderRadius: 12, fontSize: 12.5, color: on ? '#fff' : 'var(--color-text-secondary)' }}>
                  <Icon size={18} weight="duotone" />{m.label}
                </button>
              );
            })}
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <Field label={`Now (${bodyUnit})`} hint={snap.latestBody[d.metric] != null ? 'From your last reading' : 'No reading yet'}>
              <TextInput type="number" inputMode="decimal"
                value={d.start || (snap.latestBody[d.metric] != null ? String(snap.latestBody[d.metric]) : '')}
                onChange={(e) => setDraft({ start: e.target.value })} />
            </Field>
            <Field label={`Target (${bodyUnit})`}>
              <TextInput type="number" inputMode="decimal" value={d.target} autoFocus onChange={(e) => setDraft({ target: e.target.value })} />
            </Field>
          </div>
        </div>
      ),
    } satisfies FlowStep] : []),
    ...(d.kind === 'strength' ? [{
      id: 'lift',
      title: 'Which lift, and how heavy?',
      hint: 'Your heaviest set so far is the start. It completes itself the day you lift the target.',
      valid: d.exerciseId !== '' && d.target.trim() !== '',
      render: (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <Field label="Exercise" as="div">
            <ExercisePicker exercises={snap.exercises.filter((e) => !e.isTimed)} value={d.exerciseId}
              onChange={(id) => setDraft({ exerciseId: id })} />
          </Field>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <Field label="Best now (kg)" hint="Optional">
              <TextInput type="number" inputMode="decimal" value={d.start} onChange={(e) => setDraft({ start: e.target.value })} />
            </Field>
            <Field label="Target (kg)">
              <TextInput type="number" inputMode="decimal" value={d.target} onChange={(e) => setDraft({ target: e.target.value })} />
            </Field>
          </div>
        </div>
      ),
    } satisfies FlowStep] : []),
    ...(d.kind === 'habit' ? [{
      id: 'habit',
      title: 'Which habit?',
      hint: 'Counted automatically from your check-ins and workouts.',
      valid: d.templateKey !== '' && d.target.trim() !== '',
      render: (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {snap.templates.map((t) => (
            <ChoiceTile key={t.key} label={t.label} description={t.measuredAs} selected={d.templateKey === t.key}
              onClick={() => setDraft({ templateKey: t.key, target: String(t.targetDefault) })} />
          ))}
          {template && (
            <Field label="Target" hint={template.measuredAs}>
              <TextInput type="number" inputMode="numeric" value={d.target} onChange={(e) => setDraft({ target: e.target.value })} />
            </Field>
          )}
        </div>
      ),
    } satisfies FlowStep] : []),
    {
      id: 'finish',
      title: d.kind === 'custom' ? "What's the goal?" : 'Name it, and pick a date',
      hint: d.kind === 'custom' ? 'In your own words — "Run a 5k", "Do a full pull-up".' : 'The date is optional. With one, the app tells you whether you are on pace.',
      valid: (d.title || suggestedTitle()).trim() !== '',
      render: (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <Field label="Goal">
            <TextInput value={d.title || suggestedTitle()} maxLength={60} placeholder="e.g. Run a 5k"
              onChange={(e) => setDraft({ title: e.target.value })} />
          </Field>
          <DeadlinePicker value={d.deadline} onChange={(v) => setDraft({ deadline: v })} />
        </div>
      ),
    },
  ];

  const create = async () => {
    if (!memberId || !d.kind) return;
    const title = (d.title || suggestedTitle()).trim();
    if (!title) return toast.error('Give the goal a name');
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    setSaving(true);
    try {
      await addGoal(memberId, {
        kind: d.kind, title,
        metric: d.kind === 'body' ? d.metric : undefined,
        exerciseId: d.kind === 'strength' ? d.exerciseId : undefined,
        templateKey: d.kind === 'habit' ? d.templateKey : undefined,
        startValue: d.kind === 'body' ? num(d.start || String(snap.latestBody[d.metric] ?? '')) : d.kind === 'strength' ? num(d.start) : null,
        targetValue: d.kind === 'custom' ? null : num(d.target),
        deadline: d.deadline || null,
      });
      toast.success('Goal set');
      setCreating(false);
      await load(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that goal'));
    } finally {
      setSaving(false);
    }
  };

  // ── Edit / remove / done ──
  const openEdit = (g: GoalView) => {
    setEditing(g);
    setEdit({ title: g.title, target: g.targetValue != null ? String(g.targetValue) : '', deadline: g.deadline ?? '' });
  };
  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await editGoal(editing.id, {
        title: edit.title.trim() || editing.title,
        targetValue: editing.kind === 'custom' ? null : edit.target.trim() === '' ? null : Number(edit.target),
        deadline: edit.deadline || null,
      });
      toast.success('Goal updated');
      setEditing(null);
      await load(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that change'));
    } finally {
      setSaving(false);
    }
  };
  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await removeGoal(removing.id);
      setRemoving(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove that goal'));
    }
  };
  const done1 = async (g: GoalView) => {
    try {
      await markCustomDone(g.id);
      toast.success('Nicely done');
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update that goal'));
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stack)' }}>
      <StepFlow open={creating} title="New goal" steps={steps} submitLabel="Set goal" saving={saving}
        onClose={() => setCreating(false)} onSubmit={create} />

      {/* ── The goal that leads ── */}
      {focus ? (
        <Panel glow={focus.pace === 'behind' ? 'action' : 'structure'}>
          <Eyebrow tone={focus.pace === 'behind' ? 'action' : undefined}>
            {focus.overdue && focus.deadline ? `Past its date · ${shortDay(focus.deadline)}`
              : focus.deadline ? `Up next · by ${shortDay(focus.deadline)}` : 'Your main goal'}
          </Eyebrow>
          <div className="flex items-center" style={{ gap: 16, marginTop: 12 }}>
            <Ring pct={focus.pct}>
              {focus.pct != null ? (
                <div>
                  <p style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--color-text-primary)' }}>{focus.pct}%</p>
                  <p style={{ fontSize: 11, marginTop: 3, color: 'var(--color-text-muted)' }}>there</p>
                </div>
              ) : (
                <span style={{ color: 'var(--color-primary-300)' }}>{KIND_ICON[focus.kind](26)}</span>
              )}
            </Ring>
            <div className="min-w-0">
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{focus.subject}</p>
              <p className="break-words" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25, marginTop: 2, color: 'var(--color-text-primary)' }}>{focus.title}</p>
              <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-secondary)' }}>
                {remainingLine(focus) ?? (focus.kind === 'custom' ? 'You mark this one done.' : 'Waiting for your first number.')}
              </p>
              {focus.pace && (
                <div style={{ marginTop: 8 }}><StatusPill label={PACE[focus.pace].label} tone={PACE[focus.pace].tone} /></div>
              )}
            </div>
          </div>
          {focus.projected && (
            <p style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
              <Sparkle size={13} style={{ color: 'var(--color-secondary)', display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              At your current rate you'll get there around <strong style={{ color: 'var(--color-text-primary)' }}>{focus.projected}</strong>.
            </p>
          )}
          <div className="flex items-center" style={{ gap: 16, marginTop: 14, fontSize: 12.5 }}>
            {focus.kind === 'custom' && (
              <button onClick={() => done1(focus)} className="inline-flex items-center" style={{ gap: 5, color: 'var(--color-secondary)' }}>
                <Check size={14} weight="bold" /> Mark done
              </button>
            )}
            <button onClick={() => openEdit(focus)} className="inline-flex items-center" style={{ gap: 5, color: 'var(--color-primary-300)' }}>
              <PencilSimple size={14} /> Edit
            </button>
            <button onClick={() => setRemoving(focus)} className="inline-flex items-center ml-auto" style={{ gap: 5, color: 'var(--color-text-muted)' }}>
              <Trash size={14} /> Remove
            </button>
          </div>
        </Panel>
      ) : (
        <Panel glow="structure">
          <Eyebrow>No goal in play</Eyebrow>
          <p style={{ fontSize: 17, fontWeight: 700, marginTop: 8, color: 'var(--color-text-primary)' }}>Give your training a target</p>
          <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            A weight to reach, a lift to hit, or a habit to build. It tracks itself from what you already log,
            tells you if you are on pace, and earns {pointsWord(gymApp, true)} when you get there.
          </p>
        </Panel>
      )}

      {snap.goals.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <InlineStat value={active.length} label="in progress" />
          <InlineStat value={paced.length ? `${onTrack}/${paced.length}` : '—'} label="on pace" />
          <InlineStat value={done.length} label="reached" />
        </div>
      )}

      <NocButton variant="action" className="w-full" icon={<Plus size={16} weight="bold" />} onClick={openCreate}>
        New goal
      </NocButton>

      {others.length > 0 && (
        <section className="flex flex-col noc-rows" style={{ gap: 10 }}>
          {others.map((g) => (
            <GoalCard key={g.id} g={g} onEdit={openEdit} onRemove={setRemoving} onDone={done1} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <Disclosure title="Reached" meta={`${done.length}`} icon={<Trophy size={17} weight="duotone" />}>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {done.map((g) => <GoalCard key={g.id} g={g} onEdit={openEdit} onRemove={setRemoving} onDone={done1} />)}
          </div>
        </Disclosure>
      )}

      <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
        Body, lift and habit goals complete themselves when your numbers get there, and earn {pointsWord(gymApp, true)}. A goal in
        your own words is yours to tick.
      </p>

      {/* ── Edit ── */}
      <GlassSheet open={editing !== null} onClose={() => setEditing(null)} title="Edit goal"
        subtitle={editing?.subject}
        footer={<NocButton variant="fill" className="w-full" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</NocButton>}>
        {editing && (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <Field label="Goal">
              <TextInput value={edit.title} maxLength={60} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            {editing.kind !== 'custom' && (
              <Field label={`Target${editing.unit ? ` (${editing.unit})` : ''}`}>
                <TextInput type="number" inputMode="decimal" value={edit.target} onChange={(e) => setEdit({ ...edit, target: e.target.value })} />
              </Field>
            )}
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Deadline</p>
            <DeadlinePicker value={edit.deadline} onChange={(v) => setEdit({ ...edit, deadline: v })} />
          </div>
        )}
      </GlassSheet>

      <Modal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this goal"
        subtitle={removing ? `"${removing.title}" and its progress will be gone.` : undefined}
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => void confirmRemove()}
      >
        <span />
      </Modal>
    </div>
  );
}
