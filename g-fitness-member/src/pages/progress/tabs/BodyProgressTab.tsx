import BodyMap, { type BodyMapData, type BodyRegionKey } from '../../../components/ui/BodyMap';
import { Field, TextInput } from '../../../components/ui/Field';
import StepFlow, { BigNumberInput, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState, useRef } from 'react';
import { Plus, ClockCounterClockwise } from '@phosphor-icons/react';
import { Chip, Eyebrow, InlineStat, LineRow, NocButton, SectionHead } from '../../../components/ui/noc';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
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
    <div className="flex flex-col" style={{ gap: 'var(--stack)' }}>
      {/* The body first: it is what this tab is opened to look at. The map is
          drawn whether or not anything has been logged — an outlined figure
          saying "tap a muscle" is a better empty state than a generic icon, and
          it shows what the reward for logging looks like. */}
      <BodyMap
        data={mapData}
        focus={focus}
        onLogRegion={(region) => {
          setStartStep(REGION_STEP[region]);
          setShowForm(true);
        }}
        // The catalogue is loaded once for the whole tab and filtered per
        // region here — see utils/regionMuscles.ts for why the two
        // vocabularies do not line up.
        exercisesFor={(region) => {
          const groups = REGION_MUSCLE_GROUPS[region];
          return exercises.filter((e) => groups.includes(e.muscleGroup)).slice(0, 8);
        }}
        trainingNoteFor={(region) => REGION_TRAINING_NOTE[region]}
      />

      <StepFlow
        open={showForm}
        title="Log a reading"
        steps={steps}
        submitLabel="Save reading"
        saving={saving}
        initialStepId={startStep}
        onClose={() => setShowForm(false)}
        onSubmit={save}
      />

      {/* What the member is training for. Here rather than in Settings because
          this is the screen whose numbers it reinterprets — the map reads it to
          say whether a change is the one being trained for. Tapping the current
          choice clears it: "not stated" has to stay reachable, or a mis-tap is
          permanent. */}
      <section>
        <Eyebrow>Right now I'm</Eyebrow>
        <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10 }}>
          {(['bulking', 'cutting', 'maintaining'] as TrainingFocus[]).map((f) => (
            <Chip
              key={f}
              label={FOCUS_LABEL[f]}
              on={focus === f}
              onClick={async () => {
                const next = focus === f ? null : f;
                const previous = focus;
                setFocus(next);
                try {
                  await setTrainingFocus(memberId, next);
                } catch (err) {
                  setFocus(previous);
                  toast.error(errorMessage(err, 'Could not save that'));
                }
              }}
            />
          ))}
        </div>
        <p style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          {focus
            ? FOCUS_BLURB[focus]
            : 'Tell us and the map will say whether a change is the one you are training for.'}
        </p>
      </section>

      <NocButton variant="action" icon={<Plus size={15} />}
        onClick={() => { setStartStep(undefined); setShowForm(true); }}>
        Log a full reading
      </NocButton>

      {!latest ? (
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          No measurements yet. Tap a body part above to log it. Nothing is shared with a trainer unless you allow it.
        </p>
      ) : (
        <section>
          <div className="rule" style={{ marginBottom: 14 }} />
          <SectionHead
            title="Latest reading"
            meta={new Date(`${latest.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          />

          {latestBmi != null && (
            <div className="flex items-end justify-between" style={{ gap: 12, marginTop: 12 }}>
              <InlineStat value={latestBmi} label="BMI" />
              <span style={{ fontSize: 12.5, color: bmiColor(latestBmi) }}>{bmiLabel(latestBmi)}</span>
            </div>
          )}
          {latestBmi != null && (
            <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>
              A general indicator only — it does not tell muscle from fat.
            </p>
          )}

          <div style={{ marginTop: 8 }}>
            {FIELDS.filter((f) => latest[f.key] != null).map((f, i, shown) => {
              const change = delta(latest[f.key], previous ? previous[f.key] : null);
              return (
                <LineRow
                  key={f.key}
                  title={f.label}
                  meta={change == null ? undefined : change === 0 ? 'No change' : `${change > 0 ? '+' : ''}${change} ${f.unit} since the last reading`}
                  action={<span style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>{latest[f.key]} {f.unit}</span>}
                  last={i === shown.length - 1}
                />
              );
            })}
          </div>

          {/* Every reading ever taken, behind a control. The rows above answer
              the question this tab is opened for; the full list only grows. */}
          {entries.length > 1 && (
            <>
              <NocButton variant="ghost" className="w-full" style={{ marginTop: 16 }}
                icon={<ClockCounterClockwise size={15} />}
                onClick={() => setShowHistory((v) => !v)}>
                {showHistory ? 'Hide history' : `Show all ${entries.length} readings`}
              </NocButton>
              {showHistory && (
                <div style={{ marginTop: 8 }}>
                  {[...entries].reverse().map((e, i, all) => (
                    <LineRow
                      key={e.id}
                      gutterWidth={60}
                      gutter={new Date(`${e.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      title={e.weight != null ? `${e.weight} kg` : 'No weight logged'}
                      meta={e.bodyFatPct != null ? `${e.bodyFatPct}% body fat` : undefined}
                      last={i === all.length - 1}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
