import * as React from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

/**
 * Toasts, bottom centre (Design V2, owner 2026-11-22: "enhance the notification design"): a solid, flat
 * strip with a hairline, the gym's colour on a success mark, amber for a problem, the words plain. A problem
 * stays twice as long. Announced to screen readers; motion is CSS (v2-toast in v2.css), off under reduced motion.
 */
type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _counter = 0;
let _setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>> | null = null;

// eslint-disable-next-line react-refresh/only-export-components -- a helper shared with this component; only hot reload in development is affected
export const toast = {
  success: (message: string) => _add(message, 'success'),
  error:   (message: string) => _add(message, 'error'),
  info:    (message: string) => _add(message, 'info'),
};

function _add(message: string, type: ToastType) {
  const id = ++_counter;
  _setToasts?.((prev) => [...prev, { id, message, type }]);
  setTimeout(() => _setToasts?.((prev) => prev.filter((t) => t.id !== id)), type === 'error' ? 6000 : 3500);
}

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  const icon = (t: ToastType) =>
    t === 'success' ? <CheckCircle size={16} style={{ color: 'var(--color-primary)' }} />
    : t === 'error' ? <AlertTriangle size={16} style={{ color: 'var(--color-secondary)' }} />
    : <Info size={16} style={{ color: 'var(--color-text-secondary)' }} />;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col-reverse items-center gap-2 pointer-events-none"
      role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} data-toast={t.type}
          className="v2-toast pointer-events-auto flex items-center gap-2.5 max-w-[min(92vw,440px)] pl-3.5 pr-1.5 h-11 rounded-[10px] text-[13.5px]"
          style={{
            background: 'var(--raised-solid, var(--color-surface-raised))',
            color: 'var(--color-text-primary)',
            border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.12)',
            boxShadow: '0 12px 32px -12px rgba(0,0,0,0.45)',
          }}>
          <span className="flex-none">{icon(t.type)}</span>
          <span className="flex-1 min-w-0 truncate" title={t.message}>{t.message}</span>
          <button type="button" aria-label="Dismiss"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="flex-none w-8 h-8 grid place-items-center rounded-md hover:bg-white/[0.06]"
            style={{ color: 'var(--color-text-muted)' }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
