import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Phone, Lock, ArrowLeft, ArrowRight, CheckCircle, Check,
  Eye, EyeOff, User, Dumbbell, Info, ShieldAlert, Users, MapPin,
} from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { showErrorToast } from '../utils/errorHandler';
import { registerMember, isEmailTaken, isPhoneTaken } from '../lib/api/members';
import { listPlans } from '../lib/api/membershipPlans';
import type { MembershipPlanRow } from '../types/db';
import BirthDateField from '../components/ui/BirthDateField';

/**
 * Member sign-up, as a three-step onboarding flow.
 *
 * Four things were wrong here, and none of them were visual.
 *
 * **A fourth step that offered one real choice.** The flow opened on "Choose
 * Role" with Member and Trainer cards. Picking Trainer only revealed a panel
 * explaining that trainer accounts are created by the gym and a button back to
 * Login — a whole screen whose second option was "you cannot do this here".
 * Trainers now get one line at the bottom of step 1, and the flow is 3 steps.
 *
 * **Continue filled the form in for you.** `handleContinue` wrote
 * `PROTOTYPE_REGISTER` into any blank field and moved on, and the submit did the
 * same again with `formData.email || PROTOTYPE_REGISTER.email`. Tapping through
 * without typing created a real Supabase account under a placeholder person's
 * name, email, phone and password. Every step now validates and refuses to
 * advance, and nothing is substituted at submit.
 *
 * **The plans were invented.** Basic/Standard/Premium at ₱800/₱1,500/₱2,500
 * with "Sauna" and "8 PT sessions" — the fourth copy of a price list that
 * matches no row in `membership_plans`. They come from the database now.
 *
 * **And the chosen plan was thrown away.** `registerMember` has taken a
 * `requestedPlanId` all along; the call simply never passed one, so the whole
 * plan step was decoration. It is now sent, lands in the signup metadata, and
 * reaches the front desk as the plan this person asked for.
 */

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

// Defined outside Register so it keeps a stable component identity across
// re-renders — declaring it inside the component body made React remount a
// fresh <input> on every keystroke (new function = new component type),
// which dropped focus after each character typed.
function Field({
  label, icon: Icon, type = 'text', value, onChange, placeholder, hint, autoComplete, inputMode,
}: any) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--color-text-muted)' }}
          />
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className="field-input w-full h-12 rounded-xl text-white text-sm"
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            paddingLeft: Icon ? '2.5rem' : '0.875rem',
            paddingRight: '0.875rem',
          }}
        />
      </div>
      {hint && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>
      )}
    </div>
  );
}

const STEPS = [
  { n: 1, label: 'You' },
  { n: 2, label: 'Safety' },
  { n: 3, label: 'Account' },
  { n: 4, label: 'Plan' },
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Rather not say' },
];

/**
 * Age from a birth date, for the "you are N" confirmation under the field.
 *
 * Subtracting years alone over-counts for anyone whose birthday has not
 * happened yet this year — wrong for roughly half of every member, half the
 * time. Mirrors `age_years()` in migration 0031.
 */
