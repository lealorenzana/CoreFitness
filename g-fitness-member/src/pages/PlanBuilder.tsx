import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SkeletonList } from '../components/ui/Skeleton';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, NocButton, Panel, SectionHead } from '../components/ui/noc';
import { getCurrentMemberId } from '../services/bookingService';
import { getMemberProfile } from '../lib/api/members';
import { getCurrentPlan, savePlan, type SavedPlan } from '../lib/api/workoutPlans';
import { buildPlan, type PlanInputs, type Experience, type Preference } from '../utils/planBuilder';
import { renderPlan } from '../utils/planRender';
import { asFocus, FOCUS_LABEL, type TrainingFocus } from '../utils/trainingFocus';
import { errorMessage } from '../utils/errorMessage';
import FeatureLock from '../components/ui/FeatureLock';
import StepFlow, { ChoiceTile } from '../components/ui/StepFlow';
import { useFeatures } from '../hooks/useFeatures';
import { isEnabled } from '../lib/api/planFeatures';

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
 * The answers to one question, as a set of mutually exclusive targets.
 *
 * No card and no label of its own: `StepFlow` puts the question in the display
 * face above this and gives the body its padding. What used to be here was six
 * bordered cards stacked on one screen, each with its own small label and a row
 * of 28px chips — the whole interview at once, which is the shape that made the
 * screen feel like a form to fill in rather than a few things to answer.
 *
 * Stacks full width when the options carry a hint and sits two across when they
 * do not: "Training regularly / Comfortable with the main lifts" needs a line
 * to itself, and "3 days" very much does not.
 *
 * Module scope, NOT inside PlanBuilder. A component declared in a render body
 * is a brand-new component *type* every render, so React unmounts and remounts
 * the subtree instead of updating it — throwing away DOM state and any focus
 * inside it. It renders correctly either way, which is what makes the mistake
 * easy to keep.
 */
