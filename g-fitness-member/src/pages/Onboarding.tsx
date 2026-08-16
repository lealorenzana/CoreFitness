import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Target, Dumbbell, Heart, Flame, Clock, Users, Camera } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import Avatar from '../components/ui/Avatar';
import { supabase } from '../lib/supabaseClient';
import {
  getCurrentMemberId, setExperienceLevel, markOnboardingComplete,
} from '../services/bookingService';
import { getMyProfile } from '../lib/api/profiles';
import { uploadMyAvatar } from '../lib/api/avatars';
import { errorMessage } from '../utils/errorMessage';

/**
 * The photo step lives here rather than in Register on purpose.
 *
 * This project requires email confirmation, so `signUp()` returns no session
 * and the new user is not authenticated during registration — the storage
 * policy `avatars_insert_own` needs `auth.uid()` to match the folder, so an
 * upload there is impossible, not just awkward. Holding the file until after
 * login does not work either: the member confirms their email in another tab
 * or on another device and signs in fresh, so the page holding that File is
 * long gone. Onboarding runs on first login, where they *are* authenticated.
 */
const STEPS = ['Goals', 'Experience', 'Schedule', 'Interests', 'Photo'];

// ── Step data ────────────────────────────────────────────────────────────────
const FITNESS_GOALS = [
  { id: 'lose-weight', label: 'Lose Weight', icon: Flame, desc: 'Burn fat and slim down' },
  { id: 'build-muscle', label: 'Build Muscle', icon: Dumbbell, desc: 'Gain strength and size' },
  { id: 'stay-fit', label: 'Stay Fit', icon: Heart, desc: 'Maintain overall health' },
  { id: 'flexibility', label: 'Flexibility', icon: Target, desc: 'Improve mobility and balance' },
  { id: 'endurance', label: 'Endurance', icon: Clock, desc: 'Boost stamina and cardio' },
];

const EXPERIENCE_LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'New to fitness or returning after a break' },
  { id: 'intermediate', label: 'Intermediate', desc: '6+ months of consistent training' },
  { id: 'advanced', label: 'Advanced', desc: '2+ years of dedicated training' },
];

const SCHEDULE_OPTIONS = [
  { id: '2-3', label: '2-3 days/week', desc: 'Light commitment' },
  { id: '4-5', label: '4-5 days/week', desc: 'Moderate commitment' },
  { id: '6-7', label: '6-7 days/week', desc: 'Dedicated athlete' },
];

