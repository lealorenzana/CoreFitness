import * as React from 'react';
import { CheckCircle, WarningCircle, Info, X } from '@phosphor-icons/react';

/**
 * The toast (Nocturne redesign).
 *
 *   import { toast } from '../components/ui/Toast';
 *   toast.success('Saved');
 *
 * **Above the bar, not under the status bar.** A toast reports the result of
 * something the member just did with their thumb, so it appears near the thumb
 * — and never over the header, where it used to cover the title of the screen it
 * was reporting on.
 *
 * Colour by role, never by traffic light: a good result is violet (a state you
 * now have), a refusal or warning is amber (something to act on). Info had a
 * light-blue edge — a third accent this palette does not have — and is violet.
 */

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _counter = 0;
let _setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>> | null = null;

const push = (message: string, type: ToastType) => {
  const id = ++_counter;
  _setToasts?.((prev) => [...prev, { id, message, type }]);
  // Refusals stay a little longer: they are usually a sentence to read, and a
  // confirmation is usually a word to glance at.
  setTimeout(() => {
    _setToasts?.((prev) => prev.filter((t) => t.id !== id));
  }, type === 'error' || type === 'warning' ? 4000 : 2600);
};

export const toast = {
  success: (m: string) => push(m, 'success'),
  error:   (m: string) => push(m, 'error'),
  info:    (m: string) => push(m, 'info'),
  warning: (m: string) => push(m, 'warning'),
};

const ROLE: Record<ToastType, string> = {
  success: 'var(--color-primary-400)',
  info: 'var(--color-primary-400)',
  error: 'var(--color-secondary)',
  warning: 'var(--color-secondary)',
};

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute z-[300] flex flex-col pointer-events-none"
      style={{
        left: 'var(--gutter)', right: 'var(--gutter)', gap: 8,
        bottom: 'calc(var(--bar-height) + env(safe-area-inset-bottom) + 12px)',
      }}
    >
      {toasts.map((t) => {
        const Icon = t.type === 'success' ? CheckCircle : t.type === 'info' ? Info : WarningCircle;
        return (
          <div
            key={t.id}
            className="phone-toast pointer-events-auto flex items-center"
            style={{
              gap: 10, padding: '12px 14px', borderRadius: 10,
              background: 'var(--color-surface)',
              boxShadow: '0 0 0 1px rgba(233, 233, 237, 0.18), 0 10px 30px rgba(0, 0, 0, 0.6)',
              fontSize: 13, color: 'var(--color-text-primary)',
            }}
          >
            <Icon size={17} weight="fill" className="flex-shrink-0" style={{ color: ROLE[t.type] }} />
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Dismiss"
              className="grid place-items-center flex-shrink-0"
              style={{ width: 28, height: 28, margin: -6, color: 'var(--color-text-muted)' }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
