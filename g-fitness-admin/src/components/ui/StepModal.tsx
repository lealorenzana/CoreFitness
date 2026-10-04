import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button from './Button';

/**
 * A form in steps (2026-10-04) — Add member, Add trainer, Add staff. One
 * question at a time, a progress line you can click back along, Back/Next at
 * the bottom, and a body that scrolls inside the window rather than pushing
 * the buttons off it. The page owns the steps and what "ready" means.
 */
export default function StepModal({
  title, subtitle, steps, step, onStep, canNext, onNext, onBack, onClose, finishLabel, busy, children, hideNav,
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
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const last = step === steps.length - 1;
  return createPortal((
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="p-5 pb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white">{title}</h2>
              {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
            </div>
            <button aria-label="Close" onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--color-text-secondary)' }}><X size={18} /></button>
          </div>
          {!hideNav && (
            <ol className="flex gap-2 mt-3" aria-label="Steps">
              {steps.map((t, i) => (
                <li key={t} className="flex-1 min-w-0">
                  <button type="button" disabled={i > step} onClick={() => onStep(i)} className="w-full text-left disabled:cursor-default">
                    <span className="block h-1 rounded-full" style={{ background: i <= step ? 'var(--color-primary)' : 'var(--color-border)' }} />
                    <span className="block text-[11px] mt-1 font-semibold truncate" style={{ color: i === step ? '#fff' : 'var(--color-text-secondary)' }}>{i + 1}. {t}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">{children}</div>
        {!hideNav && (
          <div className="p-4 flex gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <Button variant="ghost" className="flex-1" onClick={step > 0 ? onBack : onClose} disabled={busy}>{step > 0 ? 'Back' : 'Cancel'}</Button>
            <Button variant={last ? 'secondary' : 'primary'} className="flex-1" onClick={onNext} disabled={!canNext || busy}>
              {busy ? 'Working…' : last ? finishLabel : 'Next'}
            </Button>
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
      <span className="block text-[12px] font-semibold text-white">{label}</span>
      {hint && <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{hint}</span>}
      <span className="block mt-1.5">{children}</span>
      {error && <span className="block text-[11px] mt-1" style={{ color: 'var(--color-secondary)' }}>{error}</span>}
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
            className="h-9 px-3.5 rounded-lg text-xs font-semibold"
            style={{ background: on ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: on ? '#fff' : 'var(--color-text-secondary)',
              border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
