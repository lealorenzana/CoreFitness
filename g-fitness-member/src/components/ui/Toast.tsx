import * as React from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

/**
 * Standardized toast system for the member app.
 * Renders inside the phone frame so toasts stay constrained to the mobile viewport.
 *
 * Usage:
 *   import { toast } from '@/components/ui/Toast';
 *   toast.success('Saved!');
 *   toast.error('Something went wrong');
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
  setTimeout(() => {
    _setToasts?.((prev) => prev.filter((t) => t.id !== id));
  }, 3000);
};

export const toast = {
  success: (m: string) => push(m, 'success'),
  error:   (m: string) => push(m, 'error'),
  info:    (m: string) => push(m, 'info'),
  warning: (m: string) => push(m, 'warning'),
};

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle  size={16} style={{ color: 'var(--color-primary)' }} />,
  error:   <XCircle      size={16} style={{ color: 'var(--color-secondary)' }} />,
  info:    <Info         size={16} style={{ color: 'var(--color-primary)' }} />,
  warning: <AlertTriangle size={16} style={{ color: 'var(--color-secondary)' }} />,
};

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  return (
    <div className="absolute top-12 left-3 right-3 z-[300] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="phone-toast pointer-events-auto flex items-center gap-2 px-3 py-2.5 rounded-xl shadow-lg text-xs font-semibold"
          style={{
            background: 'var(--color-surface-raised)',
            border: `1px solid ${
              t.type === 'success' ? 'rgba(124,58,237,0.40)' :
              t.type === 'error'   ? 'rgba(245,158,11,0.40)' :
              t.type === 'warning' ? 'rgba(245,158,11,0.40)' :
                                     'rgba(96,165,250,0.4)'
            }`,
            color: '#fff',
          }}
        >
          {ICONS[t.type]}
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
