import { useEffect, useState } from 'react';
import { Chip } from '../ui/noc';
import { colorModeChoice, onColorMode, setColorMode, type ColorMode } from '../../lib/colorMode';

/**
 * Light, dark, or the phone's own setting (0234) — saved on the account, so it
 * follows the person to a new phone. Changes the app at once.
 */
export default function Appearance() {
  const [mode, setMode] = useState<ColorMode>(colorModeChoice());
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => onColorMode(setMode), []);
  return (
    <section data-appearance>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 18 }}>Appearance</p>
      <div className="flex" style={{ gap: 8, marginTop: 10 }}>
        {([['system', 'Same as my phone'], ['light', 'Light'], ['dark', 'Dark']] as [ColorMode, string][]).map(([m, label]) => (
          <Chip key={m} label={label} on={mode === m} onClick={() => void setColorMode(m).then(setErr)} />
        ))}
      </div>
      <p style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
        {err ?? 'Saved on your account — it follows you to any phone you sign in on.'}
      </p>
    </section>
  );
}
