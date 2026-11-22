import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';

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
  title, subtitle, steps, step, onStep, canNext, onNext, onBack, onClose, finishLabel, busy, children, hideNav, tabs, flagged,
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
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const last = step === steps.length - 1;
  // Design V2 (owner, 2026-11-22: "still AI slop"): flat, a hairline, the steps as a quiet line of tabs
  // (no progress bar, no numbered bubbles), outlined fields, and normal-sized buttons on the right.
  return createPortal((
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-xl flex flex-col max-h-[calc(100vh-2rem)]"
        style={{ background: 'var(--color-surface)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.12)', boxShadow: '0 24px 64px -24px rgba(0,0,0,0.5)' }}>
        <div className="px-6 pt-5" style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold text-white">{title}</h2>
              {subtitle && <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
            </div>
            <button aria-label="Close" onClick={onClose} className="w-8 h-8 -mr-1.5 grid place-items-center rounded-lg hover:bg-white/[0.06] flex-none"
              style={{ color: 'var(--color-text-secondary)' }}><X size={16} /></button>
          </div>
          {hideNav ? <div className="h-4" /> : (
            <ol className="flex gap-5 mt-4 overflow-x-auto" aria-label={tabs ? 'Sections' : 'Steps'} role={tabs ? 'tablist' : undefined}>
              {steps.map((t, i) => {
                const reach = tabs || i <= step;
                const here = i === step;
                const passed = !tabs && i < step;
                const flag = flagged?.includes(i);
                return (
                  <li key={t} className="flex-none">
                    <button type="button" disabled={!reach} onClick={() => onStep(i)} role={tabs ? 'tab' : undefined} aria-selected={tabs ? here : undefined}
                      aria-current={!tabs && here ? 'step' : undefined}
                      className="flex items-center gap-1.5 pb-2.5 -mb-px text-[13px] font-medium whitespace-nowrap disabled:cursor-default enabled:hover:text-white transition-colors"
                      style={{ borderBottom: `2px solid ${here ? 'var(--color-primary)' : 'transparent'}`,
                        color: here ? 'var(--color-text-primary)' : reach ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                      {passed && <Check size={13} style={{ color: 'var(--color-text-secondary)' }} />}
                      {t}
                      {flag && <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--color-secondary)' }} aria-label="needs fixing" />}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">{children}</div>
        {!hideNav && (
          <div className="px-6 py-4 flex items-center gap-2" style={{ borderTop: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }}>
            {!tabs && <span className="text-[12.5px] mr-auto tabular-nums" style={{ color: 'var(--color-text-muted)' }}>Step {step + 1} of {steps.length}</span>}
            {tabs && <span className="mr-auto" />}
            <button type="button" className="h-9 px-4 rounded-lg text-[13px] font-medium transition-colors hover:bg-white/[0.05] disabled:opacity-50"
              style={{ border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.14)', color: 'var(--color-text-primary)' }}
              onClick={!tabs && step > 0 ? onBack : onClose} disabled={busy}>{!tabs && step > 0 ? 'Back' : 'Cancel'}</button>
            <button type="button" className="v2-btn h-9 px-4 rounded-lg text-[13px] font-semibold disabled:cursor-not-allowed"
              // Disabled is neutral, not a faded action colour (that read as a muddy brown).
              style={canNext && !busy ? { background: 'var(--v2-act, #F59E0B)', color: 'var(--v2-on-act, #1a1206)', border: '1px solid transparent' }
                : { background: 'rgb(var(--hair-rgb, 255 255 255) / 0.06)', color: 'var(--color-text-muted)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.1)' }}
              onClick={onNext} disabled={!canNext || busy} data-step-next>
              {busy ? 'Working…' : tabs || last ? finishLabel : 'Next'}
            </button>
          </div>
        )}
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
