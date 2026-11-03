import { supabase } from './supabaseClient';
import { renderGymLook } from './gymLook';

/**
 * Light or dark (0234) for the owner's and desk's app — the same account choice
 * as the member app (`profiles.color_mode`), switched by the sun/moon in the top
 * bar. Until it is read (and when signed out) the device's own setting decides.
 *
 * The mode is `data-mode` on <html>; light.css holds the light values of every
 * colour role, and the gym's look (GymLook) is redrawn in matching shades.
 * Kept in step with g-fitness-member/src/lib/colorMode.ts.
 */
export type ColorMode = 'system' | 'light' | 'dark';

let saved: ColorMode = 'system';
const listeners = new Set<(m: ColorMode) => void>();
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

export const colorModeChoice = (): ColorMode => saved;
export const resolvedMode = (): 'light' | 'dark' =>
  saved === 'system' ? (media?.matches ? 'light' : 'dark') : saved;

export function applyColorMode(): void {
  const root = document.documentElement;
  const mode = resolvedMode();
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#F6F6F9' : '#0F0F1A');
  renderGymLook();
  listeners.forEach((fn) => fn(saved));
}

media?.addEventListener('change', () => { if (saved === 'system') applyColorMode(); });

/** After sign-in: this account's choice. Before 0234 (or signed out), the device decides. */
export async function loadColorMode(): Promise<void> {
  const { data, error } = await supabase.rpc('my_color_mode');
  saved = !error && (data === 'light' || data === 'dark') ? data : 'system';
  applyColorMode();
}

export async function setColorMode(mode: ColorMode): Promise<string | null> {
  saved = mode;
  applyColorMode();
  const { error } = await supabase.rpc('set_color_mode', { p_mode: mode });
  return error ? error.message : null;
}

/** Signed out, or another account: back to the device's setting (adminCaches). */
export function clearColorMode(): void {
  saved = 'system';
  applyColorMode();
}

export function onColorMode(fn: (m: ColorMode) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