function ageFrom(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export default function Register() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', phone: '',
    dateOfBirth: '', gender: '',
    address: '',
    emergencyName: '', emergencyPhone: '', emergencyRelationship: '',
    email: '', password: '', confirmPassword: '',
    selectedPlanId: '', termsAccepted: false,
  });
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  /** A uniqueness lookup is in flight — the step gate is async now. */
  const [checking, setChecking] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => { setOverlayRoot(getOverlayRoot()); }, []);

  // Real plans. A failed load leaves the step saying so instead of offering a
  // price the gym never set.
  //
  // Nothing is pre-selected. This choice is written to
  // `pending_registrations.requested_plan_id` and is what the front desk bills
  // against at approval, so defaulting to whichever plan sorted first would put
  // a price on someone who never picked one.
  useEffect(() => {
    let cancelled = false;
    listPlans()
      .then((rows) => { if (!cancelled) setPlans(rows.filter((p) => p.is_active)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const update = (key: string, val: any) => setFormData((p) => ({ ...p, [key]: val }));

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const fail = (message: string) => {
    showErrorToast({ type: 'validation', message, details: '' });
    return false;
  };

  /**
   * Each step is checked before it can be left. Nothing is auto-filled.
   *
   * The uniqueness lookups run on the step that owns the field, so a taken
   * email is caught on Account rather than after the plan has been chosen and
   * the account attempted. They are advice, not the boundary — 0027's trigger
   * and the unique index on `auth.users.email` are what actually refuse.
   */
  const validate = async (which: number): Promise<boolean> => {
    if (which === 1) {
      if (!formData.firstName.trim()) return fail('Please enter your first name');
      if (!formData.lastName.trim()) return fail('Please enter your last name');

      // A birth date, never an age: an age is right for one year and then
      // quietly wrong. The bounds here catch typos; they are not gym policy on
      // who may join, which is the front desk's call at approval.
      if (!formData.dateOfBirth) return fail('Please enter your date of birth');
      const age = ageFrom(formData.dateOfBirth);
      if (age == null) return fail('That date of birth does not look right');
      if (age < 0) return fail('That date of birth is in the future');
      if (age > 120) return fail('Please check your date of birth');

      if (!formData.gender) return fail('Please choose an option for gender');

      if (formData.phone.trim()) {
        if (!/^[\d+\s()-]{7,}$/.test(formData.phone.trim()))
          return fail('That phone number does not look right');
        if (await isPhoneTaken(formData.phone))
          return fail('That phone number is already registered. Ask the front desk if this is yours.');
      }
      return true;
    }
    if (which === 2) {
      // Required, unlike the address. This is a gym: the one blank field that
      // actually matters is who to call. `member_profiles` has had these
      // columns since 0001 and nothing has ever filled them.
      if (!formData.emergencyName.trim()) return fail('Please enter an emergency contact name');
      if (!formData.emergencyPhone.trim()) return fail('Please enter an emergency contact number');
      if (!/^[\d+\s()-]{7,}$/.test(formData.emergencyPhone.trim()))
        return fail('That emergency contact number does not look right');
      return true;
    }
    if (which === 3) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim()))
        return fail('Please enter a valid email address');
      if (await isEmailTaken(formData.email))
        return fail('An account already exists for that email. Try signing in instead.');
      if (formData.password.length < 8) return fail('Your password needs at least 8 characters');
      if (formData.password !== formData.confirmPassword) return fail('The passwords do not match');
      return true;
    }
    // Only demanded when there are plans to choose from. If the catalog failed
    // to load, blocking registration on a list the member cannot see would
    // strand them; the front desk sets the plan at approval anyway.
    if (plans.length > 0 && !formData.selectedPlanId) return fail('Please choose a plan');
    if (!formData.termsAccepted) return fail('Please accept the Terms and Privacy Policy');
    return true;
  };

  const handleContinue = async () => {
    if (checking) return;
    setChecking(true);
    const ok = await validate(step);
    setChecking(false);
    if (!ok) return;
    if (step < STEPS.length) { go(step + 1); return; }

    setIsLoading(true);
    try {
      const { signedIn } = await registerMember({
        // Supabase stores addresses lowercased; normalising here means the
        // "already registered" check compares like with like.
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim() || undefined,
        // Parked in `pending_registrations` by the 0005/0031 trigger and copied
        // onto the member row at approval — a self-registering member has no
        // member_profiles row to write to yet.
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender || undefined,
        address: formData.address.trim() || undefined,
        emergencyContactName: formData.emergencyName.trim() || undefined,
        emergencyContactPhone: formData.emergencyPhone.trim() || undefined,
        emergencyContactRelationship: formData.emergencyRelationship.trim() || undefined,
        // Passed at last. The front desk sees which plan this person asked for
        // instead of guessing at approval time.
        requestedPlanId: formData.selectedPlanId || undefined,
      });
      setIsLoading(false);

      // Straight into onboarding when the account is already signed in. With
      // email confirmation on there is no session yet, so the alternative is
      // not "log in anyway" — it's telling them to check their inbox, because
      // onboarding writes `experience_level` against their member row and has
      // nothing to write to without a session.
      if (signedIn) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.removeItem('trainerMode');
        navigate('/onboarding', { replace: true });
        return;
      }

      setShowSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 3500);
    } catch (err) {
      setIsLoading(false);
      const message = err instanceof Error ? err.message : 'Registration failed';
      showErrorToast({ type: 'validation', message, details: '' });
      // Send them back to the step that owns the problem. Being told the email
      // is taken while looking at a list of plans gives you nothing to act on.
      if (/email/i.test(message)) go(3);
      else if (/phone/i.test(message)) go(1);
    }
  };

  const selectedPlan = plans.find((p) => p.id === formData.selectedPlanId) ?? null;

  // ── Success ──
  if (showSuccess) {
    return (
      <MobileFrame>
        <div className="flex items-center justify-center h-full px-6" style={{ backgroundColor: 'var(--color-bg)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
              className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'var(--color-primary-light)', border: '2px solid var(--color-primary)' }}
            >
              <CheckCircle size={44} style={{ color: 'var(--color-primary)' }} />
            </motion.div>
            <h2 className="display text-2xl text-white">You're registered</h2>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Confirm your email, then visit Core Fitness Mamburao to pay. Your membership starts the
              moment the front desk records it{selectedPlan ? ` — you asked for ${selectedPlan.name}` : ''}.
            </p>
            <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>Taking you to sign in…</p>
          </motion.div>
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      {overlayRoot && isLoading && createPortal(<LoadingOverlay message="Creating your account…" />, overlayRoot)}

      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div
          className="absolute -top-20 -right-16 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.14) 0%, transparent 70%)' }}
        />

        <div className="flex-1 flex flex-col px-5 py-5 overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-shrink-0">
            <button
              onClick={() => (step === 1 ? navigate('/login') : go(step - 1))}
              aria-label="Back"
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-center min-w-0">
              <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                Step {step} of 3
              </p>
              <p className="display text-lg text-white leading-none mt-0.5">
                {STEPS[step - 1].label}
              </p>
            </div>
            <img
              src="/logo.png" alt="Core Fitness"
              className="w-10 h-10 rounded-full object-contain flex-shrink-0"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
            />
          </div>

          {/* Stepper. Numbered nodes with a connecting track, rather than three
              anonymous bars — you can see which step you are on and which are
              behind you without reading the header. */}
          <div className="flex items-center mt-5 mb-6 flex-shrink-0">
            {STEPS.map(({ n, label }, i) => {
              const done = n < step;
              const active = n === step;
              return (
                <div key={n} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <motion.div
                      animate={{ scale: active ? 1.1 : 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: done || active ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                        border: `1px solid ${done || active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        color: done || active ? '#fff' : 'var(--color-text-muted)',
                      }}
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : n}
                    </motion.div>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: active ? '#fff' : 'var(--color-text-muted)' }}
                    >
                      {label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 mx-2 -mt-5 rounded-full overflow-hidden"
                      style={{ background: 'var(--color-surface-high)' }}>
                      <motion.div
                        className="h-full rounded-full origin-left"
                        style={{ background: 'var(--color-primary)' }}
                        animate={{ scaleX: n < step ? 1 : 0 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <AnimatePresence mode="wait" custom={direction}>
              {step === 1 && (
                <motion.div
                  key="s1" custom={direction}
                  initial={{ opacity: 0, x: 24 * direction }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 * direction }} transition={{ duration: 0.22 }}
                  className="space-y-4 pb-4"
                >
                  <div>
                    <h1 className="display text-2xl text-white leading-tight">What should we call you?</h1>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      This is the name the gym will see on your membership.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Placeholders were "Eya" / "Lorenzana" — one real member's
                        name used as the example on every signup. */}
                    <Field label="First name" icon={User} value={formData.firstName} placeholder="Juan"
                      autoComplete="given-name" onChange={(e: any) => update('firstName', e.target.value)} />
                    <Field label="Last name" icon={User} value={formData.lastName} placeholder="Dela Cruz"
                      autoComplete="family-name" onChange={(e: any) => update('lastName', e.target.value)} />
                  </div>

                  {/* Date of birth, not age — see `ageFrom` above. The live
                      "You are N" line is the confirmation that the date was
                      typed the way they meant it. */}
                  <div>
                    <BirthDateField value={formData.dateOfBirth}
                      onChange={(v) => update('dateOfBirth', v)} />
                    {formData.dateOfBirth && ageFrom(formData.dateOfBirth) != null && (
                      <p className="text-xs mt-1.5 font-semibold" style={{ color: 'var(--color-secondary)' }}>
                        You are {ageFrom(formData.dateOfBirth)} years old
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Gender
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {GENDERS.map((g) => {
                        const on = formData.gender === g.value;
                        return (
                          <button
                            key={g.value}
                            type="button"
                            onClick={() => update('gender', g.value)}
                            aria-pressed={on}
                            className="h-11 rounded-xl text-xs font-semibold transition-colors active:scale-95"
                            style={{
                              background: on ? 'var(--color-primary)' : 'var(--color-surface)',
                              border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                              color: on ? '#fff' : 'var(--color-text-muted)',
                            }}
                          >
                            {g.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Field label="Phone" icon={Phone} type="tel" value={formData.phone}
                    placeholder="+63 912 345 6789" autoComplete="tel" inputMode="tel"
                    hint="Optional — how the gym reaches you about your booking."
                    onChange={(e: any) => update('phone', e.target.value)} />

                  {/* The old flow spent an entire step offering Trainer as a
                      choice you could not take. One line covers it. */}
                  <div
                    className="flex items-start gap-2.5 p-3.5 rounded-2xl"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <Dumbbell size={15} style={{ color: 'var(--color-primary)' }} className="flex-shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      Coaching at Core Fitness? Trainer accounts are created by the gym — ask the front
                      desk, then{' '}
                      <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="font-semibold"
                        style={{ color: 'var(--color-secondary)' }}
                      >
                        sign in here
                      </button>
                      .
                    </p>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="s2" custom={direction}
                  initial={{ opacity: 0, x: 24 * direction }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 * direction }} transition={{ duration: 0.22 }}
                  className="space-y-4 pb-4"
                >
                  <div>
                    <h1 className="display text-2xl text-white leading-tight">Who should we call?</h1>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      If something happens while you are training, this is who the gym contacts.
                    </p>
                  </div>

                  <Field label="Emergency contact name" icon={ShieldAlert} value={formData.emergencyName}
                    placeholder="Maria Dela Cruz" autoComplete="off"
                    onChange={(e: any) => update('emergencyName', e.target.value)} />

                  <Field label="Their phone number" icon={Phone} type="tel" value={formData.emergencyPhone}
                    placeholder="+63 912 345 6789" autoComplete="off" inputMode="tel"
                    onChange={(e: any) => update('emergencyPhone', e.target.value)} />

                  <Field label="Relationship" icon={Users} value={formData.emergencyRelationship}
                    placeholder="Mother, spouse, friend…" autoComplete="off"
                    hint="Optional — helps the desk know who they are speaking to."
                    onChange={(e: any) => update('emergencyRelationship', e.target.value)} />

                  <Field label="Home address" icon={MapPin} value={formData.address}
                    placeholder="Barangay, Mamburao" autoComplete="street-address"
                    hint="Optional."
                    onChange={(e: any) => update('address', e.target.value)} />
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="s3" custom={direction}
                  initial={{ opacity: 0, x: 24 * direction }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 * direction }} transition={{ duration: 0.22 }}
                  className="space-y-4 pb-4"
                >
                  <div>
                    <h1 className="display text-2xl text-white leading-tight">Set up your sign-in</h1>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      We send a confirmation link to this address.
                    </p>
                  </div>

                  <Field label="Email" icon={Mail} type="email" value={formData.email}
                    placeholder="you@example.com" autoComplete="email" inputMode="email"
                    onChange={(e: any) => update('email', e.target.value)} />

                  <div>
                    <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      Password
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--color-text-muted)' }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => update('password', e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        className="field-input w-full h-12 rounded-xl text-white text-sm pl-10 pr-11"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {/* Live, so the rule is met before submitting rather than
                        discovered by a toast afterwards. */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-high)' }}>
                        <motion.div
                          className="h-full rounded-full origin-left"
                          style={{
                            background: formData.password.length >= 8
                              ? 'var(--color-primary)'
                              : 'var(--color-secondary)',
                          }}
                          animate={{ scaleX: Math.min(1, formData.password.length / 8) }}
                          transition={{ duration: 0.2 }}
                        />
                      </div>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {formData.password.length >= 8 ? 'Good' : `${formData.password.length}/8`}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--color-text-muted)' }} />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={(e) => update('confirmPassword', e.target.value)}
                        placeholder="Type it again"
                        autoComplete="new-password"
                        className="field-input w-full h-12 rounded-xl text-white text-sm pl-10 pr-11"
                        style={{
                          background: 'var(--color-bg)',
                          border: `1px solid ${
                            formData.confirmPassword && formData.confirmPassword !== formData.password
                              ? 'rgba(239,68,68,0.5)'
                              : 'var(--color-border)'
                          }`,
                        }}
                      />
                      <button type="button" onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div
                  key="s4" custom={direction}
                  initial={{ opacity: 0, x: 24 * direction }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 * direction }} transition={{ duration: 0.22 }}
                  className="space-y-4 pb-4"
                >
                  <div>
                    <h1 className="display text-2xl text-white leading-tight">Which plan do you want?</h1>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      Nothing is charged here — you pay cash at the front desk.
                    </p>
                  </div>

                  {plans.length === 0 ? (
                    <div className="p-6 rounded-2xl text-center"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <p className="text-sm font-semibold text-white">Plans unavailable</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        We couldn't load the gym's plans. You can still register — the front desk will set
                        your plan when you pay.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {plans.map((plan, i) => {
                        const isSelected = plan.id === formData.selectedPlanId;
                        const features = (plan.description ?? '')
                          .split(/\\n|\n/).map((l) => l.trim()).filter(Boolean);
                        return (
                          <motion.button
                            key={plan.id}
                            type="button"
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.06, 0.25) }}
                            onClick={() => update('selectedPlanId', plan.id)}
                            className="w-full p-4 rounded-2xl text-left transition-all active:scale-[0.99]"
                            style={{
                              background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                              border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white">{plan.name}</p>
                                {features.length > 0 && (
                                  <ul className="mt-1.5 space-y-1">
                                    {features.map((f) => (
                                      <li key={f} className="text-xs flex items-start gap-1.5"
                                        style={{ color: 'var(--color-text-secondary)' }}>
                                        <Check size={11} className="flex-shrink-0 mt-0.5"
                                          style={{ color: 'var(--color-primary)' }} />
                                        {f}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-base font-bold" style={{ color: 'var(--color-secondary)' }}>
                                  ₱{Number(plan.price).toLocaleString()}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                  {plan.duration_days == null ? 'no expiry' : `${plan.duration_days} days`}
                                </p>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-start gap-2.5 p-3.5 rounded-2xl"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <Info size={15} style={{ color: 'var(--color-primary)' }} className="flex-shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      Your account stays pending until the gym records your payment. Bring cash to
                      Core Fitness Mamburao and it activates on the spot.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => update('termsAccepted', !formData.termsAccepted)}
                    className="w-full flex items-start gap-3 text-left"
                  >
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                      style={{
                        background: formData.termsAccepted ? 'var(--color-primary)' : 'transparent',
                        border: `1.5px solid ${formData.termsAccepted ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      }}
                    >
                      {formData.termsAccepted && <Check size={12} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      I agree to the{' '}
                      <span
                        role="link"
                        onClick={(e) => { e.stopPropagation(); navigate('/terms'); }}
                        className="font-semibold"
                        style={{ color: 'var(--color-secondary)' }}
                      >
                        Terms of Service
                      </span>{' '}
                      and{' '}
                      <span
                        role="link"
                        onClick={(e) => { e.stopPropagation(); navigate('/privacy'); }}
                        className="font-semibold"
                        style={{ color: 'var(--color-secondary)' }}
                      >
                        Privacy Policy
                      </span>
                      .
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 pt-3 space-y-2.5">
            <motion.button
              onClick={handleContinue}
              disabled={isLoading || checking}
              whileTap={{ scale: 0.985 }}
              className="w-full h-12 rounded-full font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: 'var(--color-secondary)',
                color: '#000',
                boxShadow: '0 8px 24px rgba(245,158,11,0.25)',
              }}
            >
              {/* Keyed to STEPS.length, not a literal. The label said "Create my
                  account" on the Account step for exactly as long as it took to
                  add a fourth step and forget one hardcoded 3. */}
              {checking ? 'Checking…' : step === STEPS.length ? 'Create my account' : 'Continue'}
              {!checking && <ArrowRight size={16} />}
            </motion.button>

            {step === 1 && (
              <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Already have an account?{' '}
                <button onClick={() => navigate('/login')} className="font-semibold"
                  style={{ color: 'var(--color-secondary)' }}>
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
