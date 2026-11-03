import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { onColorMode, resolvedMode, setColorMode } from '../../lib/colorMode';

/**
 * Light or dark, beside the bell (0234). One tap flips the app and saves the
 * choice on the account — the same choice the member app reads, so it follows
 * the person everywhere. Until they tap, the computer's own setting decides.
 */
export default function ModeToggle() {
  const [mode, setMode] = useState(resolvedMode());
  useEffect(() => onColorMode(() => setMode(resolvedMode())), []);
  const next = mode === 'light' ? 'dark' : 'light';
  return (
    <button type="button" onClick={() => void setColorMode(next)} data-mode-toggle
      aria-label={next === 'light' ? 'Switch to light mode' : 'Switch to dark mode'}
      data-tip={next === 'light' ? 'Light mode — saved on your account' : 'Dark mode — saved on your account'}
      className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
      {mode === 'light' ? <Moon size={16} style={{ color: 'var(--color-text-secondary)' }} /> : <Sun size={16} style={{ color: 'var(--color-text-secondary)' }} />}
    </button>
  );
}
