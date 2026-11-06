import { supabase } from './supabaseClient';
import { getGymApp } from './api/gymApp';
import { rampFor } from './gymTheme';
import { PREMIUM_THEMES } from './premiumThemes';

/**
 * The owner's admin app wears its gym's look (2026-11-02): the accent pair the
 * members see, and the premium theme's ground, surfaces and gradient (0233).
 *
 * The redesigned pages draw from their own variables (`.att`'s `--a-*`), so the
 * look is one stylesheet that sets both those and the app's `--color-*` roles —
 * nothing on a page changes. In light mode (0234) the ramp turns around (text
 * shades deep, tints mixed into white) and a premium theme uses its `light` set;
 * `renderGymLook()` redraws from what was read, so switching modes needs no
 * fetch. Removed with the account (`clearGymLook`, from clearAdminCaches).
 */
const ID = 'gym-look';
let last: { accent: string | null; action: string | null; theme: string | null } | null = null;

export function clearGymLook(): void {
  last = null;
  document.getElementById(ID)?.remove();
}

/** White or near-black — whichever reads better on this colour (WCAG contrast). For words on the gym's own fills. */
function wordsOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const lin = (i: number) => { const v = parseInt(m[1].slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  const dark = 0.0065; // #1a1205, the near-black written on amber
  return (1.05) / (l + 0.05) >= (l + 0.05) / (dark + 0.05) ? '#FFFFFF' : '#1a1205';
}

/** Draw the last-read look in the current mode (lib/colorMode.ts calls this when the mode changes). */
export function renderGymLook(): void {
  if (!last) return;
  const light = document.documentElement.dataset.mode === 'light';
  const p = rampFor(last.accent, 'violet');
  const a = rampFor(last.action, 'amber');
  const pt = PREMIUM_THEMES.find((x) => x.key === last!.theme);
  const t = pt ? (light ? pt.light : pt.dark) : undefined;
  const ground = t ? `
  --color-bg: ${t.bg}; --color-surface: ${t.surface}; --color-surface-raised: ${t.raised}; --color-surface-high: ${t.high};
  ${light ? '' : `--grad-primary: linear-gradient(90deg, ${t.grad[0]}, ${t.grad[1]}); --grad-action: linear-gradient(135deg, ${t.grad[0]}, ${t.grad[1]});`}` : '';
  const att = t ? `--a-surface: ${t.surface}; --a-raised: ${t.raised}; --a-high: ${t.high};` : '';
  const pLight = light ? `color-mix(in srgb, ${p.base} 13%, #ffffff)` : p.light;
  const aLight = light ? `color-mix(in srgb, ${a.base} 15%, #ffffff)` : a.light;
  const aBase = light ? a.c700 : a.base;
  // `:root[data-mode]` / `:root[data-mode] .att`: as specific as light.css's `:root[data-mode="light"]`
  // rules, and later on the page, so the gym's own colours win in light too. With a bare `:root` the
  // light defaults beat them — every gym's buttons, links and notices turned Core Fitness amber in light.
  const css = `
:root, :root[data-mode] {
  --color-primary: ${p.base}; --color-primary-hover: ${p.hover}; --color-primary-light: ${pLight};
  --color-secondary: ${aBase}; --color-secondary-hover: ${light ? a.c800 : a.hover}; --color-secondary-light: ${aLight};${ground}${light ? `
  --fill-action-gym: ${a.c700}; --fill-primary-gym: ${p.c700};` : ''}
  --on-secondary: ${light ? '#FFFFFF' : wordsOn(a.base)};
}
body { background: var(--color-bg); }
.att, :root[data-mode] .att {
  --a-primary: ${p.base}; --a-p300: ${light ? p.c700 : p.c300}; --a-p400: ${light ? p.c600 : p.c400}; --a-plight: ${pLight};
  --a-amber: ${aBase}; --a-a300: ${light ? a.c700 : a.c300}; --a-alight: ${aLight}; ${att}
}`;
  let el = document.getElementById(ID) as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = ID; document.head.appendChild(el); }
  el.textContent = css;
}

/** Read the gym's look and put it on the page — on mount, and again after Your app saves one. */
export async function loadGymLook(alive: () => boolean = () => true): Promise<void> {
  const app = await getGymApp().catch(() => null);
  if (!alive() || !app) return;
  const { data } = await supabase.rpc('my_gym_premium_theme');
  if (!alive()) return;
  last = { accent: app.accent, action: app.accent_action, theme: typeof data === 'string' ? data : null };
  renderGymLook();
}
