import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Phone, Lock, ArrowRight, Check,
  Eye, EyeOff, User, Dumbbell, ShieldAlert, Users, MapPin, QrCode, Gift,
} from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { showErrorToast } from '../utils/errorHandler';
import { registerMember, isEmailTaken, isPhoneTaken } from '../lib/api/members';
import { gymBySlug, listGyms, type PublicGym, gymJoinRules, type JoinRules } from '../lib/api/gyms';
import { supabase } from '../lib/supabaseClient';
import { listPlans, publicPlans } from '../lib/api/membershipPlans';
import type { MembershipPlanRow } from '../types/db';
import BirthDateField from '../components/ui/BirthDateField';
import { ageFrom, birthDateProblem, PHONE_RE } from '../utils/profileRules';
import { refFromUrl } from '../lib/api/referrals';
import { finishSignup, signupState, type SignupState } from '../lib/api/google';
import { TERMS_VERSION, PRIVACY_VERSION } from '../lib/legalVersions';
import { finishSignIn, logout } from '../utils/auth';
import { applyAccent } from '../lib/gymTheme';
import { getCurrentMemberId, setExperienceLevel } from '../services/bookingService';
import GoogleButton from '../components/ui/GoogleButton';

/**
 * Member sign-up — direction B of the 2026-11-02 mock-ups: **the member card
 * fills in as you answer**, in the gym's own colours, and flips at the end.
 *
 * Four things were wrong here once, and none of them were visual: a Trainer
 * card that offered a choice you could not take; Continue filling the form in
 * with a placeholder person; invented plans; and the chosen plan thrown away.
 * All four stay fixed — every step validates, nothing is substituted, plans
 * come from `membership_plans`, and the one tapped reaches the desk as
 * `requested_plan_id`.
 *
 * What 2026-11-02 changed:
 * - **The header said "Step N of 3" over four steps.** It counts `STEPS` now.
 * - **Inside a gym, the gym's colours** (`applyAccent`), never a fixed violet —
 *   the card wears its logo and name. Put back on leaving, so Login is
 *   Core Fitness again; the shells re-apply the gym's own after sign-in.
 * - **Experience and a main goal are asked here**, so the card can show them.
 *   With no session yet (email to confirm) they travel in the sign-up metadata
 *   (`signup_experience`, `signup_goal`) and Onboarding starts with them picked;
 *   with Google there is a session, so the experience is written at once.
 *   Onboarding's goal ids are used, so the two screens agree.
 * - **A friend's code can be typed**, not only arrive in a `?ref=` link — 0125's
 *   trigger reads it, and a bad code never blocks sign-up.
 * - **Plan is honest about starting free**: one tap marks interest (tap again to
 *   clear) and the desk sees it; nothing is charged.
 * - **An email taken at another gym** says to sign in and switch gyms (0227) —
 *   a member belongs to one gym at a time.
 */

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

// Outside Register so it keeps a stable identity across renders — declared
// inside, React remounted the <input> on every keystroke and focus was lost.
interface FieldProps {
  id: string; label: string; icon?: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  type?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; hint?: string; autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}

function Field({ label, icon: Icon, type = 'text', value, onChange, placeholder, hint, autoComplete, inputMode, id }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--color-text-muted)' }} />
        )}
        <input
          id={id} type={type} value={value} onChange={onChange} placeholder={placeholder}
          autoComplete={autoComplete} inputMode={inputMode}
          className="field-input w-full h-12 rounded-xl text-white text-sm"
          style={{
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            paddingLeft: Icon ? '2.5rem' : '0.875rem', paddingRight: '0.875rem',
          }}
        />
      </div>
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>}
    </div>
  );
}

const STEPS = [
  { n: 1, label: 'You' },
  { n: 2, label: 'Safety and sign-in' },
  { n: 3, label: 'Your training' },
  { n: 4, label: 'Plan' },
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Rather not say' },
];

