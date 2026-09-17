import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Labelled form controls.
 *
 * Two things this fixes. First, every control in the app used to re-declare the
 * same `className` + inline `style` pair, and most of them ended it with
 * `focus:outline-none` and nothing in its place — so no control had a visible
 * focus state. The look now lives in `.field-input` (src/index.css), which does
 * have one.
 *
 * Second, labels. A placeholder is not a label: it only renders while the input
 * is empty, so a pre-filled field's placeholder is never seen at all. Anything
 * whose meaning isn't obvious from its own value needs a real label above it.
 */

interface FieldProps {
  label: string;
  /** Secondary line under the label — units, constraints, why it matters. */
  hint?: string;
  children: ReactNode;
  className?: string;
  /**
   * Wrapping element. `label` (default) associates the text with a single
   * control for free; use `div` when the "control" is a group of buttons or
   * chips, where a `<label>` would have nothing valid to point at.
   */
  as?: 'label' | 'div';
}

export function Field({ label, hint, children, className, as = 'label' }: FieldProps) {
  const Tag = as;
  return (
    <Tag className={cn('block', className)}>
      <span className="block" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      {hint && (
        <span className="block" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
          {hint}
        </span>
      )}
      <span className="block" style={{ marginTop: 8 }}>{children}</span>
    </Tag>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('field-input', className)} {...props} />;
}

/**
 * Validation message under a control.
 *
 * These used to carry a `text-yellow` class, which was never a real class in
 * this app — the old `tailwind.config.js` was ignored under Tailwind v4 with no
 * `@config` directive, so it emitted nothing and the message rendered in the
 * inherited white. A failed field looked identical to a hint.
 */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    // Amber, as the toasts are: the design system has no red, and a problem you
    // can fix is the next thing to do.
    <p style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-secondary)' }} role="alert">
      {children}
    </p>
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('field-input', className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('field-input resize-none', className)} {...props} />;
}

export default Field;