function Options<T extends string | number>({
  options, value, onPick,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  const stacked = options.some((o) => o.hint);
  return (
    <div className="grid" style={{ gap: 8, gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))' }}>
      {options.map((o) => (
        <ChoiceTile
          key={String(o.id)}
          label={o.label}
          description={o.hint}
          selected={o.id === value}
          onClick={() => onPick(o.id)}
        />
      ))}
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
  // Building a plan is a paid feature (0049). Reading one you already have is
  // not — the RLS split in that migration allows select/update/delete and gates
  // only insert, and this screen mirrors it exactly.
  const { features } = useFeatures();
  const mayBuild = isEnabled(features, 'plan_builder');
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

  const title = (
    <PageTitle back fallback="/member/workouts" title="Your plan" subtitle="A training week built around your answers" />
  );

  const Err = error && (
    <p role="alert" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-secondary)' }}>{error}</p>
  );

  if (loading) {
    return (
      <Page>
        {title}
        <SkeletonList count={3} />
      </Page>
    );
  }

  /**
   * The interview, one question a screen.
   *
   * Six panels stacked on one scroll is a form. The same six questions in the
   * app's own onboarding shape — progress across the top, one question at a
   * time, big targets, Back and Next — is an interview, and this is the screen
   * the whole feature is: answer these and you get a week.
   *
   * `StepFlow` portals to `#phone-overlay-root`, so it sits above the bar and
   * over whichever screen returned below. The page underneath stays mounted, and
   * closing returns to it with nothing re-fetched.
   *
   * The last question is the only optional one — `valid` omitted rather than
   * `true`, which is what turns its Next into "Skip". A blank injury note has
   * to stay blank: this project does not put words in a member's mouth about
   * their own body.
   */
  const flow = (
    <StepFlow
      open={step === 'questions'}
      title="Build your week"
      submitLabel="Build my plan"
      saving={saving}
      onClose={() => setStep(saved ? 'plan' : 'intro')}
      onSubmit={generate}
      steps={[
        {
          id: 'experience',
          title: 'How much training have you done?',
          hint: 'It sets how much volume the week starts with.',
          valid: true,
          render: (
            <Options
              options={EXPERIENCES}
              value={answers.experience}
              onPick={(experience) => setAnswers((a) => ({ ...a, experience }))}
            />
          ),
        },
        {
          id: 'focus',
          title: 'What are you training for?',
          valid: true,
          render: (
            <Options
              options={FOCUSES.map((f) => ({ id: f, label: FOCUS_LABEL[f] }))}
              value={answers.focus}
              onPick={(focus) => setAnswers((a) => ({ ...a, focus }))}
            />
          ),
        },
        {
          id: 'days',
          title: 'How many days a week?',
          hint: 'Pick the number you can actually keep to, not the best week you have ever had.',
          valid: true,
          render: (
            <Options
              options={[2, 3, 4, 5, 6].map((d) => ({ id: d, label: `${d} days` }))}
              value={answers.daysPerWeek}
              onPick={(daysPerWeek) => setAnswers((a) => ({ ...a, daysPerWeek }))}
            />
          ),
        },
        {
          id: 'minutes',
          title: 'How long is a session?',
          valid: true,
          render: (
            <Options
              options={MINUTES.map((m) => ({ id: m, label: `${m} min` }))}
              value={answers.sessionMinutes}
              onPick={(sessionMinutes) => setAnswers((a) => ({ ...a, sessionMinutes }))}
            />
          ),
        },
        {
          id: 'where',
          title: 'Where do you want to train?',
          valid: true,
          render: (
            <Options
              options={PREFERENCES}
              value={answers.preference}
              onPick={(preference) => setAnswers((a) => ({ ...a, preference }))}
            />
          ),
        },
        {
          id: 'limitations',
          title: 'Anything to work around?',
          hint: 'An old injury, a sore shoulder. This does not change the exercises — it tells you to have a coach adjust them, because that is not something an app should decide.',
          answered: answers.limitations.trim().length > 0,
          render: (
            <input
              value={answers.limitations}
              onChange={(e) => setAnswers((a) => ({ ...a, limitations: e.target.value }))}
              placeholder="Optional"
              className="field-input"
            />
          ),
        },
      ]}
    />
  );

  // ── The plan ──────────────────────────────────────────────────────────────
  if (step === 'plan' && saved) {
    const view = renderPlan(saved.spec);
    return (
      <Page>
        {title}
        {Err}

        <Panel glow="structure" filled>
          <Eyebrow>
            Built {new Date(saved.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' · '}{FOCUS_LABEL[saved.spec.inputs.focus]}
          </Eyebrow>
          <p style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.3, marginTop: 8, color: 'var(--color-text-primary)' }}>
            {view.headline}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, color: 'var(--color-text-secondary)' }}>{view.intro}</p>
          {mayBuild && (
            <button onClick={() => setStep('questions')} style={{ fontSize: 13, marginTop: 12, color: 'var(--color-primary-300)' }}>
              Answer again and rebuild
            </button>
          )}
        </Panel>

        {/* Straight from the spec — never through the renderer. A reworded set
            count is a set count nothing verified. */}
        {saved.spec.days.map((d) => (
          <section key={d.label}>
            <SectionHead title={d.label} meta={d.focus} />
            <div style={{ marginTop: 4 }}>
              {d.exercises.map((e, i) => (
                <div key={e.name}>
                  <div className="flex items-start" style={{ gap: 12, padding: '11px 0' }}>
                    <span className="flex-none tabular-nums" style={{ width: 62, fontSize: 13, color: 'var(--color-secondary)' }}>
                      {e.sets} × {e.reps}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block" style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{e.name}</span>
                      {e.note && (
                        <span className="block" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                          {e.note}
                        </span>
                      )}
                    </span>
                  </div>
                  {i < d.exercises.length - 1 && <div className="hair" />}
                </div>
              ))}
            </div>
          </section>
        ))}

        {view.sections.map((s) => (
          <section key={s.title}>
            <Eyebrow mark>{s.title}</Eyebrow>
            <ul className="flex flex-col" style={{ gap: 8, marginTop: 10 }}>
              {s.lines.map((l) => (
                <li key={l} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{l}</li>
              ))}
            </ul>
          </section>
        ))}

        <NocButton variant="action" onClick={() => navigate('/member/trainers')} className="w-full">
          Book a coach to review this
        </NocButton>
        {flow}
      </Page>
    );
  }

  // ── Not on this plan ──────────────────────────────────────────────────────
  // Reached only when there is no saved plan to show, because the `step ===
  // 'plan'` branch above returns first. A member who built a plan while
  // subscribed keeps reading it — which is exactly what 0049's policy split
  // allows, and the reason that split exists.
  if (!mayBuild) {
    return (
      <Page>
        {title}
        <FeatureLock feature="plan_builder">{null}</FeatureLock>
      </Page>
    );
  }

  // ── Intro, and the floor under the flow ───────────────────────────────────
  // No condition: the questions are an overlay, so `step === 'questions'` has to
  // leave a screen mounted beneath them, or closing lands on a blank page.
  return (
    <Page>
      {title}
      {Err}
      <Panel glow="structure" filled>
        <p style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>Build a training week</p>
        <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, color: 'var(--color-text-secondary)' }}>
          Six short questions, the last one optional, then a week of sessions you can start on. It sticks to a
          barbell, dumbbells, a bench and a pull-up bar, and it is built from a fixed set of rules — not a chatbot
          guessing, so the same answers always give the same week.
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 10, color: 'var(--color-text-muted)' }}>
          It is a starting point, not a prescription. Anything about an injury, a health condition or what you
          should eat belongs with a coach or a doctor.
        </p>
      </Panel>
      <NocButton variant="action" onClick={() => setStep('questions')} className="w-full">Start</NocButton>
      {flow}
    </Page>
  );
}