/** The same three as Onboarding and `member_profiles.experience_level` — self-declared, never the earned level. */
const EXPERIENCE = [
  { id: 'beginner', label: 'Beginner', desc: 'New, or back after a break' },
  { id: 'intermediate', label: 'Intermediate', desc: '6+ months of steady training' },
  { id: 'advanced', label: 'Advanced', desc: '2+ years of dedicated training' },
];

/** Onboarding's goal ids, so its first step starts with this one picked. */
const GOALS = [
  { id: 'lose-weight', label: 'Lose weight' },
  { id: 'build-muscle', label: 'Build muscle' },
  { id: 'stay-fit', label: 'Stay fit' },
  { id: 'flexibility', label: 'Flexibility' },
  { id: 'endurance', label: 'Endurance' },
];

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

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
    guardianName: '',
    experience: '', goal: '',
    referralCode: refFromUrl() ?? '',
  });
  /** The gym's joining rule, approval and minimum age (0179); null = not known. */
  const [rules, setRules] = useState<JoinRules | null>(null);
  /** Came by the gym's own link (or a code, which lands on it) — 0179's `join_via`. */
  const viaLink = !!new URLSearchParams(window.location.search).get('join');
  const minAge = rules?.minAge ?? 16;
  const age = formData.dateOfBirth ? ageFrom(formData.dateOfBirth) : null;
  const needsGuardian = age != null && age < 18;
  /** Front desk only, and no member's invitation: nothing here can let them in. */
  const deskOnly = rules?.policy === 'closed' && !refFromUrl() && !new URLSearchParams(window.location.search).get('invite');
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [gym, setGym] = useState<PublicGym | null>(null);
  /** 0230: the gym's plan has no room for another member — said before anyone types. */
  const [full, setFull] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  /** A uniqueness lookup is in flight — the step gate is async now. */
  const [checking, setChecking] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [overlayRoot] = useState<HTMLElement | null>(() => getOverlayRoot());
  /**
   * Signed in with Google and not in a gym yet (0190): the same steps, with
   * Google's name filled in and no email to choose — the account is finished
   * by finish_signup(), under the same joining rule.
   */
  const [google, setGoogle] = useState<SignupState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const st = await signupState();
      if (cancelled || !st || st.gyms > 0) return;
      setGoogle(st);
      setFormData((f) => ({ ...f, firstName: f.firstName || st.first_name || '', lastName: f.lastName || st.last_name || '', email: st.email ?? f.email }));
    })();
    return () => { cancelled = true; };
  }, []);

  // The gym's colours while signing up to it; Core Fitness's again on the way out.
  useEffect(() => {
    if (gym) applyAccent(gym.accent, gym.accent_action);
  }, [gym]);
  useEffect(() => () => applyAccent(null, null), []);

  // Which gym this sign-up joins. `?gym=` carries it from the gym list or a
  // `/join/<slug>` link; with only one gym on the platform there is nothing to
  // choose. Plans are the gym's real ones; nothing is pre-selected, because the
  // choice reaches the desk as what to offer this person.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get('gym');
      let chosen: PublicGym | null = null;
      try {
        // An invitation or a join link names its gym by address, which finds a
        // gym that is not in the public list ("only with your link or code").
        const invite = params.get('invite');
        let slug = params.get('join');
        if (invite && !slug) {
          const { data } = await supabase.rpc('peek_invitation', { p_token: invite });
          const peeked = Array.isArray(data) && data[0] ? (data[0] as { slug: string; first_name: string | null }) : null;
          slug = peeked?.slug ?? null;
          // Autofill (E4): the name the gym invited them by, never over what they typed.
          if (peeked?.first_name && !cancelled) setFormData((f) => (f.firstName ? f : { ...f, firstName: peeked.first_name! }));
        }
        if (slug) chosen = await gymBySlug(slug);
        if (!chosen) {
          const all = await listGyms();
          chosen = wanted ? all.find((g) => g.id === wanted) ?? null : all.length === 1 ? all[0] : null;
          if (!cancelled && !chosen && all.length > 1) { navigate('/join', { replace: true }); return; }
        }
      } catch {
        /* pre-0097: one gym, and the plans below load the old way */
      }
      if (cancelled) return;
      setGym(chosen);
      if (chosen) void gymJoinRules(chosen.id).then((r) => { if (!cancelled) setRules(r); });
      if (chosen) void supabase.rpc('gym_is_full', { p_gym: chosen.id }).then(({ data }) => { if (!cancelled && data === true) setFull(true); });
      try {
        const rows = chosen ? await publicPlans(chosen.id) : await listPlans();
        if (!cancelled) setPlans(rows.filter((p) => p.is_active !== false));
      } catch {
        /* the step says so rather than offering a price the gym never set */
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const update = (key: string, val: string | boolean) => setFormData((p) => ({ ...p, [key]: val }));

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const fail = (message: string) => {
    showErrorToast({ type: 'validation', message, details: '' });
    return false;
  };

  /**
   * Each step is checked before it can be left. Nothing is auto-filled. The
   * uniqueness lookups run on the step that owns the field; they are advice —
   * 0027's trigger and the unique index on `auth.users.email` actually refuse.
   */
  const validate = async (which: number): Promise<boolean> => {
    if (which === 1) {
      if (full) return fail(`${gym?.name ?? 'This gym'} is full on its current plan. Ask the front desk.`);
      if (deskOnly) return fail(`${gym?.name ?? 'This gym'} signs members up at the front desk. Ask a member for their invite link.`);
      if (!formData.firstName.trim()) return fail('Please enter your first name');
      if (!formData.lastName.trim()) return fail('Please enter your last name');
      // A birth date, never an age: an age is right for one year and then quietly wrong.
      if (!formData.dateOfBirth) return fail('Please enter your date of birth');
      const dobProblem = birthDateProblem(formData.dateOfBirth);
      if (dobProblem) return fail(dobProblem);
      const years = ageFrom(formData.dateOfBirth);
      if (years != null && years < minAge)
        return fail(`${gym?.name ?? 'This gym'} welcomes members from age ${minAge}. Ask at the front desk.`);
      if (years != null && years < 18 && !formData.guardianName.trim())
        return fail('Under 18: please enter the name of the parent or guardian who agrees');
      if (!formData.gender) return fail('Please choose an option for gender');
      if (formData.phone.trim()) {
        if (!PHONE_RE.test(formData.phone.trim())) return fail('That phone number does not look right');
        if (await isPhoneTaken(formData.phone))
          return fail('That phone number is already registered. Ask the front desk if this is yours.');
      }
      return true;
    }
    if (which === 2) {
      // Who to call is the one blank field that actually matters at a gym.
      if (!formData.emergencyName.trim()) return fail('Please enter an emergency contact name');
      if (!formData.emergencyPhone.trim()) return fail('Please enter an emergency contact number');
      if (!PHONE_RE.test(formData.emergencyPhone.trim())) return fail('That emergency contact number does not look right');
      // Google already proved the address; a password is still chosen, so either way signs in.
      if (!google) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) return fail('Please enter a valid email address');
        if (await isEmailTaken(formData.email))
          return fail('That email already has an account. Sign in — if you train at another gym now, switch gyms in More → Gyms.');
      }
      if (formData.password.length < 8) return fail('Your password needs at least 8 characters');
      if (formData.password !== formData.confirmPassword) return fail('The passwords do not match');
      return true;
    }
    if (which === 3) {
      // Optional — Onboarding asks again — but a code typed in must look like one (six letters).
      const code = formData.referralCode.trim();
      if (code && !/^[A-Za-z]{6}$/.test(code)) return fail("A friend's code is six letters — check it, or leave it blank");
      return true;
    }
    // Plan interest is optional: everybody starts on the free plan regardless.
    if (!formData.termsAccepted) return fail('Please accept the Terms and Privacy Policy');
    return true;
  };

  const referral = formData.referralCode.trim().toUpperCase() || null;

  const handleContinue = async () => {
    if (checking) return;
    setChecking(true);
    const ok = await validate(step);
    setChecking(false);
    if (!ok) return;
    if (step < STEPS.length) { go(step + 1); return; }

    setIsLoading(true);
    if (google) {
      try {
        if (!gym) throw new Error('Choose your gym first.');
        const way = await finishSignup({
          gymId: gym.id, joinVia: viaLink ? 'link' : 'list', referralCode: referral,
          firstName: formData.firstName.trim(), lastName: formData.lastName.trim(), phone: formData.phone.trim() || undefined,
          dateOfBirth: formData.dateOfBirth, guardianName: needsGuardian ? formData.guardianName.trim() : undefined,
          gender: formData.gender || undefined, address: formData.address.trim() || undefined,
          emergencyName: formData.emergencyName.trim() || undefined, emergencyPhone: formData.emergencyPhone.trim() || undefined,
          emergencyRelationship: formData.emergencyRelationship.trim() || undefined,
          requestedPlanId: formData.selectedPlanId || undefined, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
        });
        setIsLoading(false);
        if (way === 'desk') {
          await logout();
          navigate('/login', { replace: true, state: { pendingApproval: true } });
          return;
        }
        // The password they chose, so this account signs in with email too; the goal rides along for Onboarding.
        const { error: pwError } = await supabase.auth.updateUser({
          password: formData.password, data: { signup_experience: formData.experience, signup_goal: formData.goal },
        });
        if (pwError) showErrorToast({ type: 'validation', message: 'You are signed up, but the password was not saved', details: pwError.message });
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await finishSignIn(session.user.id);
        if (formData.experience) {
          const memberId = await getCurrentMemberId().catch(() => null);
          if (memberId) await setExperienceLevel(memberId, formData.experience as 'beginner').catch(() => undefined);
        }
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.removeItem('trainerMode');
        navigate('/onboarding', { replace: true });
      } catch (err) {
        setIsLoading(false);
        const message = err instanceof Error ? err.message : 'Could not finish signing up';
        showErrorToast({ type: 'validation', message, details: '' });
        if (/phone|name|birth|age/i.test(message)) go(1);
      }
      return;
    }
    try {
      const { signedIn } = await registerMember({
        gymId: gym?.id,
        // Supabase stores addresses lowercased; normalising keeps "already registered" comparing like with like.
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim() || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender || undefined,
        address: formData.address.trim() || undefined,
        emergencyContactName: formData.emergencyName.trim() || undefined,
        emergencyContactPhone: formData.emergencyPhone.trim() || undefined,
        emergencyContactRelationship: formData.emergencyRelationship.trim() || undefined,
        requestedPlanId: formData.selectedPlanId || undefined,
        // Sent rather than hardcoded: a consent record that cannot be false is not a record.
        termsAccepted: formData.termsAccepted,
        referralCode: referral ?? undefined,
        joinVia: viaLink ? 'link' : 'list',
        guardianName: needsGuardian ? formData.guardianName.trim() : undefined,
        signupExperience: formData.experience || undefined,
        signupGoal: formData.goal || undefined,
      });
      setIsLoading(false);

      // Signed in already (no email to confirm): straight on. Otherwise the
      // card flips and they are told to check their inbox.
      const invite = new URLSearchParams(window.location.search).get('invite');
      if (signedIn) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.removeItem('trainerMode');
        navigate(invite ? `/invite/${invite}` : '/onboarding', { replace: true });
        return;
      }
      setShowSuccess(true);
    } catch (err) {
      setIsLoading(false);
      const raw = err instanceof Error ? err.message : 'Registration failed';
      // Supabase Auth hides a database refusal behind one sentence; the likeliest one now is a full gym (0230).
      const message = /Database error saving new user/i.test(raw) ? `${gym?.name ?? 'This gym'} could not take your sign-up — it may be full on its current plan. Ask the front desk.` : raw;
      showErrorToast({ type: 'validation', message, details: '' });
      // Back to the step that owns the problem.
      if (/email/i.test(message)) go(2);
      else if (/phone/i.test(message)) go(1);
    }
  };

  const selectedPlan = plans.find((p) => p.id === formData.selectedPlanId) ?? null;
  const freePlan = plans.find((p) => Number(p.price) === 0) ?? null;
  const gymName = gym?.short_name || gym?.name || 'Your gym';
  const cardName = `${formData.firstName} ${formData.lastName}`.trim();
  const level = EXPERIENCE.find((e) => e.id === formData.experience);
  const goal = GOALS.find((g) => g.id === formData.goal);
  const invite = new URLSearchParams(window.location.search).get('invite');
  const toSignIn = () => navigate(invite ? `/login?invite=${invite}` : '/login', { replace: true });

  return (
    <MobileFrame>
      {overlayRoot && isLoading && createPortal(<LoadingOverlay message="Creating your account…" />, overlayRoot)}

      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }} data-register>
        <div className="flex-1 flex flex-col px-5 pt-5 pb-5 overflow-hidden">
          {/* Step and the dots: the count comes from STEPS, never a literal. */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }} data-step-label>
              {showSuccess ? 'Done' : `Step ${step} of ${STEPS.length} · ${STEPS[step - 1].label}`}
            </p>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {STEPS.map(({ n }) => (
                <span key={n} className={`rg-dot ${n <= step || showSuccess ? 'on' : ''}`} style={{ width: n === step && !showSuccess ? 24 : 8 }} />
              ))}
            </div>
          </div>

          {/* The card: it fills in as they answer, and flips when they are done. */}
          <div className="rg-scene flex-shrink-0" data-member-card>
            <div className={`rg-card ${showSuccess ? 'rg-flip' : ''}`}>
              <div className="rg-face rg-front">
                <span className="rg-shine" />
                <div className="relative flex flex-col h-full">
                  <div className="flex items-center gap-2.5">
                    {gym?.logo_url
                      ? <img src={gym.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover" style={{ background: 'rgba(0,0,0,.25)' }} />
                      : <span className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-extrabold" style={{ background: 'rgba(0,0,0,.25)' }}>{initials(gymName)}</span>}
                    <span className="font-bold text-[15px] truncate">{gymName}</span>
                  </div>
                  <div className="mt-auto">
                    <p className="text-xs font-semibold" style={{ opacity: 0.85 }}>Member</p>
                    <p className="text-2xl font-extrabold truncate" style={{ minHeight: 32 }} data-card-name>{cardName || 'Your name'}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {level && <span key={level.id} className="rg-tag">Experience: {level.label}</span>}
                      {goal && <span key={goal.id} className="rg-tag">{goal.label}</span>}
                      {step === STEPS.length && <span className="rg-tag">{freePlan?.name ?? 'Free plan'} to start</span>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rg-face rg-back">
                <span className="w-24 h-24 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary-light)' }}>
                  <QrCode size={52} style={{ color: 'var(--color-primary-300)' }} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Your check-in code</p>
                  <p className="text-base font-bold text-white mt-1 leading-snug">
                    {rules?.approval === 'auto' ? 'Ready when you first sign in' : 'Ready once the desk approves you'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide pt-5 min-h-0">
            {showSuccess ? (
              <div className="rg-pane text-center pt-2" data-register-done>
                <h1 className="text-2xl font-extrabold text-white">That's your card, {formData.firstName.trim() || 'friend'}.</h1>
                <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {rules?.approval === 'auto'
                    ? <>Confirm your email, then sign in — you start on the free plan.</>
                    : <>Confirm your email. {gym?.name ?? 'The gym'} reviews new sign-ups, and once yours is approved you can sign in on the free plan.</>}
                  {selectedPlan && Number(selectedPlan.price) > 0 ? ` The desk will tell you about ${selectedPlan.name}.` : ''}
                  {' '}Pay at the gym whenever you want to upgrade.
                </p>
              </div>
            ) : (
              <div key={step} className={`rg-pane space-y-4 pb-4 ${direction < 0 ? 'rg-back-dir' : ''}`}>
                {step === 1 && (<>
                  <h1 className="text-2xl font-extrabold text-white leading-tight">Start with you</h1>
                  {/* Google first (0190): it fills the name and the sign-in; these steps ask the rest. */}
                  {!google ? (
                    <div className="space-y-2">
                      <GoogleButton next={window.location.pathname + window.location.search} label="Sign up with Google" />
                      <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>or fill these in and choose a password</p>
                    </div>
                  ) : (
                    <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }} data-google-filled>
                      Filled in from your Google account ({google.email}). Check your name, then answer the rest.
                    </p>
                  )}

                  {full && (
                    <div data-gym-full className="rounded-2xl px-4 py-3 text-xs leading-relaxed"
                      style={{ background: 'var(--color-secondary-light, rgba(245,158,11,0.12))', color: 'var(--color-text)' }}>
                      {gym?.name ?? 'This gym'} is full on its current plan, so it cannot take new members right now. Ask the front desk —
                      they can make room by upgrading.
                    </div>
                  )}

                  {deskOnly && (
                    <div data-desk-only className="rounded-2xl px-4 py-3 text-xs leading-relaxed"
                      style={{ background: 'var(--color-secondary-light, rgba(245,158,11,0.12))', color: 'var(--color-text)' }}>
                      {gym?.name ?? 'This gym'} creates its members' accounts at the front desk. Visit the gym and they
                      will set you up — or ask a member to send you their invite link.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field id="rg-first" label="First name" icon={User} value={formData.firstName} placeholder="Juan"
                      autoComplete="given-name" onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('firstName', e.target.value)} />
                    <Field id="rg-last" label="Last name" icon={User} value={formData.lastName} placeholder="Dela Cruz"
                      autoComplete="family-name" onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('lastName', e.target.value)} />
                  </div>

                  <div>
                    <BirthDateField value={formData.dateOfBirth} minAge={minAge} onChange={(v) => update('dateOfBirth', v)} />
                    {formData.dateOfBirth && ageFrom(formData.dateOfBirth) != null && (
                      <p className="text-xs mt-1.5 font-semibold" style={{ color: 'var(--color-secondary)' }}>
                        You are {ageFrom(formData.dateOfBirth)} years old
                      </p>
                    )}
                  </div>

                  {/* Under 18: the gym takes them with a parent's or guardian's consent (0179). */}
                  {needsGuardian && (
                    <div data-guardian>
                      <Field id="rg-guardian" label="Parent or guardian who agrees" icon={User} value={formData.guardianName}
                        placeholder="Their full name" autoComplete="off"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('guardianName', e.target.value)} />
                      <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        Under 18, you join with their consent. The front desk may ask them to sign the waiver.
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>Gender</p>
                    <div className="grid grid-cols-3 gap-2">
                      {GENDERS.map((g) => (
                        <button key={g.value} type="button" onClick={() => update('gender', g.value)} aria-pressed={formData.gender === g.value}
                          className={`rg-seg text-center ${formData.gender === g.value ? 'on' : ''}`}>{g.label}</button>
                      ))}
                    </div>
                  </div>

                  <Field id="rg-phone" label="Phone" icon={Phone} type="tel" value={formData.phone}
                    placeholder="+63 912 345 6789" autoComplete="tel" inputMode="tel"
                    hint="Optional — how the gym reaches you about your booking."
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('phone', e.target.value)} />

                  <div className="flex items-start gap-2.5 p-3.5 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <Dumbbell size={15} style={{ color: 'var(--color-primary-300)' }} className="flex-shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      Coaching or at the front desk? Your gym invites you — then{' '}
                      <button type="button" onClick={() => navigate('/login')} className="font-semibold" style={{ color: 'var(--color-secondary)' }}>sign in here</button>.
                    </p>
                  </div>
                </>)}

                {step === 2 && (<>
                  <div>
                    <h1 className="text-2xl font-extrabold text-white leading-tight">Safety and sign-in</h1>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      If something happens while you train, this is who the gym calls.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="rg-ec" label="Emergency contact" icon={ShieldAlert} value={formData.emergencyName}
                      placeholder="Maria Dela Cruz" autoComplete="off" onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('emergencyName', e.target.value)} />
                    <Field id="rg-ecp" label="Their phone" icon={Phone} type="tel" value={formData.emergencyPhone}
                      placeholder="+63 9…" autoComplete="off" inputMode="tel" onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('emergencyPhone', e.target.value)} />
                  </div>
                  <Field id="rg-rel" label="Relationship" icon={Users} value={formData.emergencyRelationship}
                    placeholder="Mother, spouse, friend…" autoComplete="off" hint="Optional."
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('emergencyRelationship', e.target.value)} />
                  <Field id="rg-addr" label="Home address" icon={MapPin} value={formData.address}
                    placeholder="Barangay, Mamburao" autoComplete="street-address" hint="Optional."
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('address', e.target.value)} />

                  {google ? (
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }} data-google-account>
                      You sign in with Google as <b className="text-white">{google.email}</b>. Choose a password too, so you can also sign in with your email.
                    </p>
                  ) : (
                    <Field id="rg-email" label="Email — we send a confirmation link" icon={Mail} type="email" value={formData.email}
                      placeholder="you@example.com" autoComplete="email" inputMode="email" onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('email', e.target.value)} />
                  )}

                  <div>
                    <label htmlFor="rg-pw" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                      <input id="rg-pw" type={showPassword ? 'text' : 'password'} value={formData.password}
                        onChange={(e) => update('password', e.target.value)} placeholder="At least 8 characters" autoComplete="new-password"
                        className="field-input w-full h-12 rounded-xl text-white text-sm pl-10 pr-11"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {/* Live, so the rule is met before Continue rather than found by a toast. */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-high)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(100, (formData.password.length / 8) * 100)}%`, transition: 'width .25s',
                          background: formData.password.length >= 8 ? 'var(--color-primary)' : 'var(--color-secondary)',
                        }} />
                      </div>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {formData.password.length >= 8 ? 'Good' : `${formData.password.length}/8`}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="rg-pw2" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Confirm password</label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                      <input id="rg-pw2" type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword}
                        onChange={(e) => update('confirmPassword', e.target.value)} placeholder="Type it again" autoComplete="new-password"
                        className="field-input w-full h-12 rounded-xl text-white text-sm pl-10 pr-11"
                        style={{
                          background: 'var(--color-bg)',
                          border: `1px solid ${formData.confirmPassword && formData.confirmPassword !== formData.password ? 'var(--color-secondary)' : 'var(--color-border)'}`,
                        }} />
                      <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }}>
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </>)}

                {step === 3 && (<>
                  <div>
                    <h1 className="text-2xl font-extrabold text-white leading-tight">Your training</h1>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      So your coach and the app start in the right place. Change it any time in Settings.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>How you train now</p>
                    <div className="space-y-2" data-experience>
                      {EXPERIENCE.map((e) => (
                        <button key={e.id} type="button" aria-pressed={formData.experience === e.id}
                          onClick={() => update('experience', formData.experience === e.id ? '' : e.id)}
                          className={`rg-seg w-full flex items-center justify-between gap-3 ${formData.experience === e.id ? 'on' : ''}`}>
                          <span><b className="block text-white">{e.label}</b><span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{e.desc}</span></span>
                          {formData.experience === e.id && <Check size={16} style={{ color: 'var(--color-primary-300)' }} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>Your main goal</p>
                    <div className="flex flex-wrap gap-2" data-goal>
                      {GOALS.map((g) => (
                        <button key={g.id} type="button" aria-pressed={formData.goal === g.id}
                          onClick={() => update('goal', formData.goal === g.id ? '' : g.id)}
                          className={`rg-seg ${formData.goal === g.id ? 'on' : ''}`} style={{ borderRadius: 999, padding: '10px 15px' }}>{g.label}</button>
                      ))}
                    </div>
                  </div>
                  <Field id="rg-ref" label="A friend's code (optional)" icon={Gift} value={formData.referralCode}
                    placeholder="Six letters, e.g. JUANDC" autoComplete="off"
                    hint={refFromUrl() ? 'Filled in from your friend’s link.' : 'If a member sent you their code, type it here.'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('referralCode', e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, 6))} />
                </>)}

                {step === 4 && (<>
                  <div>
                    <h1 className="text-2xl font-extrabold text-white leading-tight">You start on the free plan</h1>
                    {/* Everyone starts free when the desk approves them; a paid plan
                        begins when cash changes hands. This only tells the desk what to offer. */}
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      Nothing is charged here. Want something more? Tap a plan and the front desk will tell you about it when you come in.
                    </p>
                  </div>

                  {plans.length === 0 ? (
                    <div className="p-5 rounded-2xl text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <p className="text-sm font-semibold text-white">Plans unavailable</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        We couldn't load the gym's plans. You can still sign up — the desk sets your plan when you pay.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5" data-plans>
                      {plans.map((plan) => {
                        const on = plan.id === formData.selectedPlanId;
                        const features = (plan.description ?? '').split(/\\n|\n/).map((l) => l.trim()).filter(Boolean);
                        return (
                          <button key={plan.id} type="button" aria-pressed={on}
                            onClick={() => update('selectedPlanId', on ? '' : plan.id)}
                            className={`rg-seg w-full p-4 ${on ? 'on' : ''}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white">{plan.name}</p>
                                {features.length > 0 && (
                                  <ul className="mt-1.5 space-y-1">
                                    {features.map((f) => (
                                      <li key={f} className="text-xs flex items-start gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                                        <Check size={11} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary-300)' }} />{f}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-base font-bold" style={{ color: 'var(--color-secondary)' }}>
                                  {Number(plan.price) === 0 ? 'Free' : `₱${Number(plan.price).toLocaleString()}`}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                  {plan.duration_days == null ? 'no expiry' : `${plan.duration_days} days`}
                                </p>
                              </div>
                            </div>
                            {on && Number(plan.price) > 0 && <p className="text-xs mt-2" style={{ color: 'var(--color-primary-300)' }}>The desk will tell you about this one.</p>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <button type="button" role="checkbox" aria-checked={formData.termsAccepted} aria-label="I agree to the Terms of Service and Privacy Policy"
                      onClick={() => update('termsAccepted', !formData.termsAccepted)}
                      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                      style={{
                        background: formData.termsAccepted ? 'var(--color-primary)' : 'transparent',
                        border: `1.5px solid ${formData.termsAccepted ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      }}>
                      {formData.termsAccepted && <Check size={13} strokeWidth={3} className="text-white" />}
                    </button>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      I agree to the{' '}
                      <button type="button" onClick={() => navigate('/terms')} className="font-semibold" style={{ color: 'var(--color-secondary)' }}>Terms of Service</button>
                      {' '}and{' '}
                      <button type="button" onClick={() => navigate('/privacy')} className="font-semibold" style={{ color: 'var(--color-secondary)' }}>Privacy Policy</button>.
                    </p>
                  </div>
                </>)}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 pt-3 space-y-2.5">
            {showSuccess ? (
              <button type="button" onClick={toSignIn}
                className="w-full h-12 rounded-full font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{ background: 'var(--color-secondary)', color: '#000' }}>
                Go to sign in <ArrowRight size={16} />
              </button>
            ) : (
              <div className="flex gap-2.5">
                <button type="button" onClick={() => (step === 1 ? navigate('/login') : go(step - 1))}
                  className="h-12 px-5 rounded-full text-sm font-semibold"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  Back
                </button>
                <button type="button" onClick={handleContinue} disabled={isLoading || checking}
                  className="flex-1 h-12 rounded-full font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                  style={{ background: 'var(--color-secondary)', color: '#000', boxShadow: '0 8px 24px color-mix(in srgb, var(--color-secondary) 30%, transparent)' }}>
                  {checking ? 'Checking…' : step === STEPS.length ? 'Create my account' : 'Continue'}
                  {!checking && <ArrowRight size={16} />}
                </button>
              </div>
            )}
            {step === 1 && !showSuccess && (
              <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Already have an account?{' '}
                <button type="button" onClick={() => navigate('/login')} className="font-semibold" style={{ color: 'var(--color-secondary)' }}>Sign in</button>
              </p>
            )}
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
