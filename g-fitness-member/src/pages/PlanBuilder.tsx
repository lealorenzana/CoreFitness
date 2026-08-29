import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, RefreshCw, ClipboardList, AlertTriangle } from 'lucide-react';
import { panelStyle } from '../components/ui/Card';
import { getCurrentMemberId } from '../services/bookingService';
import { getMemberProfile } from '../lib/api/members';
import { getCurrentPlan, savePlan, type SavedPlan } from '../lib/api/workoutPlans';
import { buildPlan, type PlanInputs, type Experience, type Preference } from '../utils/planBuilder';
import { renderPlan } from '../utils/planRender';
import { asFocus, FOCUS_LABEL, type TrainingFocus } from '../utils/trainingFocus';
import { errorMessage } from '../utils/errorMessage';

/**
 * The training plan builder.
 *
 * A short set of questions, then a programme. Deterministic — the same answers
 * always produce the same plan, generated on the phone with no network call and
 * no model. `planBuilder.ts` explains why it is built that way and where a
 * hybrid would slot in.
 *
 * ## It is not called AI, here or anywhere
 *
 * This project has a standing rule that the assistant features are rule-based
 * and the vocabulary stays honest. A screen that said "AI plan" would be
 * claiming a capability the code does not have, in front of a panel that can
 * read the code.
 *
 * ## Two answers are already known
 *
 * `experience_level` and `training_focus` are on the member's profile, so the
 * flow starts with them filled in rather than asking a member to tell the app
 * something it already stores. They stay editable — a member whose focus has
 * changed should be able to build against the new one and update their profile
 * separately, not be blocked here.
 */

type Step = 'intro' | 'questions' | 'plan';

const EXPERIENCES: { id: Experience; label: string; hint: string }[] = [
  { id: 'beginner', label: 'Starting out', hint: 'New, or coming back after a long break' },
  { id: 'intermediate', label: 'Training regularly', hint: 'Comfortable with the main lifts' },
  { id: 'advanced', label: 'Experienced', hint: 'Years of consistent training' },
];

const FOCUSES: TrainingFocus[] = ['bulking', 'cutting', 'maintaining'];

const PREFERENCES: { id: Preference; label: string }[] = [
  { id: 'gym', label: 'Gym floor' },
  { id: 'classes', label: 'Classes' },
  { id: 'both', label: 'Both' },
];

const MINUTES: PlanInputs['sessionMinutes'][] = [30, 45, 60, 90];

/**
 * One question: a label and a row of mutually exclusive chips.
 *
 * Defined at module scope, NOT inside PlanBuilder. Declaring a component in
 * the render body creates a brand-new component *type* on every render, so
 * React unmounts and remounts the whole subtree each time instead of updating
 * it - throwing away DOM state and any focus inside it. It renders correctly
 * either way, which is what makes the mistake easy to keep.
 */
