import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Eye, EyeOff, RefreshCw, UserPlus } from 'lucide-react';
import StepModal, { ChipPick, StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import PlacePicker from '../ui/PlacePicker';
import DatePicker from '../ui/DatePicker';
import Button from '../ui/Button';
import { createMember, isEmailTaken, isPhoneTaken, updateMemberProfile } from '../../lib/api/members';
import { formatCheckInCode } from '../../utils/checkInCode';
import { showToast } from '../../utils/toast';
import { todayKey } from '../../utils/dates';
import type { MembershipPlanRow } from '../../types/db';

const STEPS = ['Who they are', 'Their login', 'Training and safety', 'Membership'];
const GENDERS = [{ value: '', label: 'Not said' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }];
const LEVELS = [{ value: '', label: 'Not said' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }];
const RELATIONS = ['Parent', 'Spouse', 'Partner', 'Sibling', 'Child', 'Friend', 'Other'];

/** A password someone can read aloud at a desk: Word-1234-word, from the browser's random source. */
function readablePassword(): string {
  const words = ['Lift', 'Core', 'Push', 'Pull', 'Squat', 'Grip', 'Stride', 'Power', 'Steady', 'Climb', 'Sprint', 'Flex'];
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${words[r[0] % words.length]}-${String(1000 + (r[1] % 9000))}-${words[r[2] % words.length].toLowerCase()}`;
}

type Done = { id: string; name: string; email: string; password: string; code: string | null; planName: string | null };

/**
 * People → Members → Add member (2026-10-04), one question at a time: who they
 * are (the address from the Philippine place list), the login you hand them,
 * their training level and emergency contact, and the plan. Known answers are
 * chips, never typed. It ends on what to do next — the first payment is what
 * activates a plan, so that is the button there, and the login can be copied
 * for handing over.
 */
export default function AddMemberWizard({ plans, onClose, onCreated }: {
  plans: MembershipPlanRow[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [copied, setCopied] = useState(false);
  const sellable = plans.filter((p) => p.is_active);
  const [f, setF] = useState({
    firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', gender: '', address: '',
    password: readablePassword(), experienceLevel: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelationship: '',
    planId: sellable[0]?.id ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const check = async (): Promise<boolean> => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!f.firstName.trim()) e.firstName = 'Required.';
      if (!f.lastName.trim()) e.lastName = 'Required.';
      if (f.phone.trim() && await isPhoneTaken(f.phone)) e.phone = 'Another account already uses this number.';
    }
    if (step === 1) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'They sign in with this — type a real address.';
      else if (await isEmailTaken(f.email)) e.email = 'This email already has an account. Search for them under Members instead.';
      if (f.password.length < 8) e.password = 'At least 8 characters.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const create = async () => {
    setBusy(true);
    try {
      const created = await createMember({
        email: f.email.trim(), password: f.password, firstName: f.firstName.trim(), lastName: f.lastName.trim(),
        phone: f.phone.trim() || undefined, address: f.address.trim() || undefined,
        dateOfBirth: f.dateOfBirth || undefined, gender: f.gender || undefined,
        emergencyContactName: f.emergencyContactName.trim() || undefined, emergencyContactPhone: f.emergencyContactPhone.trim() || undefined,
        emergencyContactRelationship: f.emergencyContactRelationship || undefined,
        experienceLevel: f.experienceLevel || undefined, planId: f.planId || undefined,
      });
      // Written again from here: an Edge Function deployed before it learned
      // these two would accept and ignore them (see Members' old form).
      if (f.dateOfBirth || f.gender) {
        await updateMemberProfile(created.id, { date_of_birth: f.dateOfBirth || null, gender: f.gender || null }).catch(() => undefined);
      }
      setDone({ id: created.id, name: `${f.firstName.trim()} ${f.lastName.trim()}`, email: f.email.trim(), password: f.password,
        code: created.id, planName: sellable.find((p) => p.id === f.planId)?.name ?? null });
      await onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add the member', 'error');
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (step < STEPS.length - 1) { if (await check()) setStep(step + 1); return; }
    await create();
  };

  if (done) {
    const login = `Your Core Fitness app login\nEmail: ${done.email}\nPassword: ${done.password}\nGet the app: https://corefitness-gym.vercel.app/get-app`;
    return (
      <StepModal title={`${done.name} is in`} steps={STEPS} step={STEPS.length - 1} onStep={() => undefined} canNext={false}
        onNext={() => undefined} onBack={() => undefined} onClose={onClose} finishLabel="" hideNav>
        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--color-primary-light)' }}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary)' }}><Check size={18} color="#fff" /></span>
          <p className="text-sm text-white">Their account is ready{done.code ? <> — check-in code <b className="tabular-nums">{formatCheckInCode(done.code)}</b></> : ''}.</p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-white">Hand them their login</p>
          <pre className="text-xs rounded-lg p-3 mt-1.5 whitespace-pre-wrap" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>{login}</pre>
          <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => void navigator.clipboard.writeText(login).then(() => setCopied(true))}>
            <Copy size={13} /> {copied ? 'Copied' : 'Copy for a text or Messenger'}
          </Button>
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>They can change it in the app under Settings, or use “Forgot password?” on the sign-in screen.</p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-white">Next</p>
          <ul className="text-xs mt-1 space-y-1 list-disc pl-4" style={{ color: 'var(--color-text-secondary)' }}>
            {done.planName ? <li>{done.planName} is waiting for its first payment — recording it starts the membership.</li> : <li>No plan yet — add one when they pay.</li>}
            <li>If your gym asks for the waiver and health questions, they answer them in the app before they book.</li>
          </ul>
        </div>
        <div className="flex gap-2 pt-1">
          {done.planName && <Button variant="secondary" className="flex-1" onClick={() => navigate(`/payments?record=${done.id}`)}>Record their first payment</Button>}
          <Button variant="ghost" className="flex-1" onClick={onClose}>Done</Button>
        </div>
      </StepModal>
    );
  }

  const ready = step === 0 ? !!f.firstName.trim() && !!f.lastName.trim()
    : step === 1 ? !!f.email.trim() && f.password.length >= 8 : true;

  return (
    <StepModal title="Add a member" subtitle="A walk-in at the desk — they get a real login for the phone app"
      steps={STEPS} step={step} onStep={setStep} canNext={ready} onNext={() => void next()} onBack={() => setStep(step - 1)}
      onClose={onClose} finishLabel="Add member" busy={busy}>
      {step === 0 && (<>
        <div className="grid grid-cols-2 gap-3">
          <StepField label="First name" error={errors.firstName}>
            <input autoFocus value={f.firstName} onChange={(e) => set('firstName', e.target.value)} aria-label="First name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
          </StepField>
          <StepField label="Last name" error={errors.lastName}>
            <input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} aria-label="Last name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
          </StepField>
        </div>
        <StepField label="Mobile number" hint="For reminders and when the desk needs to reach them." error={errors.phone}>
          <input value={f.phone} inputMode="tel" placeholder="0917 123 4567" onChange={(e) => set('phone', e.target.value)} aria-label="Mobile number" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
        </StepField>
        <div className="grid grid-cols-2 gap-3">
          <StepField label="Birthday">
            <DatePicker value={f.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} max={todayKey()} startView="year" placeholder="Pick a date" />
          </StepField>
          <StepField label="Gender">
            <ChipPick ariaLabel="Gender" value={f.gender} options={GENDERS} onChange={(v) => set('gender', v)} />
          </StepField>
        </div>
        <StepField label="Where they live">
          <PlacePicker value={f.address} onChange={(v) => set('address', v)} />
        </StepField>
      </>)}

      {step === 1 && (<>
        <StepField label="Email" hint="They sign in to the app with this." error={errors.email}>
          <input autoFocus type="email" value={f.email} onChange={(e) => set('email', e.target.value)} aria-label="Email" placeholder="name@email.com" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
        </StepField>
        <StepField label="Password" hint="Made for you — easy to read out at the desk. You will see it again at the end to hand over." error={errors.password}>
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

      {step === 2 && (<>
        <StepField label="How much have they trained?" hint="What they say about themselves — it shapes class suggestions, not their earned level.">
          <ChipPick ariaLabel="Experience" value={f.experienceLevel} options={LEVELS} onChange={(v) => set('experienceLevel', v)} />
        </StepField>
        <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--color-surface-high)' }}>
          <p className="text-[12px] font-semibold text-white">Emergency contact <span className="font-normal" style={{ color: 'var(--color-text-secondary)' }}>— optional, and the one blank that matters in a room full of heavy things</span></p>
          <div className="grid grid-cols-2 gap-3">
            <input value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} aria-label="Emergency contact name" placeholder="Name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
            <input value={f.emergencyContactPhone} inputMode="tel" onChange={(e) => set('emergencyContactPhone', e.target.value)} aria-label="Emergency contact phone" placeholder="Mobile number" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
          </div>
          <ChipPick ariaLabel="Relationship" value={f.emergencyContactRelationship}
            options={RELATIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => set('emergencyContactRelationship', v)} />
        </div>
      </>)}

      {step === 3 && (<>
        <StepField label="Which plan?" hint="It waits for the first payment — recording the cash is what starts it.">
          <div className="grid gap-2">
            {sellable.map((p) => {
              const on = f.planId === p.id;
              return (
                <button key={p.id} type="button" onClick={() => set('planId', p.id)} role="radio" aria-checked={on}
                  className="text-left rounded-xl px-3 py-2.5 flex items-center gap-3"
                  style={{ background: on ? 'var(--color-primary-light)' : 'var(--color-surface-high)', border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white">{p.name}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{p.duration_days == null ? 'No expiry' : `${p.duration_days} days`}</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-secondary)' }}>{Number(p.price) > 0 ? `₱${Number(p.price).toLocaleString('en-PH')}` : 'Free'}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => set('planId', '')} role="radio" aria-checked={!f.planId} className="text-left rounded-xl px-3 py-2.5 text-sm"
              style={{ background: !f.planId ? 'var(--color-primary-light)' : 'var(--color-surface-high)', border: `1px solid ${!f.planId ? 'var(--color-primary)' : 'var(--color-border)'}`, color: '#fff' }}>
              No plan yet
            </button>
          </div>
        </StepField>
        <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
          <UserPlus size={13} className="inline mr-1" style={{ color: 'var(--color-primary)' }} />
          {f.firstName || 'They'} {f.lastName} · {f.email || 'no email yet'}{f.phone ? ` · ${f.phone}` : ''}{f.address ? ` · ${f.address}` : ''}
        </div>
      </>)}
    </StepModal>
  );
}
