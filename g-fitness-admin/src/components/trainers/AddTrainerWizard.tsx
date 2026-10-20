import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react';
import StepModal, { StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import Button from '../ui/Button';
import { createTrainer, updateTrainerProfile } from '../../lib/api/trainers';
import { isEmailTaken, isPhoneTaken } from '../../lib/api/members';
import { showToast } from '../../utils/toast';
import { CoachSection, DaysSection, WhoSection } from './TrainerFields';
import { TRAINER_STEPS, certsOf, draftErrors, emptyDraft, yearsOf, type TrainerDraft } from './trainerDraft';

function readablePassword(): string {
  const words = ['Lift', 'Core', 'Coach', 'Drive', 'Steady', 'Power', 'Climb', 'Sprint', 'Focus', 'Form'];
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${words[r[0] % words.length]}-${String(1000 + (r[1] % 9000))}-${words[r[2] % words.length].toLowerCase()}`;
}

/**
 * People → Trainers → Add trainer (2026-10-04), in steps: who, what they coach
 * (picked, so "Find your coach" can match them — the live line says where
 * members will find them), the days they coach, and the login. The first three
 * are TrainerFields — the very sections Edit shows (2026-10-20), so adding and
 * editing ask the same things the same way. Certifications typed here are the
 * coach's own statement; the verified mark comes only from a certificate the
 * coach uploads and the owner checks under Credentials, and the done screen
 * says so.
 */
export default function AddTrainerWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [d, setD] = useState<TrainerDraft>(emptyDraft);
  const [login, setLogin] = useState({ email: '', password: readablePassword() });
  const set = <K extends keyof TrainerDraft>(k: K, v: TrainerDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const check = async () => {
    const e: Record<string, string> = step < 2 ? draftErrors(d, step as 0 | 1) : {};
    if (step === 0 && !e.phone && d.phone.trim() && await isPhoneTaken(d.phone)) e.phone = 'Another account already uses this number.';
    if (step === 3) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login.email.trim())) e.email = 'They sign in with this.';
      else if (await isEmailTaken(login.email)) e.email = 'This email already has an account.';
      if (login.password.length < 8) e.password = 'At least 8 characters.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const create = async () => {
    setBusy(true);
    try {
      const created = await createTrainer({
        email: login.email.trim(), password: login.password, firstName: d.firstName.trim(), lastName: d.lastName.trim(),
        phone: d.phone.trim() || undefined, specialization: d.specialization.trim(), bio: d.bio.trim() || undefined,
        availability: d.days.join(', ') || undefined,
      });
      // The function takes the basics; the rest is the profile row's own columns.
      const certifications = certsOf(d);
      if (d.years || d.focus.length || certifications.length || d.achievements.trim()) {
        await updateTrainerProfile(created.id, {
          years_experience: yearsOf(d),
          focus_areas: d.focus.length ? d.focus : null,
          certifications: certifications.length ? certifications : null,
          achievements: d.achievements.trim() || null,
        }).catch(() => showToast('They were added, but their coaching details did not save — add them with Edit.', 'error'));
      }
      setDone({ name: `${d.firstName.trim()} ${d.lastName.trim()}`, email: login.email.trim(), password: login.password });
      await onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add the trainer', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const text = `Your Core Fitness coach login\nEmail: ${done.email}\nPassword: ${done.password}\nSign in as Trainer: https://corefitness-gym.vercel.app/login?as=trainer`;
    return (
      <StepModal title={`${done.name} is on the team`} steps={TRAINER_STEPS} step={TRAINER_STEPS.length - 1} onStep={() => undefined} canNext={false}
        onNext={() => undefined} onBack={() => undefined} onClose={onClose} finishLabel="" hideNav>
        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--color-primary-light)' }}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary)' }}><Check size={18} color="#fff" /></span>
          <p className="text-sm text-white">Their coach account is ready.</p>
        </div>
        <pre className="text-xs rounded-lg p-3 whitespace-pre-wrap" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>{text}</pre>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}><Copy size={13} /> {copied ? 'Copied' : 'Copy to send them'}</Button>
        <div className="rounded-xl p-3 text-xs flex gap-2" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
          <ShieldCheck size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
          <span>For the <b className="text-white">verified</b> mark on their profile, they upload each certificate in the app (Profile → Edit profile → Certificates) and you check it under Trainers → Credentials.
            Until then members read their certifications as the coach&rsquo;s own words.</span>
        </div>
        <Button variant="secondary" className="w-full" onClick={onClose}>Done</Button>
      </StepModal>
    );
  }

  const ready = step === 0 ? !!d.firstName.trim() && !!d.lastName.trim() : step === 1 ? !!d.specialization.trim()
    : step === 3 ? !!login.email.trim() && login.password.length >= 8 : true;

  return (
    <StepModal title="Add a trainer" subtitle="A coach account for the app — they run classes, sessions and rooms from their phone"
      steps={TRAINER_STEPS} step={step} onStep={setStep} canNext={ready}
      onNext={() => void (async () => { if (!(await check())) return; if (step < TRAINER_STEPS.length - 1) setStep(step + 1); else await create(); })()}
      onBack={() => setStep(step - 1)} onClose={onClose} finishLabel="Add trainer" busy={busy}>
      {step === 0 && <WhoSection d={d} set={set} errors={errors} autoFocus />}
      {step === 1 && <CoachSection d={d} set={set} errors={errors} />}
      {step === 2 && <DaysSection d={d} set={set} />}
      {step === 3 && (<>
        <StepField label="Email" hint="They sign in with this, choosing Trainer on the sign-in screen." error={errors.email}>
          <input autoFocus type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} aria-label="Email" placeholder="coach@email.com" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
        </StepField>
        <StepField label="Password" hint="Made for you — you will see it again at the end to hand over. Or invite them from Invitations to have it emailed." error={errors.password}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input type={showPw ? 'text' : 'password'} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} aria-label="Password"
                className={`${STEP_INPUT} pr-9 font-mono`} style={STEP_INPUT_STYLE} />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--color-text-secondary)' }}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button variant="ghost" onClick={() => setLogin({ ...login, password: readablePassword() })}><RefreshCw size={13} /> New one</Button>
          </div>
        </StepField>
      </>)}
    </StepModal>
  );
}