function Choice<T extends string | number>({
  label, options, value, onPick,
}: {
  label: string;
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="p-4 rounded-2xl" style={panelStyle}>
    <p className="text-xs font-bold text-white mb-2.5">{label}</p>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={String(o.id)}
            onClick={() => onPick(o.id)}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors"
            style={{
              background: on ? 'var(--color-primary)' : 'var(--color-surface-high)',
              color: on ? '#fff' : 'var(--color-text-secondary)',
              border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
            }}
          >
            {o.label}
            {o.hint && (
              <span className="block text-[10px] font-normal mt-0.5" style={{ color: on ? 'rgba(255,255,255,0.75)' : 'var(--color-text-muted)' }}>
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);
}

export default function PlanBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('intro');
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<PlanInputs>({
    experience: 'beginner',
    focus: 'maintaining',
    daysPerWeek: 3,
    sessionMinutes: 60,
    preference: 'gym',
    limitations: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) { setError('Your session could not be verified. Please sign in again.'); return; }
        if (cancelled) return;
        setMemberId(id);

        const [profile, current] = await Promise.all([
          getMemberProfile(id).catch(() => null),
          getCurrentPlan(id).catch(() => null),
        ]);
        if (cancelled) return;

        // Seed from what the profile already knows, so the flow does not ask a
        // member to re-answer something the app stores.
        // `getMemberProfile` returns { profile, member } — the columns live on
        // `member`, not on the profile row beside it.
        const row = profile?.member;
        setAnswers((a) => ({
          ...a,
          experience: (['beginner', 'intermediate', 'advanced'] as const)
            .find((e) => e === row?.experience_level) ?? a.experience,
          focus: asFocus(row?.training_focus) ?? a.focus,
        }));

        if (current) { setSaved(current); setStep('plan'); }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Could not load your plan.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const generate = async () => {
    if (!memberId) return;
    setSaving(true);
    setError(null);
    try {
      const spec = buildPlan(answers);
      // Saved before it is shown: a plan the member reads and then loses on a
      // reload is worse than one that fails loudly here.
      const row = await savePlan(memberId, spec);
      setSaved(row);
      setStep('plan');
    } catch (err) {
      setError(errorMessage(err, 'Could not save your plan.'));
    } finally {
      setSaving(false);
    }
  };

  const Header = (
    <div className="flex items-center gap-3 flex-shrink-0 pb-4">
      <button
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/workouts'))}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
        aria-label="Back"
      >
        <ArrowLeft size={18} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="display text-xl text-white leading-none">Your plan</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          A training week built around your answers
        </p>
      </div>
      {step === 'plan' && saved && (
        <button
          onClick={() => setStep('questions')}
          className="px-3 h-10 rounded-full text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
        >
          <RefreshCw size={14} /> Rebuild
        </button>
      )}
    </div>
  );

  const Err = error && (
    <div
      className="mb-3 px-3 py-2.5 rounded-xl flex items-start gap-2 text-[11px] leading-relaxed"
      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}
    >
      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {Header}
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'var(--color-surface-high)' }} />
          ))}
        </div>
      </div>
    );
  }

  // ── The plan ──────────────────────────────────────────────────────────────
  if (step === 'plan' && saved) {
    const view = renderPlan(saved.spec);
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {Header}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-4 pb-4">
          {Err}

          <div className="p-4 rounded-2xl" style={panelStyle}>
            <p className="display text-lg text-white leading-tight">{view.headline}</p>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {view.intro}
            </p>
            <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
              Built {new Date(saved.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {' · '}
              {FOCUS_LABEL[saved.spec.inputs.focus]}
            </p>
          </div>

          {/* Straight from the spec — never through the renderer. A reworded
              set count is a set count nothing verified. */}
          {saved.spec.days.map((d) => (
            <div key={d.label} className="p-4 rounded-2xl" style={panelStyle}>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <p className="text-sm font-bold text-white">{d.label}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{d.focus}</p>
              </div>
              <div className="space-y-2.5">
                {d.exercises.map((e) => (
                  <div key={e.name} className="flex gap-3">
                    <span
                      className="text-[11px] font-bold tabular-nums flex-shrink-0 pt-0.5"
                      style={{ color: 'var(--color-secondary)', minWidth: 58 }}
                    >
                      {e.sets} × {e.reps}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-white leading-snug">{e.name}</p>
                      {e.note && (
                        <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                          {e.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {view.sections.map((s) => (
            <div key={s.title} className="p-4 rounded-2xl" style={panelStyle}>
              <p className="text-sm font-bold text-white mb-2">{s.title}</p>
              <ul className="space-y-1.5">
                {s.lines.map((l) => (
                  <li key={l} className="text-xs leading-relaxed flex gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <span style={{ color: 'var(--color-primary)' }}>•</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <button
            onClick={() => navigate('/member/trainers')}
            className="w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            Book a coach to review this <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {Header}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          {Err}
          <div className="p-5 rounded-2xl text-center" style={panelStyle}>
            <span
              className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'var(--color-primary-light)' }}
            >
              <ClipboardList size={26} style={{ color: 'var(--color-primary)' }} />
            </span>
            <p className="display text-lg text-white">Build a training week</p>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Five questions, then a week of sessions you can start on. It uses the
              equipment this gym actually has, and it is built from a fixed set of
              rules — not a chatbot guessing, so it says the same thing twice.
            </p>
            <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              It is a starting point, not a prescription. Anything about an injury,
              a health condition or what you should eat belongs with a coach or a
              doctor.
            </p>
            <button
              onClick={() => setStep('questions')}
              className="w-full h-12 mt-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              Start <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Questions ──────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {Header}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 pb-4"
      >
        {Err}

        <Choice
          label="How much training have you done?"
          options={EXPERIENCES}
          value={answers.experience}
          onPick={(experience) => setAnswers((a) => ({ ...a, experience }))}
        />

        <Choice
          label="What are you training for right now?"
          options={FOCUSES.map((f) => ({ id: f, label: FOCUS_LABEL[f] }))}
          value={answers.focus}
          onPick={(focus) => setAnswers((a) => ({ ...a, focus }))}
        />

        <Choice
          label="How many days a week can you realistically train?"
          options={[2, 3, 4, 5, 6].map((d) => ({ id: d, label: `${d} days` }))}
          value={answers.daysPerWeek}
          onPick={(daysPerWeek) => setAnswers((a) => ({ ...a, daysPerWeek }))}
        />

        <Choice
          label="How long is a session for you?"
          options={MINUTES.map((m) => ({ id: m, label: `${m} min` }))}
          value={answers.sessionMinutes}
          onPick={(sessionMinutes) => setAnswers((a) => ({ ...a, sessionMinutes }))}
        />

        <Choice
          label="Where do you prefer to train?"
          options={PREFERENCES}
          value={answers.preference}
          onPick={(preference) => setAnswers((a) => ({ ...a, preference }))}
        />

        <div className="p-4 rounded-2xl" style={panelStyle}>
          <p className="text-xs font-bold text-white mb-1">Anything to work around?</p>
          <p className="text-[10px] mb-2.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            An old injury, a sore shoulder. This does not change the exercises —
            it tells you to have a coach adjust them, because that is not
            something an app should decide.
          </p>
          <input
            value={answers.limitations}
            onChange={(e) => setAnswers((a) => ({ ...a, limitations: e.target.value }))}
            placeholder="Optional"
            className="field-input w-full h-11 px-3 rounded-xl text-xs text-white"
            style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
          />
        </div>

        <button
          onClick={generate}
          disabled={saving}
          className="w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          {saving ? 'Saving…' : <>Build my plan <ArrowRight size={16} /></>}
        </button>
      </motion.div>
    </div>
  );
}
