import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { onColorMode, resolvedMode, setDeviceMode } from '../../lib/colorMode';

/**
 * Light or dark on the sign-in screens (the owner, 2026-11-07: "the login is light mode but there's no
 * switch"). Before sign-in the choice belongs to this phone (lib/colorMode.ts → setDeviceMode); once
 * signed in, the account's own choice in Settings takes over.
 */
export default function ModeSwitch() {
  const [mode, setMode] = useState(resolvedMode);
  useEffect(() => onColorMode(() => setMode(resolvedMode())), []);
  const next = mode === 'light' ? 'dark' : 'light';
  return (
    <button type="button" data-mode-switch onClick={() => setDeviceMode(next)}
      aria-label={next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode'}
      className="grid place-items-center noc-press"
      style={{ width: 40, height: 40, borderRadius: 12, color: 'var(--color-text-secondary)',
        background: 'var(--color-surface)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.14)' }}>
      {mode === 'light' ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}
