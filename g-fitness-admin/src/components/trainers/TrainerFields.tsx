import { StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import { goalsFor } from '../../lib/coachGoals';
import { CERTS, DAYS, FOCUS, TITLES, YEAR_PICKS, certsOf, toggle, yearsOf, type TrainerDraft } from './trainerDraft';

/**
 * A coach's details, asked the same way when they are added and when they are
 * edited (the owner's correction, 2026-10-20: Add offered "2–4 years" while Edit
 * took any number, and Edit had fields Add never asked). Both screens draw these
 * three sections from one place, so they cannot drift apart again.
 */

function Chips({ list, picked, onPick, label }: { list: string[]; picked: string[]; onPick: (v: string) => void; label: string }) {
  return (
    <div className="flex gap-1.5 flex-wrap" role="group" aria-label={label}>
      {list.map((v) => {
        const on = picked.includes(v);
        return (
          <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={on} className="h-8 px-3 rounded-full text-xs font-semibold transition-colors"
            style={{ background: on ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: on ? '#fff' : 'var(--color-text-secondary)',
              border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
            {on ? '✓ ' : ''}{v}
          </button>
        );
      })}
    </div>
  );
}

type Set = <K extends keyof TrainerDraft>(k: K, v: TrainerDraft[K]) => void;

/** Section 1 — who they are. */
export function WhoSection({ d, set, errors, autoFocus }: { d: TrainerDraft; set: Set; errors: Record<string, string>; autoFocus?: boolean }) {
  const y = yearsOf(d);
  return (<>
    <div className="grid grid-cols-2 gap-3">
      <StepField label="First name" error={errors.firstName}>
        <input autoFocus={autoFocus} value={d.firstName} onChange={(e) => set('firstName', e.target.value)} aria-label="First name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
      </StepField>
      <StepField label="Last name" error={errors.lastName}>
        <input value={d.lastName} onChange={(e) => set('lastName', e.target.value)} aria-label="Last name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
      </StepField>
    </div>
    <StepField label="Mobile number" hint="Optional — the desk's way to reach them." error={errors.phone}>
      <input value={d.phone} inputMode="tel" placeholder="0917 123 4567" onChange={(e) => set('phone', e.target.value)} aria-label="Mobile number" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
    </StepField>
    <StepField label="Years coaching" hint="Members see “N years coaching” on their profile. Leave it blank rather than guess." error={errors.years}>
      <div className="flex items-center gap-2 flex-wrap" data-years-field>
        <div className="flex items-center rounded-lg overflow-hidden" style={STEP_INPUT_STYLE}>
          <button type="button" aria-label="One year less" onClick={() => set('years', String(Math.max(0, (y ?? 1) - 1)))}
            className="w-9 h-10 grid place-items-center text-white/80 hover:bg-white/5">−</button>
          <input type="number" min={0} max={70} value={d.years} onChange={(e) => set('years', e.target.value)} aria-label="Years coaching"
            placeholder="—" className="w-14 h-10 bg-transparent text-center text-sm text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
          <button type="button" aria-label="One year more" onClick={() => set('years', String(Math.min(70, (y ?? -1) + 1)))}
            className="w-9 h-10 grid place-items-center text-white/80 hover:bg-white/5">+</button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {YEAR_PICKS.map((n) => (
            <button key={n} type="button" onClick={() => set('years', String(n))} aria-pressed={y === n}
              className="h-8 min-w-[34px] px-2 rounded-lg text-xs font-semibold"
              style={{ background: y === n ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: y === n ? '#fff' : 'var(--color-text-secondary)',
                border: `1px solid ${y === n ? 'var(--color-primary)' : 'var(--color-border)'}` }}>{n === 0 ? '<1' : n === 15 ? '15+' : n}</button>
          ))}
          {d.years !== '' && <button type="button" onClick={() => set('years', '')} className="h-8 px-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Clear</button>}
        </div>
      </div>
    </StepField>
  </>);
}

/** Section 2 — what they coach, and where members will find them. */
export function CoachSection({ d, set, errors }: { d: TrainerDraft; set: Set; errors: Record<string, string> }) {
  const found = goalsFor({ specialization: d.specialization, bio: d.bio, achievements: d.achievements || null, focus_areas: d.focus, certifications: certsOf(d) });
  return (<>
    <StepField label="The line under their name" hint="Members see it on the coach list." error={errors.specialization}>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {TITLES.map((t) => (
          <button key={t} type="button" onClick={() => set('specialization', t)} aria-pressed={d.specialization === t} className="h-8 px-3 rounded-full text-xs font-semibold"
            style={{ background: d.specialization === t ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: d.specialization === t ? '#fff' : 'var(--color-text-secondary)',
              border: `1px solid ${d.specialization === t ? 'var(--color-primary)' : 'var(--color-border)'}` }}>{t}</button>
        ))}
      </div>
      <input value={d.specialization} onChange={(e) => set('specialization', e.target.value)} aria-label="Specialization" placeholder="Or type your own" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
    </StepField>
    <StepField label="Trains for" hint="Members pick a goal under Coaches → Find your coach; these decide which goals list them.">
      <Chips label="Trains for" list={[...FOCUS, ...d.focus.filter((x) => !FOCUS.includes(x))]} picked={d.focus} onPick={(v) => set('focus', toggle(d.focus, v))} />
    </StepField>
    <p className="text-[11.5px] rounded-lg px-3 py-2" data-found-under style={{ background: 'var(--color-surface-high)', color: found.length ? 'var(--color-text-secondary)' : 'var(--color-secondary)' }}>
      {found.length ? <>Members will find them under: <b className="text-white">{found.map((g) => g.goal.label).join(', ')}</b></> : 'Not matched to any member goal yet — pick what they train for.'}
    </p>
    <StepField label="Certifications they hold" hint="Their own statement until they upload the certificate and you verify it under Credentials.">
      <Chips label="Certifications" list={CERTS} picked={d.certs} onPick={(v) => set('certs', toggle(d.certs, v))} />
      <input value={d.otherCert} onChange={(e) => set('otherCert', e.target.value)} aria-label="Other certifications" placeholder="Other — separate with commas"
        className={`${STEP_INPUT} mt-2`} style={STEP_INPUT_STYLE} />
    </StepField>
    <StepField label="About them" hint="Members read this on their profile.">
      <textarea value={d.bio} rows={3} onChange={(e) => set('bio', e.target.value)} aria-label="Bio" placeholder="What they are known for, who they love training"
        className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none resize-none" style={STEP_INPUT_STYLE} />
    </StepField>
    <StepField label="Achievements" hint="Optional — competitions, athletic background, notable results.">
      <textarea value={d.achievements} rows={2} onChange={(e) => set('achievements', e.target.value)} aria-label="Achievements"
        className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none resize-none" style={STEP_INPUT_STYLE} />
    </StepField>
  </>);
}

/** Section 3 — the days they coach (display only; bookable hours are theirs to set in the app). */
export function DaysSection({ d, set }: { d: TrainerDraft; set: Set }) {
  const preset = (days: string[], label: string) => (
    <button type="button" onClick={() => set('days', days)} className="h-8 px-3 rounded-lg text-xs font-semibold"
      style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>{label}</button>
  );
  return (
    <StepField label="Days they coach" hint="Shown on their profile. Their hours for 1-on-1 bookings they set in the app, under Bookable hours.">
      <Chips label="Days they coach" list={DAYS} picked={d.days} onPick={(v) => set('days', toggle(d.days, v))} />
      <div className="flex gap-2 mt-2">
        {preset(DAYS.slice(0, 5), 'Weekdays')}{preset(DAYS.slice(0, 6), 'Mon–Sat')}{preset([...DAYS], 'Every day')}{preset([], 'None')}
      </div>
    </StepField>
  );
}
