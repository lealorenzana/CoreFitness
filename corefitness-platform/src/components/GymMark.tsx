import { useState } from 'react';

/** The gyms' colour keys (0112), the same swatches as g-fitness-admin/src/lib/accents.ts. */
const SWATCH: Record<string, string> = {
  violet: '#7C3AED', indigo: '#4F46E5', blue: '#2563EB', teal: '#0D9488', emerald: '#059669', rose: '#E11D48',
  orange: '#EA580C', sky: '#0284C7', cyan: '#0891B2', lime: '#65A30D', amber: '#D97706', red: '#DC2626',
  fuchsia: '#C026D3', slate: '#475569',
};

/**
 * A gym as the platform shows it: its own logo (0134), or — when it has none,
 * or the picture will not load — its initials in its own colour. Never the Core
 * Fitness mark: that is the service, not the gym (0116's rule, here too).
 */
export default function GymMark({ name, logoUrl, accent, size = 42 }: {
  name: string; logoUrl?: string | null; accent?: string | null; size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  // A gym may use its own colour code (0141) rather than a preset key.
  const colour = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : SWATCH[accent ?? 'violet'] ?? SWATCH.violet;
  const box = { width: size, height: size, borderRadius: size * 0.3, flex: 'none' as const };

  if (logoUrl && !broken) {
    return (
      <img src={logoUrl} alt={`${name} logo`} onError={() => setBroken(true)}
        style={{ ...box, objectFit: 'cover', background: 'var(--surface-high)', border: '1px solid var(--hairline)' }} />
    );
  }
  return (
    <span aria-label={`${name}, no logo yet`} role="img"
      style={{ ...box, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${colour}, ${colour}99)` }}>
      {initials}
    </span>
  );
}
