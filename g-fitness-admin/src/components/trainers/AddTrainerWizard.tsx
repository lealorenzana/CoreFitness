import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react';
import StepModal, { ChipPick, StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import Button from '../ui/Button';
import { createTrainer, updateTrainerProfile } from '../../lib/api/trainers';
import { isEmailTaken, isPhoneTaken } from '../../lib/api/members';
import { goalsFor } from '../../lib/coachGoals';
import { showToast } from '../../utils/toast';

const STEPS = ['Who they are', 'What they coach', 'When they coach', 'Their login'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** "Trains for": the words members' "Find your coach" matches on (lib/coachGoals.ts), so a pick is never a dead label. */
const FOCUS = ['Weight loss', 'HIIT', 'Strength', 'Hypertrophy', 'Powerlifting', 'Calisthenics', 'Mobility', 'Yoga', 'Pilates',
  'Boxing', 'Muay Thai', 'Rehab', 'Low impact', 'Beginner', 'Seniors'];
const TITLES = ['Strength & Conditioning', 'Personal Trainer', 'Group Fitness', 'Boxing Coach', 'Yoga Instructor', 'Rehab & Injury Prevention'];
const CERTS = ['First Aid / CPR', 'NASM-CPT', 'ACE-CPT', 'ISSA', 'TESDA NC II Fitness', 'ACSM'];
const YEARS = [{ value: '', label: 'Not said' }, { value: '1', label: 'Under 2 years' }, { value: '3', label: '2–4 years' }, { value: '6', label: '5–9 years' }, { value: '10', label: '10+ years' }];

function readablePassword(): string {
  const words = ['Lift', 'Core', 'Coach', 'Drive', 'Steady', 'Power', 'Climb', 'Sprint', 'Focus', 'Form'];
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${words[r[0] % words.length]}-${String(1000 + (r[1] % 9000))}-${words[r[2] % words.length].toLowerCase()}`;
}
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Chips({ list, picked, onPick }: { list: string[]; picked: string[]; onPick: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {list.map((v) => {
        const on = picked.includes(v);
        return (
          <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={on} className="h-8 px-3 rounded-full text-xs font-semibold"
            style={{ background: on ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: on ? '#fff' : 'var(--color-text-secondary)',
              border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
            {on ? '✓ ' : ''}{v}
          </button>
        );
      })}
    </div>
  );
}

/**
 * People → Trainers → Add trainer (2026-10-04), in steps: who, what they coach
 * (picked, so "Find your coach" can match them — the live line says where
 * members will find them), the days they coach, and the login. Certifications
 * typed here are the coach's own statement; the verified mark comes only from
 * a certificate the coach uploads and the owner checks under Credentials, and
 * the done screen says so.
 */
export default function AddTrainerWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [f, setF] = useState({
    firstName: '', lastName: '', phone: '', specialization: '', bio: '', years: '',
    focus: [] as string[], certs: [] as string[], otherCert: '', days: [] as string[],
    email: '', password: readablePassword(),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const certifications = [...f.certs, ...f.otherCert.split(',').map((x) => x.trim()).filter(Boolean)];
  const found = goalsFor({ specialization: f.specialization, bio: f.bio, achievements: null, focus_areas: f.focus, certifications });

  const check = async () => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!f.firstName.trim()) e.firstName = 'Required.';
      if (!f.lastName.trim()) e.lastName = 'Required.';
      if (f.phone.trim() && await isPhoneTaken(f.phone)) e.phone = 'Another account already uses this number.';
    }
    if (step === 1 && !f.specialization.trim()) e.specialization = 'The line under their name — pick one or type it.';
    if (step === 3) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'They sign in with this.';
      else if (await isEmailTaken(f.email)) e.email = 'This email already has an account.';
      if (f.password.length < 8) e.password = 'At least 8 characters.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const create = async () => {
    setBusy(true);
    try {
      const created = await createTrainer({
        email: f.email.trim(), password: f.password, firstName: f.firstName.trim(), lastName: f.lastName.trim(),
        phone: f.phone.trim() || undefined, specialization: f.specialization.trim(), bio: f.bio.trim() || undefined,
        availability: f.days.join(', ') || undefined,
      });
      // The function takes the basics; the rest is the profile row's own columns.
      if (f.years || f.focus.length || certifications.length) {
        await updateTrainerProfile(created.id, {
          years_experience: f.years ? Number(f.years) : null,
          focus_areas: f.focus.length ? f.focus : null,
          certifications: certifications.length ? certifications : null,
        }).catch(() => showToast('They were added, but their coaching details did not save — add them with Edit.', 'error'));
      }
      setDone({ name: `${f.firstName.trim()} ${f.lastName.trim()}`, email: f.email.trim(), password: f.password });
      await onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add the trainer', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const login = `Your Core Fitness coach login\nEmail: ${done.email}\nPassword: ${done.password}\nSign in as Trainer: https://corefitness-gym.vercel.app/login`;
    return (
      <StepModal title={`${done.name} is on the team`} steps={STEPS} step={STEPS.length - 1} onStep={() => undefined} canNext={false}
        onNext={() => undefined} onBack={() => undefined} onClose={onClose} finishLabel="" hideNav>
        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--color-primary-light)' }}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary)' }}><Check size={18} color="#fff" /></span>
          <p className="text-sm text-white">Their coach account is ready.</p>
        </div>
        <pre className="text-xs rounded-lg p-3 whitespace-pre-wrap" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>{login}</pre>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(login).then(() => setCopied(true))}><Copy size={13} /> {copied ? 'Copied' : 'Copy to send them'}</Button>
        <div className="rounded-xl p-3 text-xs flex gap-2" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
          <ShieldCheck size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
          <span>For the <b className="text-white">verified</b> mark on their profile, they upload each certificate in the app (Profile → Edit profile → Certificates) and you check it under Credentials.
            Until then members read their certifications as the coach&rsquo;s own words.</span>
        </div>
        <Button variant="secondary" className="w-full" onClick={onClose}>Done</Button>
      </StepModal>
    );
  }

  const ready = step === 0 ? !!f.firstName.trim() && !!f.lastName.trim() : step === 1 ? !!f.specialization.trim()
    : step === 3 ? !!f.email.trim() && f.password.length >= 8 : true;

  return (
    <StepModal title="Add a trainer" subtitle="A coach account for the app — they run classes, sessions and rooms from their phone"
      steps={STEPS} step={step} onStep={setStep} canNext={ready}
      onNext={() => void (async () => { if (!(await check())) return; if (step < STEPS.length - 1) setStep(step + 1); else await create(); })()}
      onBack={() => setStep(step - 1)} onClose={onClose} finishLabel="Add trainer" busy={busy}>
      {step === 0 && (<>
        <div className="grid grid-cols-2 gap-3">
          <StepField label="First name" error={errors.firstName}>
            <input autoFocus value={f.firstName} onChange={(e) => set('firstName', e.target.value)} aria-label="First name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
          </StepField>
          <StepField label="Last name" error={errors.lastName}>
            <input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} aria-label="Last name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
          </StepField>
        </div>
        <StepField label="Mobile number" error={errors.phone}>
          <input value={f.phone} inputMode="tel" placeholder="0917 123 4567" onChange={(e) => set('phone', e.target.value)} aria-label="Mobile number" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
        </StepField>
        <StepField label="Years coaching">
          <ChipPick ariaLabel="Years coaching" value={f.years} options={YEARS} onChange={(v) => set('years', v)} />
        </StepField>
      </>)}

      {step === 1 && (<>
        <StepField label="The line under their name" hint="Members see it on the coach list." error={errors.specialization}>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {TITLES.map((t) => (
              <button key={t} type="button" onClick={() => set('specialization', t)} className="h-8 px-3 rounded-full text-xs font-semibold"
                style={{ background: f.specialization === t ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: f.specialization === t ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${f.specialization === t ? 'var(--color-primary)' : 'var(--color-border)'}` }}>{t}</button>
            ))}
          </div>
          <input value={f.specialization} onChange={(e) => set('specialization', e.target.value)} aria-label="Specialization" placeholder="Or type your own" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
        </StepField>
        <StepField label="Trains for" hint="Members pick a goal under Coaches → Find your coach; these decide which goals list them.">
          <Chips list={FOCUS} picked={f.focus} onPick={(v) => set('focus', toggle(f.focus, v))} />
        </StepField>
        <p className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-high)', color: found.length ? 'var(--color-text-secondary)' : 'var(--color-secondary)' }}>
          {found.length ? <>Members will find them under: <b className="text-white">{found.map((g) => g.goal.label).join(', ')}</b></> : 'Not matched to any member goal yet — pick what they train for.'}
        </p>
        <StepField label="Certifications they hold" hint="Their own statement until they upload the certificate for you to verify.">
          <Chips list={CERTS} picked={f.certs} onPick={(v) => set('certs', toggle(f.certs, v))} />
          <input value={f.otherCert} onChange={(e) => set('otherCert', e.target.value)} aria-label="Other certifications" placeholder="Other — separate with commas"
            className={`${STEP_INPUT} mt-2`} style={STEP_INPUT_STYLE} />
        </StepField>
        <StepField label="About them" hint="Members read this on their profile.">
          <textarea value={f.bio} rows={3} onChange={(e) => set('bio', e.target.value)} aria-label="Bio" placeholder="What they are known for, who they love training"
            className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none resize-none" style={STEP_INPUT_STYLE} />
        </StepField>
      </>)}

      {step === 2 && (
        <StepField label="Days they coach" hint="Shown on their profile. Their hours for 1-on-1 bookings they set in the app, under Bookable hours.">
          <Chips list={DAYS} picked={f.days} onPick={(v) => set('days', toggle(f.days, v))} />
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="ghost" onClick={() => set('days', DAYS.slice(0, 5))}>Weekdays</Button>
            <Button size="sm" variant="ghost" onClick={() => set('days', DAYS.slice(0, 6))}>Mon–Sat</Button>
            <Button size="sm" variant="ghost" onClick={() => set('days', [...DAYS])}>Every day</Button>
          </div>
        </StepField>
      )}

      {step === 3 && (<>
        <StepField label="Email" hint="They sign in with this, choosing Trainer on the sign-in screen." error={errors.email}>
          <input autoFocus type="email" value={f.email} onChange={(e) => set('email', e.target.value)} aria-label="Email" placeholder="coach@email.com" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
        </StepField>
        <StepField label="Password" hint="Made for you — you will see it again at the end to hand over." error={errors.password}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input type={showPw ? 'text' : 'password'} value={f.password} onChange={(e) => set('password', e.target.value)} aria-label="Password"
                className={`${STEP_INPUT} pr-9 font-mono`} style={STEP_INPUT_STYLE} />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--color-text-secondary)' }}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button variant="ghost" onClick={() => set('password', readablePassword())}><RefreshCw size={13} /> New one</Button>
          </div>
        </StepField>
      </>)}
    </StepModal>
  );
}
