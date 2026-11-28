import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import GymMascot from './GymMascot';

/**
 * A form in steps (2026-10-04): Add member, Add trainer, Add staff. One
 * question at a time, a progress line you can click back along, Back/Next at
 * the bottom, and a body that scrolls inside the window rather than pushing
 * the buttons off it. The page owns the steps and what "ready" means.
 *
 * `tabs` (2026-10-20, Edit trainer): the same sections as tabs — every one
 * open at once, and the footer is Cancel + Save rather than Back/Next — so
 * editing asks exactly what adding asked, in the same places.
 */
export default function StepModal({
  title, subtitle, steps, step, onStep, canNext, onNext, onBack, onClose, finishLabel, busy, children, hideNav, tabs, flagged, art, sayLine,
}: {
  title: string;
  subtitle?: string;
  steps: string[];
  step: number;
  onStep: (i: number) => void;
  canNext: boolean;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  finishLabel: string;
  busy?: boolean;
  children: React.ReactNode;
  /** The done screen has its own buttons. */
  hideNav?: boolean;
  /** Free tabs and a Save footer — editing what a wizard created. */
  tabs?: boolean;
  /** Steps with a problem to fix, marked on the tab. */
  flagged?: number[];
  /** The mascot on the side (the kettlebell when not given), and what it says. */
  art?: string;
  sayLine?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const last = step === steps.length - 1;
  // The floating page (owner, 2026-11-28: one design for every window): the steps on the gym's colour with a
  // mascot, the questions on the right, Back/Next at the foot. Same props, so every wizard follows.
  const say = sayLine ?? (hideNav ? 'All set.' : tabs ? `Editing: ${steps[step]}.` : `Step ${step + 1} of ${steps.length}: ${steps[step]}.`);
  return createPortal((
    <div className="am-root" role="dialog" aria-modal="true" aria-label={title} data-step-modal>
      <div className="am-scrim" onClick={onClose} />
      <div className="am-win sm-win">
        <aside className="am-side">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {!hideNav && (
            <ol className="am-parts" aria-label={tabs ? 'Sections' : 'Steps'} role={tabs ? 'tablist' : undefined}>
              {steps.map((t, i) => {
                const reach = tabs || i <= step;
                const here = i === step;
                const passed = !tabs && i < step;
                const flag = flagged?.includes(i);
                return (
                  <li key={t}>
                    <button type="button" disabled={!reach} onClick={() => onStep(i)} className={here ? 'on' : ''}
                      role={tabs ? 'tab' : undefined} aria-selected={tabs ? here : undefined} aria-current={!tabs && here ? 'step' : undefined}>
                      <span className={`n ${passed ? 'ok' : ''}`}>{passed ? <Check size={12} /> : i + 1}</span>
                      <span className="flex-1 min-w-0 truncate">{t}</span>
                      {flag && <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--color-secondary)' }} aria-label="needs fixing" />}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="am-buddy" aria-hidden>
            <p key={say} className="am-say">{say}</p>
            <GymMascot src={art ?? '/images/admin-art/mascot-kettlebell.webp'} />
          </div>
        </aside>
        <section className="am-main">
          <button type="button" aria-label="Close" onClick={onClose} className="am-x"><X size={16} /></button>
          <div className="am-form space-y-5">{children}</div>
          {!hideNav && (
            <footer className="am-foot">
              <span className="am-sum">{tabs ? '' : `Step ${step + 1} of ${steps.length}`}</span>
              <button type="button" className="am-btn" onClick={!tabs && step > 0 ? onBack : onClose} disabled={busy}>{!tabs && step > 0 ? 'Back' : 'Cancel'}</button>
              <button type="button" className="am-btn go" onClick={onNext} disabled={!canNext || busy} data-step-next>
                {busy ? 'Working…' : tabs || last ? finishLabel : 'Next'}
              </button>
            </footer>
          )}
        </section>
      </div>
    </div>
  ), document.body);
}

/** A labelled field inside a step: 12px label, an optional line saying why it is asked. */
export function StepField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    // A group, not a <label>: a label around chips would press the first chip when its words are clicked.
    // Every control inside carries its own aria-label.
    <div className="block">
      <span className="block text-[13px] font-medium text-white">{label}</span>
      {hint && <span className="block text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{hint}</span>}
      <span className="block mt-2">{children}</span>
      {error && <span className="block text-[12px] mt-1.5" style={{ color: 'var(--color-secondary)' }}>{error}</span>}
    </div>
  );
}

/** Choices as chips: known answers are picked, never typed. */
export function ChipPick<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className="v2-chip">
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
