import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Minus, Plus, X } from 'lucide-react';

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
  /** The question, in the display face. Keep it short — it sets in Anton. */
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
          {/* Header: progress across the top, so "how much is left" is answered
              before the member starts typing. */}
          <div className="px-4 pt-4 pb-3 flex-shrink-0">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                {title} · {index + 1} of {steps.length}
              </p>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex gap-1.5">
              {steps.map((s, i) => (
                <div
                  key={s.id}
                  className="h-1 flex-1 rounded-full transition-colors"
                  style={{ background: i <= index ? 'var(--color-secondary)' : 'var(--color-surface-high)' }}
                />
              ))}
            </div>
          </div>

          {/* One step at a time. popLayout rather than wait: the exiting child
              never blocks the entering one, so a stalled animation can't leave
              the flow showing a step number with no content under it. */}
          <div className="flex-1 overflow-y-auto px-4 scrollbar-hide">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
              >
                <h2 className="display text-2xl text-white mt-2">{step.title}</h2>
                {step.hint && (
                  <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    {step.hint}
                  </p>
                )}
                <div className="mt-5 pb-4">{step.render}</div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            className="flex-shrink-0 flex items-center gap-2 px-4 py-3"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <button
              onClick={back}
              className="h-12 px-4 rounded-full font-semibold text-sm flex items-center gap-1.5 flex-shrink-0"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <ArrowLeft size={16} /> {index === 0 ? 'Cancel' : 'Back'}
            </button>

            <button
              onClick={next}
              disabled={blocked || saving}
              className="flex-1 h-12 rounded-full font-semibold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--color-secondary)' }}
            >
              {saving ? 'Saving…' : isLast ? (
                <>
                  <Check size={16} /> {submitLabel}
                </>
              ) : (
                <>
                  {optional ? 'Skip' : 'Next'} <ArrowRight size={16} />
                </>
              )}
            </button>
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
    <div
      className="bignum-panel flex items-center justify-between gap-2 p-4"
      style={{
        background: 'var(--color-surface-raised)',
        borderRadius: 'var(--radius-panel)',
      }}
    >
      <NudgeButton label={`Decrease by ${step}`} onClick={() => nudge(-1)}>
        <Minus size={20} />
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
          className="bignum bg-transparent border-none text-center text-white min-w-0"
          style={{
            fontSize: 46,
            fontWeight: 700,
            lineHeight: 1.1,
            width: `${Math.max(2, value.length || 1)}ch`,
          }}
        />
        {unit && (
          <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
            {unit}
          </span>
        )}
      </div>

      <NudgeButton label={`Increase by ${step}`} onClick={() => nudge(1)}>
        <Plus size={20} />
      </NudgeButton>
    </div>

    {seedLabel && empty && (
      <button
        type="button"
        onClick={() => seed != null && onChange(String(seed))}
        className="w-full mt-2 py-2 rounded-full text-xs font-semibold"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        {seedLabel} · tap to reuse
      </button>
    )}
    </div>
  );
}

function NudgeButton({
  label, onClick, children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
      style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
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
      className="w-full p-4 text-left flex items-center gap-3"
      style={{
        background: selected ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-card)',
      }}
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description && (
          <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {description}
          </span>
        )}
      </span>
      {selected && (
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          <Check size={14} className="text-white" />
        </span>
      )}
    </button>
  );
}
