import { panelStyle } from '../../../components/ui/Card';
import BodyMap, { type BodyMapData, type BodyRegionKey } from '../../../components/ui/BodyMap';
import { Field, TextInput } from '../../../components/ui/Field';
import StepFlow, { BigNumberInput, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Plus, TrendingDown, TrendingUp, Minus, ChevronDown, History } from 'lucide-react';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import { toast } from '../../../components/ui/Toast';
import { errorMessage } from '../../../utils/errorMessage';
import {
  progressService, getTrainingFocus, setTrainingFocus,
  calcBmi, bmiLabel, bmiColor, type BodyProgressEntry,
} from '../../../services/progressService';
import {
  FOCUS_LABEL, FOCUS_BLURB, type TrainingFocus,
} from '../../../utils/trainingFocus';
import { readCache, writeCache } from '../../../lib/pageCache';
import { listExercises, type Exercise } from '../../../lib/api/workoutSets';
import { REGION_MUSCLE_GROUPS, REGION_TRAINING_NOTE } from '../../../utils/regionMuscles';

/**
 * Body measurements, from `body_measurements` (migration 0020).
 *
 * Every field is optional. A member who only ever weighs themselves gets a
 * weight chart and blank measurements — not zeroes, which would read as "0 cm"
 * and drag any trend line to the floor.
 */

const FIELDS = [
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'height', label: 'Height', unit: 'cm' },
  { key: 'bodyFatPct', label: 'Body fat', unit: '%' },
  { key: 'neck', label: 'Neck', unit: 'cm' },
  { key: 'shoulders', label: 'Shoulders', unit: 'cm' },
  { key: 'chest', label: 'Chest', unit: 'cm' },
  { key: 'arms', label: 'Upper arms', unit: 'cm' },
  { key: 'forearms', label: 'Forearms', unit: 'cm' },
  { key: 'waist', label: 'Waist', unit: 'cm' },
  { key: 'hips', label: 'Hips', unit: 'cm' },
  { key: 'legs', label: 'Thighs', unit: 'cm' },
  { key: 'calves', label: 'Calves', unit: 'cm' },
] as const;

type FieldKey = typeof FIELDS[number]['key'];

/**
 * Which step of the logging flow each muscle group sends you to.
 *
 * Grouped by where the tape goes, not by anatomy: neck and shoulders are one
 * reach, the two arm sites another, torso another, legs another. The map only
 * ever opens a step that contains the site behind the muscle you tapped.
 */
const REGION_STEP: Record<BodyRegionKey, string> = {
  neck: 'upperbody', shoulders: 'upperbody', chest: 'torso',
  arms: 'arms', forearms: 'arms',
  core: 'torso', hips: 'torso',
  thighs: 'legs', calves: 'legs',
};

/** Blank means "not measured" and must reach the database as NULL — `Number('')`
 *  is 0, which would store a real and alarming zero. */
function num(v: string): number | null {
  return v.trim() === '' ? null : Number(v);
}

/** Change between two readings, or null when either is missing. */
function delta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return Number((current - previous).toFixed(1));
}

/**
 * The last two readings that actually exist for one measurement.
 *
 * Not `entries[len-1]` and `entries[len-2]`: every field is independently
 * optional, so a member who logged only their weight yesterday would blank out
 * a chest reading they took last week and lose the comparison. Walks back over
 * the nulls instead.
 */
type MeasuredKey = 'neck' | 'shoulders' | 'chest' | 'arms' | 'forearms'
  | 'waist' | 'hips' | 'legs' | 'calves';

function lastTwo(
  entries: BodyProgressEntry[], key: MeasuredKey
): { latest: number | null; previous: number | null } {
  const seen: number[] = [];
  for (let i = entries.length - 1; i >= 0 && seen.length < 2; i--) {
    const v = entries[i][key];
    if (v != null) seen.push(v);
  }
  return { latest: seen[0] ?? null, previous: seen[1] ?? null };
}

function Trend({ value, unit }: { value: number | null; unit: string }) {
  if (value == null) return null;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className="text-xs flex items-center gap-0.5" style={{ color: 'var(--color-text-muted)' }}>
      <Icon size={10} />
      {value > 0 ? '+' : ''}{value} {unit}
    </span>
  );
}

/** Progress is a bottom-nav tab and this is the tab it opens on. */
const CACHE_KEY = 'member:progress:body';

