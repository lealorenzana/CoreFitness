import * as React from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

/**
 * Top-right toast system, auto-dismiss after 3s.
 * Palette: violet for success/info, yellow for warnings/errors.
 */
type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _counter = 0;
let _setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>> | null = null;

export const toast = {
  success: (message: string) => _add(message, 'success'),
  error:   (message: string) => _add(message, 'error'),
  info:    (message: string) => _add(message, 'info'),
};

function _add(message: string, type: ToastType) {
  const id = ++_counter;
  _setToasts?.((prev) => [...prev, { id, message, type }]);
  setTimeout(() => _setToasts?.((prev) => prev.filter((t) => t.id !== id)), 3000);
}

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  const tone = (t: ToastType) =>
    t === 'success' ? { icon: <CheckCircle  size={16} style={{ color: 'var(--color-primary)' }} />,   border: 'rgba(124,58,237,0.4)' }
    : t === 'error' ? { icon: <AlertTriangle size={16} style={{ color: 'var(--color-secondary)' }} />, border: 'rgba(245,158,11,0.4)' }
    :                 { icon: <Info          size={16} style={{ color: 'var(--color-primary)' }} />,   border: 'rgba(124,58,237,0.4)' };

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const tones = tone(t.type);
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 min-w-[280px] max-w-sm px-4 py-3 rounded-2xl text-white text-sm shadow-xl"
            style={{
              background: 'var(--color-surface-raised)',
              border: `1px solid ${tones.border}`,
            }}
          >
            {tones.icon}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{ color: 'var(--color-text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