const INTERESTS = [
  { id: 'strength', label: 'Strength Training' },
  { id: 'hiit', label: 'HIIT' },
  { id: 'yoga', label: 'Yoga' },
  { id: 'boxing', label: 'Boxing' },
  { id: 'crossfit', label: 'CrossFit' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'stretching', label: 'Stretching' },
  { id: 'dance', label: 'Dance Fitness' },
  { id: 'swimming', label: 'Swimming' },
  { id: 'martial-arts', label: 'Martial Arts' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<string[]>([]);
  const [experience, setExperience] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [myName, setMyName] = useState('');

  // Name is only needed for the initials preview on the photo step.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await getMyProfile().catch(() => null);
      if (!profile || cancelled) return;
      setMyName(`${profile.first_name} ${profile.last_name}`.trim());
      setPhotoUrl(profile.photo_url ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const { publicUrl } = await uploadMyAvatar(file);
      setPhotoUrl(publicUrl);
    } catch (err) {
      setPhotoError(errorMessage(err, 'Could not upload that photo'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const toggleGoal = (id: string) =>
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);

  const toggleInterest = (id: string) =>
    setInterests(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const canProceed = () => {
    if (step === 0) return goals.length > 0;
    if (step === 1) return experience !== null;
    if (step === 2) return schedule !== null;
    if (step === 3) return interests.length > 0;
    return true;
  };

  /**
   * Where onboarding lets you out.
   *
   * It used to be `/member/home` unconditionally. A member who has just
   * registered is `pending_approval` until the gym takes their payment, and
   * `RoleProtectedRoute` requires `active` — so finishing onboarding bounced
   * straight back to the login screen with no explanation, which reads as the
   * signup having failed.
   *
   * Home only when the status actually allows it; otherwise back to sign-in,
   * where the pending banner already explains what happens next.
   */
  const leave = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate('/login', { replace: true }); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', session.user.id)
      .single();

    if (profile?.status === 'active') {
      navigate('/member/home', { replace: true });
      return;
    }

    // Not usable yet. Sign out so the app isn't left holding a session that
    // every guard will reject, and land on Login with the reason showing.
    await supabase.auth.signOut().catch(() => undefined);
    ['isLoggedIn', 'trainerMode', 'memberId'].forEach((k) => localStorage.removeItem(k));
    navigate('/login', { replace: true, state: { pendingApproval: true } });
  };

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }

    // See `leave()` below for where this ends up.

    // Experience level goes to member_profiles, where the class recommendations
    // actually read it (migration 0016 lets a member set their own). Goals,
    // schedule and interests have no column yet, so they stay in the local blob
    // rather than being silently dropped — they feed nothing today either way.
    if (experience === 'beginner' || experience === 'intermediate' || experience === 'advanced') {
      const memberId = await getCurrentMemberId().catch(() => null);
      if (memberId) {
        // At this point the member is still `pending_approval` and has no
        // `member_profiles` row — approval creates it. `setExperienceLevel`
        // parks the answer and applies it the moment the row exists; it used
        // to write into nothing and report success, so this question was
        // decorative for every member who ever answered it.
        //
        // Still swallowed: onboarding must never strand someone on this screen.
        await setExperienceLevel(memberId, experience).catch(() => undefined);
      }
    }

    // Recorded on the member's row, not this browser (0033). The old
    // localStorage flag meant a second phone, a desktop or a reinstalled PWA
    // replayed the whole flow for someone who had already finished it.
    await markOnboardingComplete(await getCurrentMemberId() ?? '').catch(() => undefined);
    localStorage.setItem('fitness_preferences', JSON.stringify({ goals, experience, schedule, interests }));
    await leave();
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = async () => {
    // Skipping is finishing — otherwise it reappears on the next login.
    await markOnboardingComplete(await getCurrentMemberId() ?? '').catch(() => undefined);
    await leave();
  };

  return (
    <MobileFrame>
      <div className="h-full flex flex-col px-5 pt-14 pb-6" style={{ background: 'var(--color-bg)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          {step > 0 ? (
            <button onClick={handleBack}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <ArrowLeft size={16} />
            </button>
          ) : <div className="w-9" />}
          <div className="flex items-center gap-1.5">
            <Users size={14} style={{ color: 'var(--color-secondary)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
              {step + 1}/{STEPS.length}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: 'var(--color-border)' }}>
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: i <= step ? '100%' : '0%' }}
                transition={{ duration: 0.3 }}
                style={{ background: 'var(--color-secondary)' }}
              />
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            {/* ─── Step 0: Goals ─── */}
            {step === 0 && (
              <motion.div key="goals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">What are your goals?</h1>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Select one or more fitness goals
                  </p>
                </div>
                <div className="space-y-2">
                  {FITNESS_GOALS.map(g => {
                    const Icon = g.icon;
                    const isSelected = goals.includes(g.id);
                    return (
                      <button key={g.id} onClick={() => toggleGoal(g.id)}
                        className="w-full p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                        style={{
                          background: 'var(--color-surface-raised)',
                          border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: isSelected ? 'var(--color-primary)' : 'var(--color-primary-light)' }}>
                            <Icon size={18} style={{ color: isSelected ? '#fff' : 'var(--color-primary)' }} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{g.label}</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{g.desc}</p>
                          </div>
                          {isSelected && (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center"
                              style={{ background: 'var(--color-primary)' }}>
                              <Check size={12} className="text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ─── Step 1: Experience ─── */}
            {step === 1 && (
              <motion.div key="experience" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Your experience level?</h1>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    This helps us personalize your recommendations
                  </p>
                </div>
                <div className="space-y-2">
                  {EXPERIENCE_LEVELS.map(lvl => {
                    const isSelected = experience === lvl.id;
                    return (
                      <button key={lvl.id} onClick={() => setExperience(lvl.id)}
                        className="w-full p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                        style={{
                          background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                          border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        }}>
                        <p className="text-sm font-bold" style={{ color: isSelected ? '#fff' : 'var(--color-text-primary)' }}>
                          {lvl.label}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)' }}>
                          {lvl.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ─── Step 2: Schedule ─── */}
            {step === 2 && (
              <motion.div key="schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">How often do you train?</h1>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    We'll suggest classes that fit your schedule
                  </p>
                </div>
                <div className="space-y-2">
                  {SCHEDULE_OPTIONS.map(opt => {
                    const isSelected = schedule === opt.id;
                    return (
                      <button key={opt.id} onClick={() => setSchedule(opt.id)}
                        className="w-full p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                        style={{
                          background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                          border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        }}>
                        <p className="text-sm font-bold" style={{ color: isSelected ? '#fff' : 'var(--color-text-primary)' }}>
                          {opt.label}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)' }}>
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ─── Step 3: Interests ─── */}
            {step === 3 && (
              <motion.div key="interests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">What interests you?</h1>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Pick activities you'd like to try
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map(item => {
                    const isSelected = interests.includes(item.id);
                    return (
                      <button key={item.id} onClick={() => toggleInterest(item.id)}
                        className="px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                        style={{
                          background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                          border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          color: isSelected ? '#fff' : 'var(--color-text-secondary)',
                        }}>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ─── Step 4: Photo (optional) ─── */}
            {step === 4 && (
              <motion.div key="photo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Add a photo</h1>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Optional — helps the front desk recognise you at check-in
                  </p>
                </div>

                <div className="flex flex-col items-center gap-4 py-4">
                  <div style={{ opacity: photoBusy ? 0.5 : 1 }}>
                    <Avatar name={myName} photoUrl={photoUrl} size={112} />
                  </div>

                  <label htmlFor="onboarding-photo"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer transition-all active:scale-95"
                    style={{ background: 'var(--color-secondary)', color: '#000' }}>
                    <Camera size={14} />
                    {photoBusy ? 'Uploading…' : photoUrl ? 'Choose a different photo' : 'Choose a photo'}
                  </label>
                  <input id="onboarding-photo" type="file" accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoPick} disabled={photoBusy} className="hidden" />

                  {photoError && (
                    <p className="text-xs text-center" style={{ color: '#f87171' }} role="alert">{photoError}</p>
                  )}
                  {!photoUrl && !photoError && (
                    <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                      No photo? Your initials will be shown instead.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer buttons */}
        <div className="pt-4 space-y-2">
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="w-full h-12 rounded-full font-bold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.97]"
            style={{ background: 'var(--color-secondary)' }}
          >
            {step === STEPS.length - 1 ? 'COMPLETE SETUP' : 'CONTINUE'}
            {step < STEPS.length - 1 && <ArrowRight size={14} />}
          </button>
          <button onClick={handleSkip}
            className="w-full h-10 rounded-full text-xs font-semibold transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>
            Skip for now
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}
