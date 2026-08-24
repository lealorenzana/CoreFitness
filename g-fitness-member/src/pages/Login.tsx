import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Lock, Mail, ArrowRight, Eye, EyeOff, Dumbbell, Clock } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import AuthBackground from '../components/ui/AuthBackground';
import BrandMark from '../components/ui/BrandMark';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { login, logout } from '../utils/auth';
import { showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { isOnboardingComplete } from '../services/bookingService';

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

type Role = 'member' | 'trainer';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>('member');
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    setOverlayRoot(getOverlayRoot());
  }, []);

  // Onboarding hands the pending state over when a just-registered member
  // finishes but the gym hasn't taken their payment yet. Without this they
  // arrive at a blank login with no idea why they were sent back.
  const handoff = (useLocation().state as { pendingApproval?: boolean } | null) ?? null;
  useEffect(() => {
    if (handoff?.pendingApproval) setPendingApproval(true);
  }, [handoff]);

  // The `selectedGym` localStorage write that used to sit here is gone. It was
  // left from the multi-gym prototype: Login wrote it, Register read it only to
  // decide whether to write it again, and nothing anywhere ever used the value.
  // Core Fitness Mamburao is the only gym, so there was nothing to select.

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showErrorToast({ type: 'validation', message: 'Please enter your email and password', details: '' });
      return;
    }
    setIsLoading(true);
    setPendingApproval(false);

    const result = await login(email, password);

    if (!result.success || !result.user) {
      showErrorToast({ type: 'validation', message: result.error ?? 'Invalid email or password', details: '' });
      setIsLoading(false);
      return;
    }

    if (result.status === 'pending_approval') {
      await logout();
      setPendingApproval(true);
      setIsLoading(false);
      return;
    }

    // Anything that isn't 'active' must be rejected here with a reason. The route
    // guards also require status === 'active', so letting an unknown status through
    // just bounces the user back to this screen with no explanation.
    if (result.status !== 'active') {
      await logout();
      const reason =
        result.status === 'suspended'
          ? 'This account has been suspended. Please contact the gym.'
          : result.status === 'archived'
            ? 'This account is no longer active. Please contact the gym to rejoin.'
            : 'This account is not active. Please contact the gym.';
      showErrorToast({ type: 'validation', message: reason, details: '' });
      setIsLoading(false);
      return;
    }

    if (result.role !== selectedRole) {
      await logout();
      showErrorToast({
        type: 'validation',
        message: `This account is registered as a ${result.role}, not a ${selectedRole}`,
        details: '',
      });
      setIsLoading(false);
      return;
    }

    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('memberId', result.user.id);
    setIsLoading(false);

    if (selectedRole === 'trainer') {
      localStorage.setItem('trainerMode', 'true');
      showSuccessToast('Welcome, Coach!');
      navigate('/trainer/home');
    } else {
      localStorage.removeItem('trainerMode');
      // Asked of the database, not this browser. The old
      // `localStorage['onboarding_complete']` check lived on a single device,
      // so signing in from a second phone, a desktop, a private window or a
      // reinstalled PWA replayed the whole flow for someone who finished it
      // days ago (0033).
      const onboardingDone = await isOnboardingComplete(result.user.id);
      showSuccessToast('Welcome back!');
      navigate(onboardingDone ? '/member/home' : '/onboarding');
    }
  };

  const isTrainer = selectedRole === 'trainer';

  /**
   * The screen takes the role's colour: violet for members, amber for trainers.
   *
   * It is driven by one custom property on the wrapper rather than a dozen
   * conditionals. Everything downstream reads `var(--role)` and carries its own
   * `transition`, so changing the single variable re-tints the blooms, the
   * pill, the logo halo, the field icons and the button *together*, in one
   * motion. Custom properties don't interpolate themselves — but the concrete
   * `background-color` and `box-shadow` that resolve from them do, which is why
   * this animates smoothly with no JS driving it and no dependency on
   * animation frames.
   */
  const roleTheme = isTrainer
    ? { accent: '#F59E0B', rgb: '245,158,11', ink: '#000' }
    : { accent: '#7C3AED', rgb: '124,58,237', ink: '#fff' };

  const tint = (alpha: number) => `rgba(${roleTheme.rgb},${alpha})`;
  /** Every tinted element shares this, so nothing arrives late. */
  const morph = 'background-color .5s ease, border-color .5s ease, box-shadow .5s ease, color .5s ease, background .5s ease';

  return (
    <MobileFrame>
      {overlayRoot && isLoading && createPortal(<LoadingOverlay message="Logging you in..." />, overlayRoot)}

      <div
        className="px-6 min-h-full flex flex-col justify-center relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg)', ['--role' as string]: roleTheme.accent }}
      >
        {/* One full-bleed gradient, centred.

            An earlier pass slid the origin 32% -> 68% with the selected tab, to
            keep the travelling light the old corner blooms had. It worked, and
            it also meant the screen was never symmetric in either state — the
            glow pooled toward one side and the logo sat off the axis of its own
            background. Colour alone carries the role now; the geometry stays
            still and centred. */}
        <AuthBackground
          accent={roleTheme.accent}
          transition="background .7s cubic-bezier(0.4,0,0.2,1)"
        />

        {/* A low bloom for depth, centred on the same axis. Pinned to a corner
            it was the other half of the asymmetry. */}
        <div
          className="absolute -bottom-32 w-[340px] h-[340px] rounded-full pointer-events-none"
          style={{
            zIndex: 0,
            background: `radial-gradient(circle, ${tint(0.14)} 0%, transparent 70%)`,
            left: '50%',
            transform: 'translateX(-50%)',
            transition: morph,
          }}
        />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 relative z-10">
          {/* Logo + wordmark. The separate "Welcome to Core Fitness" badge that
              used to sit above this said the same thing twice, directly above a
              logo and the word CORE FITNESS. */}
          <div className="text-center">
            {/* The ringed mark from the boot splash. The login screen used to
                show a rounded square with a glow, one frame after the splash
                had shown a ringed disc — the app changing its own logo between
                two consecutive screens. */}
            <div className="mb-4">
              <BrandMark
                accent={roleTheme.accent}
                counter={isTrainer ? '#7C3AED' : '#F59E0B'}
                transition={morph}
              />
            </div>
            <h1 className="display text-3xl text-white leading-none">Core Fitness</h1>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              Mamburao, Occidental Mindoro
            </p>
          </div>

          {/* Pending banner */}
          {pendingApproval && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
              style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <Clock size={15} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--color-secondary)' }}>
                  Your registration is waiting for approval
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Pay at the front desk and the gym activates your account on the spot.
                </p>
              </div>
            </motion.div>
          )}

          {/* Role — a segmented control with a sliding indicator, rather than
              two large cards with a floating tick. It is one choice between two
              options, which is what a segment is for, and it leaves the form
              above the fold on a small phone. */}
          <div>
            {/*
              One indicator that slides, rather than a `layoutId` pill handed
              between the two buttons.

              The layoutId version broke visibly: the pill rendered below the
              track, overlapping the caption. Shared-layout animation measures
              the element against the page, and this whole screen sits inside a
              `motion.div` animating `y: 20 → 0` — so the measurement is taken
              while an ancestor is mid-transform and the projection lands in the
              wrong place. Animating this element's own `x` is immune to that,
              because a transform on itself doesn't care what its parents are
              doing.

              The maths only works with no gap between the halves: the indicator
              is `50% - 4px` wide (half the track minus the 4px padding), and one
              button is exactly that too, so `x: 100%` of its own width lands it
              precisely on the second half.
            */}
            <div
              className="relative flex p-1 rounded-full"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              role="tablist"
            >
              <span
                aria-hidden
                className="absolute top-1 bottom-1 left-1 rounded-full pointer-events-none"
                style={{
                  width: 'calc(50% - 0.25rem)',
                  background: 'var(--role)',
                  // A CSS transition, not a framer `animate`. The position is
                  // then a plain function of state: even on a page that never
                  // gets an animation frame — a background tab, a locked phone
                  // — the pill is still *under the selected label*, it just
                  // doesn't glide there. framer drives from rAF, so in that
                  // state it wrote no transform at all and the pill stayed on
                  // "Member" while "Trainer" was selected. Verified by toggling
                  // with the page hidden.
                  transform: isTrainer ? 'translateX(100%)' : 'translateX(0%)',
                  // Slight overshoot — reads as a physical snap into the slot
                  // without the wobble a full spring gives on a 160px trip.
                  // The colour morph is slower than the slide on purpose: the
                  // pill lands first, then the screen catches up around it.
                  transition: `transform 0.34s cubic-bezier(0.34, 1.4, 0.64, 1), ${morph}`,
                  boxShadow: `0 4px 14px ${tint(0.4)}`,
                }}
              />

              {[
                { role: 'member' as Role, label: 'Member', icon: User },
                { role: 'trainer' as Role, label: 'Trainer', icon: Dumbbell },
              ].map(({ role, label, icon: Icon }) => {
                const isActive = selectedRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setSelectedRole(role)}
                    className="relative z-10 flex-1 h-10 rounded-full flex items-center justify-center gap-1.5 text-xs font-bold"
                    style={{
                      // Amber needs black ink, violet needs white — the label
                      // has to flip with the accent or the active tab becomes
                      // unreadable the moment the pill turns yellow.
                      color: isActive ? roleTheme.ink : 'var(--color-text-muted)',
                      // Lags the pill slightly so the label doesn't change
                      // before the colour has arrived under it.
                      transition: 'color 0.35s ease 0.08s',
                    }}
                  >
                    <span
                      className="flex items-center gap-1.5"
                      style={{
                        transform: isActive ? 'scale(1)' : 'scale(0.96)',
                        transition: 'transform 0.34s cubic-bezier(0.34, 1.4, 0.64, 1)',
                      }}
                    >
                      <Icon size={14} /> {label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Crossfades with the pill instead of swapping instantly. `mode="wait"`
                would leave the line blank for its exit, which on two lines of
                similar length reads as a flicker. */}
            <div className="h-4 mt-2 relative">
              <AnimatePresence initial={false}>
                <motion.p
                  key={selectedRole}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs text-center absolute inset-x-0"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {isTrainer ? 'Coaching tools, your schedule and your members' : 'Bookings, check-in and your progress'}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Login Form.
              No `key={selectedRole}` — that remounted the entire card on every
              toggle, so the whole form faded and slid each time you tapped
              Member/Trainer. Only the button's wording actually changes with
              the role, so only that animates now. It also meant React tore down
              the inputs mid-typing, which blurs the keyboard on a phone. */}
          <motion.form
            onSubmit={handleLogin}
            className="space-y-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{
                background: 'var(--color-surface)',
                // A whisper of the accent on the card edge and in its shadow —
                // enough that the card belongs to the role without competing
                // with the fields inside it.
                border: `1px solid ${tint(0.22)}`,
                boxShadow: `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px ${tint(0.06)}`,
                transition: morph,
              }}
            >
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    size={15}
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    /* Was `eya.lorenzana@email.com` — one real person's address
                       shown to every user as the example, the same mistake the
                       member profile made with her photo. */
                    placeholder="you@example.com"
                    className="field-input w-full rounded-xl pl-10 pr-4 h-12 text-sm text-white"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    readOnly={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    size={15}
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="field-input w-full rounded-xl pl-10 pr-11 h-12 text-sm text-white"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    readOnly={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileTap={{ scale: 0.985 }}
                className="w-full h-12 rounded-full font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                /* This button follows the role rather than staying amber.
                   Elsewhere the app reserves amber for primary actions and
                   violet for selection — here the role *is* the subject of the
                   screen, so the accent leads and the button goes with it.
                   Deliberate exception to the rule in DESIGN_SYSTEM.md. */
                style={{
                  background: 'var(--role)',
                  color: roleTheme.ink,
                  boxShadow: `0 8px 24px ${tint(0.3)}`,
                  transition: morph,
                }}
              >
                {/* The word swaps under a crossfade so the label doesn't snap
                    between "Member" and "Trainer" while the pill is still
                    travelling. Fixed-width wrapper keeps the arrow still. */}
                <span className="relative inline-flex items-center">
                  <span className="invisible">Sign in as Trainer</span>
                  <AnimatePresence initial={false} mode="wait">
                    <motion.span
                      key={isLoading ? 'loading' : selectedRole}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
                    >
                      {isLoading ? 'Signing in…' : `Sign in as ${isTrainer ? 'Trainer' : 'Member'}`}
                    </motion.span>
                  </AnimatePresence>
                </span>
                {!isLoading && <ArrowRight size={16} />}
              </motion.button>
            </div>
          </motion.form>

          {/* Footer */}
          <div className="text-center space-y-1.5">
            {/* Only members sign themselves up. A trainer account is created by
                the gym through the `create-trainer` Edge Function, which is the
                only path that can set `profiles.role = 'trainer'`. Self-signup
                cannot: `handle_new_member_signup` (0005) writes the literal
                'member', so a coach who followed this link would have created a
                member account and then been turned away by the role check above
                on the very next screen. Offering the link on this tab was an
                invitation into a dead end. */}
            {isTrainer ? (
              <p className="text-white/40 text-xs">
                Trainer accounts are created by the gym — ask the front desk.
              </p>
            ) : (
              <p className="text-white/40 text-xs">
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => navigate('/register')}
                  className="font-semibold hover:text-violet-300 transition-colors"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Sign Up
                </button>
              </p>
            )}
            <p className="text-xs text-white/25">
              <button onClick={() => navigate('/terms')} className="hover:text-white/40">
                Terms of Service
              </button>
              <span className="mx-1.5">•</span>
              <button onClick={() => navigate('/privacy')} className="hover:text-white/40">
                Privacy Policy
              </button>
            </p>
          </div>
        </motion.div>
      </div>
    </MobileFrame>
  );
}
