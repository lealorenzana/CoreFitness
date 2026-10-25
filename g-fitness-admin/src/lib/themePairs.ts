import { rampFor } from './gymTheme';

/**
 * Ready-made pairs, grouped. A pair can name a preset or carry an exact colour
 * code; `rampFor()` keeps either readable (its text shade is lifted to 4.5:1,
 * proven over 2,160 codes by scripts/accent-contrast.mjs).
 */
export const PAIRS: { name: string; accent: string; action: string; group: string }[] = [
  { group: 'Classic', name: 'Core Fitness', accent: 'violet', action: 'amber' },
  { group: 'Classic', name: 'Forest', accent: 'emerald', action: 'lime' },
  { group: 'Classic', name: 'Ocean', accent: 'blue', action: 'sky' },
  { group: 'Classic', name: 'Lagoon', accent: 'teal', action: 'cyan' },
  { group: 'Classic', name: 'Sunset', accent: 'rose', action: 'orange' },
  { group: 'Classic', name: 'Ember', accent: 'red', action: 'amber' },
  { group: 'Classic', name: 'Neon', accent: 'indigo', action: 'fuchsia' },
  { group: 'Classic', name: 'Steel', accent: 'slate', action: 'lime' },
  { group: 'Bold', name: 'Royal', accent: '#4338CA', action: '#EAB308' },
  { group: 'Bold', name: 'Lava', accent: '#B91C1C', action: '#F97316' },
  { group: 'Bold', name: 'Berry', accent: 'fuchsia', action: 'rose' },
  { group: 'Bold', name: 'Electric', accent: '#2563EB', action: '#22D3EE' },
  { group: 'Bold', name: 'Volt', accent: '#7C3AED', action: '#A3E635' },
  { group: 'Bold', name: 'Inferno', accent: '#DC2626', action: '#FACC15' },
  { group: 'Bold', name: 'Grape', accent: '#7E22CE', action: '#F472B6' },
  { group: 'Bold', name: 'Citrus', accent: 'orange', action: 'lime' },
  { group: 'Calm', name: 'Matcha', accent: '#4D7C0F', action: '#84CC16' },
  { group: 'Calm', name: 'Mint', accent: '#0F766E', action: '#34D399' },
  { group: 'Calm', name: 'Midnight', accent: '#1E3A8A', action: '#38BDF8' },
  { group: 'Calm', name: 'Coffee', accent: '#8B5E3C', action: '#D4A373' },
  { group: 'Calm', name: 'Sand', accent: '#A16207', action: '#FBBF24' },
  { group: 'Calm', name: 'Stone', accent: 'slate', action: 'sky' },
  { group: 'Pinoy', name: 'Bandila', accent: '#0038A8', action: '#FCD116' },
  { group: 'Pinoy', name: 'Mayon', accent: '#CE1126', action: '#FCD116' },
  { group: 'Pinoy', name: 'Palawan', accent: '#0E7490', action: '#2DD4BF' },
  { group: 'Pinoy', name: 'Mangga', accent: '#C2410C', action: '#FDE047' },
];
export const GROUPS = ['Classic', 'Bold', 'Calm', 'Pinoy'];

/** A pair drawn as the member app draws its gradients: the state colour, its light shade, then the action colour. */
export function gradientOf(accent: string, action: string | null): string {
  const a = rampFor(accent, 'violet');
  const b = rampFor(action || null, 'amber');
  return `linear-gradient(90deg, ${a.base}, ${a.c300} 55%, ${b.base})`;
}