export default function BodyProgressTab() {
  const memberId = useMemberId();
  const cached = readCache<BodyProgressEntry[]>(CACHE_KEY);
  const [entries, setEntries] = useState<BodyProgressEntry[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === undefined);
  const [showForm, setShowForm] = useState(false);
  /**
   * Which step the flow opens on.
   *
   * The button above the card starts at the beginning; a tap on the body map
   * starts at the part that was tapped. Both regions of a step share it — chest
   * and arms are one screen, so either sends you to `upper`.
   */
  const [startStep, setStartStep] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  /** Bulk / cut / maintain (0044). Null until the member says. */
  const [focus, setFocus] = useState<TrainingFocus | null>(null);
  const navigate = useNavigate();
  /**
   * The gym's exercise catalogue, for the "trains this" list on the body map.
   *
   * Fetched alongside the measurements rather than on tap: the list is small
   * and unchanging, and a request fired when a muscle is tapped would show an
   * empty panel first and fill it in a beat later. A failure leaves it empty,
   * which the panel renders as "nothing catalogued" — wrong but harmless, and
   * the alternative is a body map that will not open.
   */
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const blankForm = (): Record<FieldKey, string> =>
    Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Record<FieldKey, string>;
  const [form, setForm] = useState<Record<FieldKey, string>>(blankForm);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // Independent of the measurements: a focus that fails to load must not
      // blank the readings, and readings that fail must not lose the focus.
      // The catalogue is the same deal — the map still draws without it.
      getTrainingFocus(memberId).then(setFocus).catch(() => undefined);
      listExercises().then(setExercises).catch(() => undefined);
      setEntries(writeCache(CACHE_KEY, await progressService.getBodyProgress(memberId)));
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err, 'Could not load your measurements'));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const revisit = useRef(cached !== undefined);
  // Refetches when the member id resolves. `load` is rebuilt every render and is
  // deliberately not a dependency. (The suppression used to sit *inside* the
  // effect body as a block comment, where `disable-next-line` pointed at the
  // line below and silenced nothing — it has been warning ever since.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(revisit.current); }, [memberId]);

  const save = async () => {
    if (FIELDS.every((f) => form[f.key].trim() === '')) {
      return toast.error('Fill in at least one measurement');
    }
    setSaving(true);
    try {
      await progressService.addBodyProgress(memberId, {
        weight: num(form.weight), height: num(form.height), bodyFatPct: num(form.bodyFatPct),
        chest: num(form.chest), waist: num(form.waist), arms: num(form.arms), legs: num(form.legs),
        neck: num(form.neck), shoulders: num(form.shoulders), forearms: num(form.forearms),
        hips: num(form.hips), calves: num(form.calves),
      });
      toast.success('Measurement saved');
      setShowForm(false);
      setForm(blankForm());
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that measurement'));
    } finally {
      setSaving(false);
    }
  };

  // One question per screen. Every measurement is optional, so no step declares
  // `valid` — each can be skipped, and the save itself is what enforces "at
  // least one". Pairs share a step where they're naturally measured together.
  const set = (key: FieldKey) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const filled = (...keys: FieldKey[]) => keys.some((k) => form[k].trim() !== '');

  // The member's own last reading, offered as a starting point — never filled
  // in for them. Most measurements barely move week to week, so typing a whole
  // number from scratch each time is the wrong default.
  const last = entries.length ? entries[entries.length - 1] : null;
  const seedOf = (key: FieldKey) => (last ? last[key] : null);
  const seedText = (key: FieldKey, unit: string) => {
    const v = seedOf(key);
    return v == null ? undefined : `Last logged ${v} ${unit}`;
  };

  const steps: FlowStep[] = [
    {
      id: 'weight',
      title: 'What do you weigh?',
      hint: 'Skip any step you did not measure — a blank is stored as "not measured", never as zero.',
      answered: filled('weight'),
      render: <BigNumberInput value={form.weight} onChange={set('weight')} unit="kg" step={0.5}
        seed={seedOf('weight')} seedLabel={seedText('weight', 'kg')} autoFocus />,
    },
    {
      id: 'height',
      title: 'How tall are you?',
      hint: 'Only needed once — it is what turns your weight into a BMI.',
      answered: filled('height'),
      render: <BigNumberInput value={form.height} onChange={set('height')} unit="cm"
        seed={seedOf('height')} seedLabel={seedText('height', 'cm')} />,
    },
    {
      id: 'bodyfat',
      title: 'Body fat?',
      hint: 'If a caliper or smart scale gave you a number. Otherwise skip it.',
      answered: filled('bodyFatPct'),
      render: <BigNumberInput value={form.bodyFatPct} onChange={set('bodyFatPct')} unit="%" step={0.5}
        seed={seedOf('bodyFatPct')} seedLabel={seedText('bodyFatPct', '%')} />,
    },
    {
      id: 'upperbody',
      title: 'Neck and shoulders',
      hint: 'Neck below the Adam’s apple, shoulders at their widest with arms relaxed.',
      answered: filled('neck', 'shoulders'),
      render: (
        <div className="space-y-3">
          <Field label="Neck (cm)"><TextInput type="number" inputMode="decimal" value={form.neck} onChange={(e) => set('neck')(e.target.value)} /></Field>
          <Field label="Shoulders (cm)" hint="The one site that is awkward alone — skip it if nobody can help.">
            <TextInput type="number" inputMode="decimal" value={form.shoulders} onChange={(e) => set('shoulders')(e.target.value)} />
          </Field>
        </div>
      ),
    },
    {
      id: 'arms',
      title: 'Arms',
      hint: 'One reading around the upper arm covers biceps and triceps — there is no separate number for each.',
      answered: filled('arms', 'forearms'),
      render: (
        <div className="space-y-3">
          <Field label="Upper arms (cm)"><TextInput type="number" inputMode="decimal" value={form.arms} onChange={(e) => set('arms')(e.target.value)} /></Field>
          <Field label="Forearms (cm)"><TextInput type="number" inputMode="decimal" value={form.forearms} onChange={(e) => set('forearms')(e.target.value)} /></Field>
        </div>
      ),
    },
    {
      id: 'torso',
      title: 'Torso',
      hint: 'Chest at the nipple line, waist at the navel, hips at their widest.',
      answered: filled('chest', 'waist', 'hips'),
      render: (
        <div className="space-y-3">
          <Field label="Chest (cm)"><TextInput type="number" inputMode="decimal" value={form.chest} onChange={(e) => set('chest')(e.target.value)} /></Field>
          <Field label="Waist (cm)"><TextInput type="number" inputMode="decimal" value={form.waist} onChange={(e) => set('waist')(e.target.value)} /></Field>
          <Field label="Hips (cm)"><TextInput type="number" inputMode="decimal" value={form.hips} onChange={(e) => set('hips')(e.target.value)} /></Field>
        </div>
      ),
    },
    {
      id: 'legs',
      title: 'Legs',
      hint: 'Thigh and calf at their widest points, standing.',
      answered: filled('legs', 'calves'),
      render: (
        <div className="space-y-3">
          <Field label="Thighs (cm)"><TextInput type="number" inputMode="decimal" value={form.legs} onChange={(e) => set('legs')(e.target.value)} /></Field>
          <Field label="Calves (cm)"><TextInput type="number" inputMode="decimal" value={form.calves} onChange={(e) => set('calves')(e.target.value)} /></Field>
        </div>
      ),
    },
  ];

  if (loading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-40" /></div>;

  const latest = last;
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;
  const latestBmi = latest ? calcBmi(latest.weight, latest.height) : null;

  // The four circumferences the map can draw. Weight, height and body fat have
  // no place on a body — they are whole-body numbers, and the cards below
  // already carry them.
  const mapData: BodyMapData = {
    neck: lastTwo(entries, 'neck'),
    shoulders: lastTwo(entries, 'shoulders'),
    chest: lastTwo(entries, 'chest'),
    arms: lastTwo(entries, 'arms'),
    forearms: lastTwo(entries, 'forearms'),
    core: lastTwo(entries, 'waist'),
    hips: lastTwo(entries, 'hips'),
    thighs: lastTwo(entries, 'legs'),
    calves: lastTwo(entries, 'calves'),
  };

  return (
    <div className="space-y-4">
      {/* What the member is training for.
          Placed here rather than in Settings because this is the screen whose
          numbers it reinterprets — the body map reads it to say whether a change
          is the one being trained for, and a control that changes what you are
          looking at belongs next to it. */}
      <div className="rounded-2xl p-3" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] mb-2"
          style={{ color: 'var(--color-text-secondary)' }}>
          Right now I'm
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {(['bulking', 'cutting', 'maintaining'] as TrainingFocus[]).map((f) => {
            const on = focus === f;
            return (
              <button
                key={f}
                onClick={async () => {
                  // Tapping the current one clears it — "not stated" has to stay
                  // reachable, or a mis-tap is permanent.
                  const next = on ? null : f;
                  const previous = focus;
                  setFocus(next);
                  try {
                    await setTrainingFocus(memberId, next);
                  } catch (err) {
                    setFocus(previous);
                    toast.error(errorMessage(err, 'Could not save that'));
                  }
                }}
                className="h-9 rounded-full text-xs font-bold"
                style={{
                  background: on ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: on ? '#FFFFFF' : 'var(--color-text-muted)',
                  border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}
              >
                {FOCUS_LABEL[f]}
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {focus
            ? FOCUS_BLURB[focus]
            : 'Tell us and the map will say whether a change is the one you are training for.'}
        </p>
      </div>

      <button onClick={() => { setStartStep(undefined); setShowForm(true); }}
        className="w-full py-2.5 rounded-full text-sm font-semibold text-black flex items-center justify-center gap-2"
        style={{ background: 'var(--color-secondary)' }}>
        <Plus size={15} /> Log a measurement
      </button>

      <StepFlow
        open={showForm}
        title="Log a measurement"
        steps={steps}
        submitLabel="Save measurement"
        saving={saving}
        initialStepId={startStep}
        onClose={() => setShowForm(false)}
        onSubmit={save}
      />

      {/* The map is drawn whether or not anything has been logged — an outlined
          figure saying "log one to light this up" is a better empty state than
          a generic icon, and it shows what the reward for logging looks like. */}
      <div className="rounded-2xl p-4"
        style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] mb-2"
          style={{ color: 'var(--color-text-secondary)' }}>
          Your measurements
        </p>
        <BodyMap
          data={mapData}
          focus={focus}
          onLogRegion={(region) => {
            setStartStep(REGION_STEP[region]);
            setShowForm(true);
          }}
          // Tapping a muscle now answers "what do I do about it?" as well as
          // "how big is it?". The catalogue is loaded once for the whole tab
          // and filtered per region here — see utils/regionMuscles.ts for why
          // the two vocabularies do not line up.
          exercisesFor={(region) => {
            const groups = REGION_MUSCLE_GROUPS[region];
            return exercises
              .filter((e) => groups.includes(e.muscleGroup))
              .slice(0, 8);
          }}
          trainingNoteFor={(region) => REGION_TRAINING_NOTE[region]}
          onTrainRegion={() => navigate('/member/track')}
        />
      </div>

      {!latest ? (
        <EmptyState icon={Activity} title="No measurements yet"
          message="Tap a body part above to log it, or use the button at the top. Nothing is shared without your trainer asking." />
      ) : (
        <>
          {latestBmi != null && (
            <div className="rounded-2xl p-4" style={panelStyle}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>BMI</p>
                  <p className="text-3xl font-bold text-white">{latestBmi}</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: 'var(--color-bg)', color: bmiColor(latestBmi) }}>
                  {bmiLabel(latestBmi)}
                </span>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                A general indicator only — it doesn't distinguish muscle from fat.
              </p>
            </div>
          )}

          <div className="rounded-2xl p-4 space-y-2" style={panelStyle}>
            <p className="text-xs font-semibold text-white mb-1">
              Latest · {new Date(`${latest.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            {FIELDS.map((f) => {
              const value = latest[f.key];
              if (value == null) return null;
              return (
                <div key={f.key} className="flex items-center justify-between py-1"
                  style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{f.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{value} {f.unit}</span>
                    <Trend value={delta(value, previous ? previous[f.key] : null)} unit={f.unit} />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Every reading ever taken, behind a button.
              The card above already says what the latest one was and how it
              moved, which is the question this tab is opened to answer. The
              full list only grows, and on a member who has logged for a year it
              is the last thing on the screen and the longest. */}
          {entries.length > 1 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="w-full py-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
              >
                <History size={14} />
                {showHistory
                  ? 'Hide history'
                  : `Show all ${entries.length} readings`}
                <ChevronDown size={14} style={{
                  transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 150ms',
                }} />
              </button>
              {showHistory && (
                <div className="space-y-2">
                  {[...entries].reverse().map((e) => (
                    <div key={e.id} className="rounded-xl p-3 flex items-center justify-between" style={panelStyle}>
                      <span className="text-xs text-white">
                        {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {e.weight != null ? `${e.weight} kg` : '—'}
                        {e.bodyFatPct != null && ` · ${e.bodyFatPct}% fat`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}