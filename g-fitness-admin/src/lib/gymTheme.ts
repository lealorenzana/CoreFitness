/**
 * A gym's colour, on Nocturne's structure.
 *
 * Violet is Core Fitness's. A gym picks one of eight accents and it replaces
 * violet *only* — amber stays "what you can do next" everywhere, because that
 * role is about meaning, not brand (DESIGN_SYSTEM → Nocturne).
 *
 * Every accent ships the whole ramp the screens already use, so nothing has to
 * know which gym it is drawing. The 300 step is the text step: violet 600 is
 * 3.5:1 on the ground and unreadable as small text, and each ramp here is
 * checked at 4.5:1 or better by scripts/accent-contrast.mjs.
 */
export type AccentKey =
  | 'violet' | 'indigo' | 'blue' | 'sky' | 'cyan' | 'teal' | 'emerald'
  | 'lime' | 'amber' | 'orange' | 'red' | 'rose' | 'fuchsia' | 'slate';

interface Ramp {
  label: string;
  /** --color-primary, -hover, -lift, -deep, -light (the dark tint behind a selected row). */
  base: string; hover: string; lift: string; deep: string; light: string;
  c200: string; c300: string; c400: string; c600: string; c700: string; c800: string; c900: string;
}

export const ACCENTS: Record<AccentKey, Ramp> = {
  violet: { label: 'Violet', base: '#7C3AED', hover: '#6D28D9', lift: '#8B5CF6', deep: '#5B21B6', light: '#1E1333',
    c200: '#ddd6fe', c300: '#c4b5fd', c400: '#a78bfa', c600: '#7c3aed', c700: '#6d28d9', c800: '#5b21b6', c900: '#2e1065' },
  indigo: { label: 'Indigo', base: '#4F46E5', hover: '#4338CA', lift: '#6366F1', deep: '#3730A3', light: '#141634',
    c200: '#c7d2fe', c300: '#a5b4fc', c400: '#818cf8', c600: '#4f46e5', c700: '#4338ca', c800: '#3730a3', c900: '#1e1b4b' },
  blue: { label: 'Blue', base: '#2563EB', hover: '#1D4ED8', lift: '#3B82F6', deep: '#1E40AF', light: '#0E1A33',
    c200: '#bfdbfe', c300: '#93c5fd', c400: '#60a5fa', c600: '#2563eb', c700: '#1d4ed8', c800: '#1e40af', c900: '#172554' },
  teal: { label: 'Teal', base: '#0D9488', hover: '#0F766E', lift: '#14B8A6', deep: '#115E59', light: '#0A2220',
    c200: '#99f6e4', c300: '#5eead4', c400: '#2dd4bf', c600: '#0d9488', c700: '#0f766e', c800: '#115e59', c900: '#042f2e' },
  emerald: { label: 'Emerald', base: '#059669', hover: '#047857', lift: '#10B981', deep: '#065F46', light: '#082720',
    c200: '#a7f3d0', c300: '#6ee7b7', c400: '#34d399', c600: '#059669', c700: '#047857', c800: '#065f46', c900: '#022c22' },
  rose: { label: 'Rose', base: '#E11D48', hover: '#BE123C', lift: '#F43F5E', deep: '#9F1239', light: '#2B0D17',
    c200: '#fecdd3', c300: '#fda4af', c400: '#fb7185', c600: '#e11d48', c700: '#be123c', c800: '#9f1239', c900: '#4c0519' },
  orange: { label: 'Orange', base: '#EA580C', hover: '#C2410C', lift: '#F97316', deep: '#9A3412', light: '#2A1206',
    c200: '#fed7aa', c300: '#fdba74', c400: '#fb923c', c600: '#ea580c', c700: '#c2410c', c800: '#9a3412', c900: '#431407' },
  sky: { label: 'Sky', base: '#0284C7', hover: '#0369A1', lift: '#0EA5E9', deep: '#075985', light: '#081B2A',
    c200: '#bae6fd', c300: '#7dd3fc', c400: '#38bdf8', c600: '#0284c7', c700: '#0369a1', c800: '#075985', c900: '#082f49' },
  cyan: { label: 'Cyan', base: '#0891B2', hover: '#0E7490', lift: '#06B6D4', deep: '#155E75', light: '#072429',
    c200: '#a5f3fc', c300: '#67e8f9', c400: '#22d3ee', c600: '#0891b2', c700: '#0e7490', c800: '#155e75', c900: '#083344' },
  lime: { label: 'Lime', base: '#65A30D', hover: '#4D7C0F', lift: '#84CC16', deep: '#3F6212', light: '#131F07',
    c200: '#d9f99d', c300: '#bef264', c400: '#a3e635', c600: '#65a30d', c700: '#4d7c0f', c800: '#3f6212', c900: '#1a2e05' },
  amber: { label: 'Amber', base: '#D97706', hover: '#B45309', lift: '#F59E0B', deep: '#92400E', light: '#231604',
    c200: '#fde68a', c300: '#fcd34d', c400: '#fbbf24', c600: '#d97706', c700: '#b45309', c800: '#92400e', c900: '#451a03' },
  // Red and Rose are different colours, and a gym that asks for red means red.
  red: { label: 'Red', base: '#DC2626', hover: '#B91C1C', lift: '#EF4444', deep: '#991B1B', light: '#2A0B0B',
    c200: '#fecaca', c300: '#fca5a5', c400: '#f87171', c600: '#dc2626', c700: '#b91c1c', c800: '#991b1b', c900: '#450a0a' },
  fuchsia: { label: 'Fuchsia', base: '#C026D3', hover: '#A21CAF', lift: '#D946EF', deep: '#86198F', light: '#290A2C',
    c200: '#f5d0fe', c300: '#f0abfc', c400: '#e879f9', c600: '#c026d3', c700: '#a21caf', c800: '#86198f', c900: '#4a044e' },
  slate: { label: 'Slate', base: '#475569', hover: '#334155', lift: '#64748B', deep: '#1E293B', light: '#141A22',
    c200: '#e2e8f0', c300: '#cbd5e1', c400: '#94a3b8', c600: '#475569', c700: '#334155', c800: '#1e293b', c900: '#020617' },
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

// ---- a gym's own colour (0141) ------------------------------------------------------------------
// A gym may give a colour code instead of a preset. Its *hue* is kept; its
// brightness steps are borrowed from the nearest preset, whose readability
// scripts/accent-contrast.mjs proves — and the text shade is then raised until
// it reads at 4.5:1 on the app's background. The code itself is used as the
// fill whenever it is as light as the presets' fills are, so a brand colour
// that already works appears exactly.

const BG = '#0B0B12';
const hexToHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast between two colours. */
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
export const isColourCode = (v: string | null | undefined): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

const STOPS = ['base', 'hover', 'lift', 'deep', 'light', 'c200', 'c300', 'c400', 'c600', 'c700', 'c800', 'c900'] as const;
const BASE_LUM = ACCENT_KEYS.map((k) => lum(ACCENTS[k].base));
const [MIN_FILL, MAX_FILL] = [Math.min(...BASE_LUM), Math.max(...BASE_LUM)];

/** The ramp for a colour code — the gym's hue on the nearest preset's steps. */
export function rampFromCode(code: string): Ramp {
  const [h, s] = hexToHsl(code);
  const nearest: AccentKey = s < 0.12 ? 'slate' : ACCENT_KEYS.filter((k) => k !== 'slate').reduce((best, k) => {
    const dh = (a: number) => Math.min(Math.abs(a - h), 360 - Math.abs(a - h));
    return dh(hexToHsl(ACCENTS[k].base)[0]) < dh(hexToHsl(ACCENTS[best].base)[0]) ? k : best;
  }, 'violet' as AccentKey);
  const src = ACCENTS[nearest];
  const out = { label: 'Your colour' } as Ramp;
  for (const stop of STOPS) {
    const [, ss, sl] = hexToHsl(src[stop]);
    out[stop] = hslToHex(h, Math.max(0.2, Math.min(1, (ss + s) / 2)), sl);
  }
  const L = lum(code.toUpperCase());
  if (L >= MIN_FILL && L <= MAX_FILL) out.base = code.toUpperCase();
  // Text shades must read on the background, whatever the hue's own brightness.
  for (const stop of ['c300', 'c200', 'c400'] as const) {
    const [hh, ss, ll] = hexToHsl(out[stop]);
    let l = ll;
    while (contrast(out[stop], BG) < 4.5 && l < 0.97) { l += 0.02; out[stop] = hslToHex(hh, ss, l); }
  }
  return out;
}

/** A preset's ramp, or the ramp for a colour code; `fallback` for anything else. */
export function rampFor(key: string | null | undefined, fallback: AccentKey): Ramp {
  if (isColourCode(key)) return rampFromCode(key);
  return ACCENTS[(key ?? fallback) as AccentKey] ?? ACCENTS[fallback];
}

/**
 * Apply a gym's two colours. Called once the gym is known, and on a switch.
 *
 * `action` is the second role — what you can do next: book, renew, save, send.
 * It was always amber, which meant a gym that chose Rose got a red-and-yellow
 * app rather than its own (0112). NULL keeps amber, which is what every gym
 * had before the column existed.
 *
 * Both are set as CSS variables on the root, so a screen that was written
 * against `--color-primary` or `--color-secondary` needs no change at all.
 */
export function applyAccent(accent: string | null | undefined, action?: string | null): void {
  const ramp = rampFor(accent, 'violet');
  const s = document.documentElement.style;
  s.setProperty('--color-primary', ramp.base);
  s.setProperty('--color-primary-hover', ramp.hover);
  s.setProperty('--color-primary-lift', ramp.lift);
  s.setProperty('--color-primary-deep', ramp.deep);
  s.setProperty('--color-primary-light', ramp.light);
  s.setProperty('--color-primary-200', ramp.c200);
  s.setProperty('--color-primary-300', ramp.c300);
  s.setProperty('--color-primary-400', ramp.c400);
  s.setProperty('--color-primary-600', ramp.c600);
  s.setProperty('--color-primary-700', ramp.c700);
  s.setProperty('--color-primary-800', ramp.c800);
  s.setProperty('--color-primary-900', ramp.c900);
  document.documentElement.dataset.accent = ramp === ACCENTS.violet ? 'violet' : (accent as string);

  // The action role. Absent leaves the stylesheet's amber untouched rather
  // than writing it back — so a gym that never chose one is byte-identical to
  // how it rendered before this existed.
  if (!action) {
    ['', '-hover', '-light', '-200', '-300', '-700'].forEach((step) =>
      s.removeProperty(`--color-secondary${step}`));
    delete document.documentElement.dataset.accentAction;
    return;
  }
  const act = rampFor(action, 'amber');
  s.setProperty('--color-secondary', act.base);
  s.setProperty('--color-secondary-hover', act.hover);
  s.setProperty('--color-secondary-light', act.light);
  s.setProperty('--color-secondary-200', act.c200);
  s.setProperty('--color-secondary-300', act.c300);
  s.setProperty('--color-secondary-700', act.c700);
  document.documentElement.dataset.accentAction = action;
}
