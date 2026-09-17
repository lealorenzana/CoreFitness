import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Minus, Plus, X } from '@phosphor-icons/react';
import { NocButton } from './noc';

/**
 * A one-question-per-screen flow, in the shape of the onboarding wizard.
 *
 * Logging used to mean a dense grid of seven number inputs appearing inline
 * under a button — fine on a laptop, hostile on a phone, where the on-screen
 * keyboard covers half of it and there is no sense of how much is left.
 *
 * Steps may be optional: a step whose `valid` is undefined can always be
 * advanced past, and its footer says "Skip" instead of "Next" while empty. That
 * matters here because most of what a member logs is genuinely optional — a
 * blank field has to reach the database as NULL, not as a zero.
 *
 * Rendered into `#phone-overlay-root` so it sits above the bottom nav.
 */

export interface FlowStep {
  id: string;
  /** The question, at 26px. Keep it short — it is the whole screen's headline. */
  title: string;
  hint?: string;
  /**
   * Omit entirely for a step that can always be skipped. Provide `false` to
   * block Next until the member has answered.
   */
  valid?: boolean;
  /** True when the member has put something in — switches "Skip" to "Next". */
  answered?: boolean;
  render: ReactNode;
}

export default function StepFlow({
  open,
  title,
  steps,
  submitLabel = 'Save',
  saving = false,
  initialStepId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Names the whole flow, e.g. "Log a measurement". */
  title: string;
  steps: FlowStep[];
  submitLabel?: string;
  saving?: boolean;
  /**
   * Which step to open on. Defaults to the first.
   *
   * This exists so a caller can open the flow *at the thing the member just
   * tapped* — the body map sends someone who tapped their waist straight to the
   * lower-body step rather than making them page past weight, height and body
   * fat to reach it. An unknown id falls back to the first step rather than
   * throwing, because the step list is built per render and can legitimately
   * lose a step between the tap and the open.
   */
  initialStepId?: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [index, setIndex] = useState(0);

  // Reset on each open, and clamp if the step list shrinks underneath us —
  // the goals flow drops a step when the metric changes to "something else".
  useEffect(() => {
    if (!open) return;
    const start = initialStepId ? steps.findIndex((s) => s.id === initialStepId) : 0;
    setIndex(start >= 0 ? start : 0);
    // `steps` is rebuilt every render by every caller, so depending on it here
    // would reset the member to step one on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStepId]);
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, steps.length - 1)));
  }, [steps.length]);

  const root = typeof document !== 'undefined' ? document.getElementById('phone-overlay-root') : null;
  if (!root || steps.length === 0) return null;

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const blocked = step.valid === false;
  const optional = step.valid === undefined && !step.answered;

  const back = () => (index === 0 ? onClose() : setIndex((i) => i - 1));
  const next = () => (isLast ? onSubmit() : setIndex((i) => i + 1));

  return createPortal(
    // An always-mounted wrapper, OUTSIDE AnimatePresence, carrying the only
    // pointer-events declaration in the dialog.
    //
    // `#phone-overlay-root` is `pointer-events: none`, so a portalled child has
    // to opt back in. That used to be a static `pointer-events-auto` class on
    // the motion.div itself, which meant the *exiting* copy kept eating taps:
    // **AnimatePresence does not unmount an exiting child until its animation
    // completes**, and on a page that is not compositing — a backgrounded tab,
    // a locked phone — it never completes. Measured: the dialog was still in
    // the DOM at opacity 0 with pointer-events auto 2.5 seconds after Close,
    // silently swallowing every tap on the screen underneath.
    //
    // Moving the declaration onto the motion.div as `open ? 'auto' : 'none'`
    // does **not** fix it, and that failure is the point worth remembering:
    // AnimatePresence re-renders an exiting child with its *last* props, so the
    // ternary is frozen at `open === true` and never re-evaluated. Only a node
    // that stays mounted sees `open` flip.
    //
    // The inner dialog therefore declares no pointer-events at all and inherits
    // from here. The exit animation still plays on a phone that is awake; a
    // stuck child on one that is not is inert.
    <div
      className="absolute inset-0"
      style={{ pointerEvents: open ? 'auto' : 'none' }}
    >
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          // No pointer-events here on purpose — see the wrapper above.
          className="absolute inset-0 flex flex-col"
          style={{ background: 'var(--color-bg)' }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Header: the way back, the way out, and how much is left — answered
              before the member starts typing. Back is a text row that says
              which way it goes ("Previous question"), never a bare arrow. */}
          <div className="flex-shrink-0" style={{ padding: '12px var(--gutter) 0' }}>
            <div className="flex items-center justify-between" style={{ gap: 12 }}>
              <button onClick={back} className="flex items-center"
                style={{ gap: 7, height: 44, fontSize: 13, color: 'var(--color-primary-300)' }}>
                <ArrowLeft size={15} /> {index === 0 ? 'Cancel' : 'Previous question'}
              </button>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid place-items-center flex-shrink-0"
                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Structure, so violet: a segment per question, lit up to here. */}
            <div className="flex" style={{ gap: 5, marginTop: 6 }}>
              {steps.map((s, i) => (
                <div
                  key={s.id}
                  className="flex-1"
                  style={{
                    height: 3, borderRadius: 2,
                    background: i <= index ? 'var(--color-primary)' : 'var(--color-surface-high)',
                    boxShadow: i === index ? '0 0 8px var(--color-primary)' : 'none',
                  }}
                />
              ))}
            </div>
            <p style={{ fontSize: 12, marginTop: 18, color: 'var(--color-text-muted)' }}>
              {title} · {index + 1} of {steps.length}
            </p>
          </div>

          {/* One step at a time. popLayout rather than wait: the exiting child
              never blocks the entering one, so a stalled animation can't leave
              the flow showing a step number with no content under it. */}
          <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: '0 var(--gutter)' }}>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
              >
                <h2 style={{
                  fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2,
                  marginTop: 8, color: 'var(--color-text-primary)',
                }}>
                  {step.title}
                </h2>
                {step.hint && (
                  <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
                    {step.hint}
                  </p>
                )}
                <div style={{ marginTop: 24, paddingBottom: 16 }}>{step.render}</div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* One action. "Skip" is itself the action on an optional step the
              member has left empty — the only honest word for advancing past a
              question with no answer. */}
          <div className="flex-shrink-0" style={{ padding: '12px var(--gutter) calc(16px + env(safe-area-inset-bottom))' }}>
            <NocButton
              variant={optional && !isLast ? 'ghost' : 'action'}
              className="w-full"
              style={{ height: 48, fontSize: 14.5 }}
              onClick={next}
              disabled={blocked || saving}
              icon={saving ? undefined : isLast ? <Check size={16} /> : undefined}
            >
              {saving ? 'Saving…' : isLast ? submitLabel : optional ? 'Skip' : (
                <span className="flex items-center" style={{ gap: 7 }}>Next <ArrowRight size={15} /></span>
              )}
            </NocButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>,
    root
  );
}

