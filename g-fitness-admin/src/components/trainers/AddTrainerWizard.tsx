import { useEffect, useState } from 'react';
import { Check, KeyRound, ShieldCheck } from 'lucide-react';
import StepModal, { StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import Button from '../ui/Button';
import { createTrainer, updateTrainerProfile } from '../../lib/api/trainers';
import { isEmailTaken, isPhoneTaken } from '../../lib/api/members';
import { showToast } from '../../utils/toast';
import { myLogin, suggestUsername, usernameAvailable, usernameShape, USERNAME_HINT } from '../../lib/api/logins';
import LoginSlip from '../LoginSlip';
import { CoachSection, DaysSection, WhoSection } from './TrainerFields';
import { TRAINER_STEPS, certsOf, draftErrors, emptyDraft, yearsOf, type TrainerDraft } from './trainerDraft';

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ name: string; email: string | null; username: string | null; password: string | null } | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [d, setD] = useState<TrainerDraft>(emptyDraft);
  // 0236: no typed password — a one-time one is made and shown on the login slip.
  const [login, setLogin] = useState({ email: '', username: '' });
  const [usernamesOn, setUsernamesOn] = useState(false);
  useEffect(() => { void myLogin().then((l) => setUsernamesOn(l !== null)); }, []);
  const set = <K extends keyof TrainerDraft>(k: K, v: TrainerDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const check = async () => {
    const e: Record<string, string> = step < 2 ? draftErrors(d, step as 0 | 1) : {};
    if (step === 0 && !e.phone && d.phone.trim() && await isPhoneTaken(d.phone)) e.phone = 'Another account already uses this number.';
    if (step === 3) {
      const em = login.email.trim();
      if (!em && !login.username.trim()) e.email = usernamesOn ? 'Give an email or a username — they sign in with it.' : 'They sign in with this.';
      else if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) e.email = 'That is not an email address.';
      else if (em && await isEmailTaken(em)) e.email = 'This email already has an account.';
      if (login.username.trim()) {
        const why = usernameShape(login.username) ?? await usernameAvailable(login.username).catch(() => null);
        if (why) e.username = why;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const create = async () => {
    setBusy(true);
    try {
      const created = await createTrainer({
        email: login.email.trim(), username: login.username.trim() || undefined, firstName: d.firstName.trim(), lastName: d.lastName.trim(),
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
      setDone({ name: `${d.firstName.trim()} ${d.lastName.trim()}`, email: created.email ?? null, username: created.username ?? null, password: created.password ?? null });
      setSlipOpen(true);
      await onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add the trainer', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <StepModal title={`${done.name} is on the team`} steps={TRAINER_STEPS} step={TRAINER_STEPS.length - 1} onStep={() => undefined} canNext={false}
        onNext={() => undefined} onBack={() => undefined} onClose={onClose} finishLabel="" hideNav>
        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--color-primary-light)' }}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary)' }}><Check size={18} color="#fff" /></span>
          <p className="text-sm text-white">Their coach account is ready.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setSlipOpen(true)} data-show-slip><KeyRound size={13} /> Show the login slip</Button>
        <div className="rounded-xl p-3 text-xs flex gap-2" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
          <ShieldCheck size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
          <span>For the <b className="text-white">verified</b> mark on their profile, they upload each certificate in the app (Profile → Edit profile → Certificates) and you check it under Trainers → Credentials.
            Until then members read their certifications as the coach&rsquo;s own words.</span>
        </div>
        <Button variant="secondary" className="w-full" onClick={onClose}>Done</Button>
        {slipOpen && (
          <LoginSlip name={done.name} role="trainer" username={done.username} email={done.email} password={done.password}
            emailed={null} onClose={() => setSlipOpen(false)} />
        )}
      </StepModal>
    );
  }

  const ready = step === 0 ? !!d.firstName.trim() && !!d.lastName.trim() : step === 1 ? !!d.specialization.trim()
    : step === 3 ? !!login.email.trim() || !!login.username.trim() : true;

  return (
    <StepModal title="Add a trainer" subtitle="A coach account for the app — they run classes, sessions and rooms from their phone"
      steps={TRAINER_STEPS} step={step} onStep={setStep} canNext={ready}
      onNext={() => void (async () => {
        if (!(await check())) return;
        if (step < TRAINER_STEPS.length - 1) {
          // A first suggestion for the username, from their name — the owner can change or clear it.
          if (step === 2 && usernamesOn && !login.username) setLogin((l) => ({ ...l, username: suggestUsername(d.firstName, d.lastName) }));
          setStep(step + 1);
        } else await create();
      })()}
      onBack={() => setStep(step - 1)} onClose={onClose} finishLabel="Add trainer" busy={busy}>
      {step === 0 && <WhoSection d={d} set={set} errors={errors} autoFocus />}
      {step === 1 && <CoachSection d={d} set={set} errors={errors} />}
      {step === 2 && <DaysSection d={d} set={set} />}
      {step === 3 && (<>
        <StepField label={usernamesOn ? 'Email (optional with a username)' : 'Email'} hint="They sign in with this, choosing Trainer on the sign-in screen." error={errors.email}>
          <input autoFocus type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} aria-label="Email" placeholder="coach@email.com" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
        </StepField>
        {usernamesOn && (
          <StepField label={login.email.trim() ? 'Username (optional)' : 'Username'} hint={`${USERNAME_HINT}. They sign in with their email or this.`} error={errors.username}>
            <input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} aria-label="Username"
              placeholder="e.g. coach.rae" autoCapitalize="off" spellCheck={false} className={`${STEP_INPUT} font-mono`} style={STEP_INPUT_STYLE} />
          </StepField>
        )}
        <p className="text-xs flex items-start gap-2 rounded-lg p-2.5" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
          <KeyRound size={14} className="flex-none mt-0.5" />
          A one-time password is made for them and shown on a login slip. At their first sign-in they choose their own. Or invite them from Invitations to have it emailed.
        </p>
      </>)}
    </StepModal>
  );
}
