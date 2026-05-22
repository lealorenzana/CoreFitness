import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Target, Dumbbell, Heart, Flame, Clock, Users } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';

const STEPS = ['Goals', 'Experience', 'Schedule', 'Interests'];

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

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      // Save preferences and complete onboarding
      const prefs = { goals, experience, schedule, interests };
      localStorage.setItem('onboarding_complete', 'true');
      localStorage.setItem('fitness_preferences', JSON.stringify(prefs));
      navigate('/member/home');
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding_complete', 'true');
    navigate('/member/home');
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
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{g.desc}</p>
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
                        <p className="text-[11px] mt-0.5" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)' }}>
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
                        <p className="text-[11px] mt-0.5" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)' }}>
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
