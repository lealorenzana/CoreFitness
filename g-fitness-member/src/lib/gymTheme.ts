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
export type AccentKey = 'violet' | 'indigo' | 'blue' | 'teal' | 'emerald' | 'rose' | 'orange' | 'slate';

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
  slate: { label: 'Slate', base: '#475569', hover: '#334155', lift: '#64748B', deep: '#1E293B', light: '#141A22',
    c200: '#e2e8f0', c300: '#cbd5e1', c400: '#94a3b8', c600: '#475569', c700: '#334155', c800: '#1e293b', c900: '#020617' },
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

/** Apply a gym's accent. Called once the gym context is known, and on a switch. */
export function applyAccent(accent: string | null | undefined): void {
  const ramp = ACCENTS[(accent ?? 'violet') as AccentKey] ?? ACCENTS.violet;
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
}