/**
 * The oversized single-value input these flows are built around.
 *
 * One number, set large and centred, flanked by two 48px nudge buttons. The
 * native stepper arrows are suppressed app-wide (see index.css): they are a
 * pair of ~8px targets nobody can hit on a phone, and they eat width from the
 * value itself. These replace them with something thumb-sized and stepped
 * sensibly per field — half a kilo, five minutes — rather than always by one.
 *
 * The buttons were briefly disabled while the field was empty, to stop anyone
 * tapping once and saving a figure they never measured. That was the wrong
 * trade: every step opens empty, so both buttons were dead exactly when a
 * member first reached for them, which reads as broken rather than careful.
 *
 * `seed` is the better answer. It is the member's own last reading for this
 * field, and the first tap jumps there instead of crawling up from zero — real
 * data, applied only on a deliberate tap, and sitting in an editable field they
 * must still press Save on.
 */
export function BigNumberInput({
  value,
  onChange,
  unit,
  step = 1,
  seed = null,
  seedLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  /** How much one tap of −/+ moves the value. */
  step?: number;
  /** The member's previous reading, if they have one. Never auto-filled. */
  seed?: number | null;
  /** What the seed was, e.g. "Last logged 73 kg on Aug 2". */
  seedLabel?: string;
  autoFocus?: boolean;
}) {
  const empty = value.trim() === '';

  const nudge = (direction: 1 | -1) => {
    // First tap on an empty field lands on the previous reading rather than
    // stepping away from zero — 140 taps to reach a body weight is not a
    // control, it is an obstacle.
    if (empty && seed != null) return onChange(String(seed));

    const current = empty ? 0 : Number(value);
    if (!Number.isFinite(current)) return;
    // Floating-point steps produce 72.30000000000001 without rounding, and that
    // is what would land in the database.
    const next = Math.max(0, Math.round((current + direction * step) * 100) / 100);
    onChange(String(next));
  };

  return (
    /* Border comes from the .bignum-panel rule, not from the style object
       below: an inline border cannot be overridden on focus. */
    <div>
    <div className="flex items-center justify-between" style={{ gap: 12 }}>
      <NudgeButton label={`Decrease by ${step}`} onClick={() => nudge(-1)}>
        <Minus size={19} />
      </NudgeButton>

      <div className="flex-1 min-w-0 flex items-baseline justify-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          autoFocus={autoFocus}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
          aria-label={unit ? `Value in ${unit}` : 'Value'}
          className="bignum bg-transparent border-none text-center min-w-0"
          style={{
            fontSize: 46,
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: 'var(--color-text-primary)',
            width: `${Math.max(2, value.length || 1)}ch`,
          }}
        />
        {unit && (
          <span className="flex-shrink-0" style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>
            {unit}
          </span>
        )}
      </div>

      <NudgeButton label={`Increase by ${step}`} onClick={() => nudge(1)} primary>
        <Plus size={19} />
      </NudgeButton>
    </div>

    {seedLabel && empty && (
      <button
        type="button"
        onClick={() => seed != null && onChange(String(seed))}
        className="w-full text-center"
        style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-primary-300)' }}
      >
        {seedLabel} · tap to reuse
      </button>
    )}
    </div>
  );
}

/** A 52px square. `primary` is the + side: adding is the action, so amber. */
function NudgeButton({
  label, onClick, children, primary,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid place-items-center flex-shrink-0"
      style={{
        width: 52, height: 52, borderRadius: 8,
        border: `1px solid ${primary ? 'var(--color-secondary)' : 'var(--color-hairline)'}`,
        color: primary ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
      }}
    >
      {children}
    </button>
  );
}

/** A full-width choice tile — the onboarding pattern for picking one of a list. */
export function ChoiceTile({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center"
      aria-pressed={selected}
      style={{
        gap: 12, minHeight: 52, padding: '10px 16px',
        background: selected ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)' : 'transparent',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
        borderRadius: 'var(--radius-btn)',
      }}
    >
      <span className="flex-1 min-w-0">
        <span className="block" style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{label}</span>
        {description && (
          <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
            {description}
          </span>
        )}
      </span>
      {selected && <Check size={16} className="flex-shrink-0" style={{ color: 'var(--color-primary-300)' }} />}
    </button>
  );
}
