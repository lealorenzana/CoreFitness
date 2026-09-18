import BodyMap, { type BodyMapData, type BodyRegionKey } from '../../../components/ui/BodyMap';
import { Field, TextInput } from '../../../components/ui/Field';
import StepFlow, { BigNumberInput, type FlowStep } from '../../../components/ui/StepFlow';
import { useEffect, useState, useRef } from 'react';
import { ClockCounterClockwise, Info, Plus, Ruler } from '@phosphor-icons/react';
import { Chip, Eyebrow, InlineStat, LineRow, NocButton, Panel } from '../../../components/ui/noc';
import Disclosure from '../../../components/ui/Disclosure';
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
  const blankForm = (): Record<FieldKey, string> =>
    Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Record<FieldKey, string>;
  const [form, setForm] = useState<Record<FieldKey, string>>(blankForm);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // Independent of the measurements: a focus that fails to load must not
      // blank the readings, and readings that fail must not lose the focus.
      getTrainingFocus(memberId).then(setFocus).catch(() => undefined);
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

  if (loading) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;

  const latest = last;
  const latestBmi = latest ? calcBmi(latest.weight, latest.height) : null;

  // The whole-body numbers walk back over blanks, like the tape sites: a
  // reading with only a chest measurement must not hide last week's weight.
  const lastOf = (key: 'weight' | 'height' | 'bodyFatPct') => {
    const seen: { value: number; date: string }[] = [];
    for (let i = entries.length - 1; i >= 0 && seen.length < 2; i--) {
      const v = entries[i][key];
      if (v != null) seen.push({ value: v, date: entries[i].date });
    }
    return { latest: seen[0] ?? null, previous: seen[1] ?? null };
  };
  const weight = lastOf('weight');
  const height = lastOf('height');
  const fat = lastOf('bodyFatPct');
  const weightChange = weight.latest && weight.previous
    ? delta(weight.latest.value, weight.previous.value) : null;
  const bmi = weight.latest && height.latest ? calcBmi(weight.latest.value, height.latest.value) : latestBmi;

  const daysSince = latest
    ? Math.max(0, Math.round((new Date().setHours(0, 0, 0, 0) - new Date(`${latest.date}T00:00:00`).getTime()) / 86_400_000))
    : null;

  // The figure's sites. Weight, height and body fat have no place on a body —
  // they are whole-body numbers, and the summary above carries them.
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
  const measuredSites = Object.values(mapData).filter((v) => v.latest != null).length;

  const openLog = (step?: string) => { setStartStep(step); setShowForm(true); };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stack)' }}>
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

      {/* ── The summary: the whole-body numbers, and the one thing to do ──
          The old tab showed these twice (a "latest reading" list repeated
          every site the figure already draws). One panel now carries weight,
          BMI, body fat and height; the figure carries the tape sites. */}
      <Panel glow="structure">
        <Eyebrow>
          {latest
            ? `Latest · ${new Date(`${latest.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : 'No readings yet'}
        </Eyebrow>

        {weight.latest ? (
          <div className="flex items-end justify-between flex-wrap" style={{ gap: 10, marginTop: 8 }}>
            <p className="flex items-baseline" style={{ gap: 6 }}>
              <span style={{
                fontSize: 'var(--text-hero)', fontWeight: 600, lineHeight: 1, letterSpacing: 'var(--tracking-hero)',
                color: 'var(--color-text-primary)',
              }}>{weight.latest.value}</span>
              <span style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>kg</span>
              {/* A weight older than the latest reading says when it is from,
                  rather than borrowing the newer reading's date. */}
              {latest && weight.latest.date !== latest.date && (
                <span style={{ fontSize: 12.5, marginLeft: 4, color: 'var(--color-text-muted)' }}>
                  on {new Date(`${weight.latest.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </p>
            {weightChange != null && (
              <span style={{
                fontSize: 12.5, padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                color: weightChange === 0 ? 'var(--color-text-secondary)' : 'var(--color-primary-300)',
                border: '1px solid var(--color-primary-800)',
              }}>
                {weightChange === 0 ? 'No change' : `${weightChange > 0 ? '+' : '−'}${Math.abs(weightChange)} kg since last`}
              </span>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
            Log your weight and a few measurements to start seeing how your body changes.
          </p>
        )}

        {(bmi != null || fat.latest || height.latest) && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
            <div>
              <InlineStat value={bmi ?? '—'} label="BMI" />
              {bmi != null && <p style={{ fontSize: 12, marginTop: 3, color: bmiColor(bmi) }}>{bmiLabel(bmi)}</p>}
            </div>
            <InlineStat value={fat.latest ? `${fat.latest.value}%` : '—'} label="body fat" />
            <InlineStat value={height.latest ? height.latest.value : '—'} label="height, cm" />
          </div>
        )}

        {daysSince != null && (
          <p style={{ fontSize: 12, marginTop: 14, color: 'var(--color-text-muted)' }}>
            {daysSince === 0 ? 'Measured today.' : `Last measured ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago.`}
            {daysSince >= 14 ? ' Every two weeks is enough to see real change.' : ''}
          </p>
        )}

        <NocButton variant="fill" className="w-full" icon={<Plus size={16} weight="bold" />} style={{ marginTop: 16 }}
          onClick={() => openLog(undefined)}>
          Log a reading
        </NocButton>
      </Panel>

      {/* ── What the member is training for ──
          It reinterprets the figure's changes ("up 2 cm — the direction you are
          training for"), so it sits right above it. Tapping the current choice
          clears it: "not stated" has to stay reachable. */}
      <section>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Training for</p>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
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
          {focus ? FOCUS_BLURB[focus] : 'Pick one and each measurement will say whether it moved the way you want.'}
        </p>
      </section>

      {/* ── The tape sites, on the figure ── */}
      <Disclosure
        title="Measurements"
        meta={`${measuredSites} of 9 measured`}
        icon={<Ruler size={17} weight="duotone" />}
        defaultOpen
      >
        <BodyMap
          data={mapData}
          focus={focus}
          onLogRegion={(region) => openLog(REGION_STEP[region])}
        />
      </Disclosure>

      {/* ── Every reading, newest first ── */}
      {entries.length > 0 && (
        <Disclosure
          title="History"
          meta={`${entries.length} ${entries.length === 1 ? 'reading' : 'readings'}`}
          icon={<ClockCounterClockwise size={17} weight="duotone" />}
        >
          {[...entries].reverse().map((e, i, all) => {
            const values = FIELDS.filter((f) => f.key !== 'weight' && e[f.key] != null)
              .map((f) => `${f.label} ${e[f.key]}${f.unit === '%' ? '%' : ` ${f.unit}`}`);
            return (
              <LineRow
                key={e.id}
                gutterWidth={58}
                gutter={new Date(`${e.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                title={e.weight != null ? `${e.weight} kg` : 'No weight'}
                meta={values.length ? values.join(' · ') : undefined}
                last={i === all.length - 1}
              />
            );
          })}
        </Disclosure>
      )}

      {/* ── How to measure, for a reading that can be compared next time ── */}
      <Disclosure title="How to measure" icon={<Info size={17} weight="duotone" />}>
        <ul className="flex flex-col" style={{ gap: 10, fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          <li><strong style={{ color: 'var(--color-text-primary)' }}>Same time, same way.</strong> Morning, before eating, is easiest to repeat.</li>
          <li><strong style={{ color: 'var(--color-text-primary)' }}>Tape snug, not tight,</strong> and level all the way round.</li>
          <li><strong style={{ color: 'var(--color-text-primary)' }}>Chest</strong> at the nipple line · <strong style={{ color: 'var(--color-text-primary)' }}>waist</strong> at the navel · <strong style={{ color: 'var(--color-text-primary)' }}>hips</strong> at their widest.</li>
          <li><strong style={{ color: 'var(--color-text-primary)' }}>Arms, thighs and calves</strong> at their widest, relaxed.</li>
          <li>Skip anything you did not measure — a blank is saved as "not measured", never as zero.</li>
        </ul>
      </Disclosure>

      <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
        Your measurements stay private. A trainer sees them only if you allow it in Settings.
      </p>
    </div>
  );
}
