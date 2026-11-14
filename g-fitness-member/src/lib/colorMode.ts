import { supabase } from './supabaseClient';
import { reapplyAccent } from './gymTheme';
import { reapplyPremiumTheme } from './premiumThemes';

/**
 * Light or dark (0234). Each person's choice — Same as my phone, Light, or Dark
 * — is saved on their account (`profiles.color_mode`), never in the browser, so
 * it follows them to any phone. Until it is read (and when signed out) the
 * device's own setting decides.
 *
 * The mode is `data-mode` on <html>; index.css holds the light values of every
 * colour role, and the gym's accent and premium theme are put back in the
 * matching shades whenever the mode changes.
 */
export type ColorMode = 'system' | 'light' | 'dark';

let saved: ColorMode = 'system';
/** 0254: whether this account still has to be asked (first sign-in). False until read, and before 0254. */
let mustAsk = false;
const askListeners = new Set<(ask: boolean) => void>();
/**
 * The sign-in screen's own switch (the owner, 2026-11-07): before anyone signs in there is no account to
 * save a choice on, so it is this phone's — a per-device convenience, read where "the device decides".
 * A signed-in person's Light or Dark always wins; their "Same as my phone" means this.
 */
const DEVICE_KEY = 'cf-device-mode';
let device: 'light' | 'dark' | null = (() => {
  try { const v = localStorage.getItem(DEVICE_KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
})();
const listeners = new Set<(m: ColorMode) => void>();
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

export const colorModeChoice = (): ColorMode => saved;
export const resolvedMode = (): 'light' | 'dark' =>
  saved === 'system' ? (device ?? (media?.matches ? 'light' : 'dark')) : saved;

/** The sign-in screen's sun/moon: this phone's light or dark until someone signs in. */
export function setDeviceMode(mode: 'light' | 'dark'): void {
  device = mode;
  try { localStorage.setItem(DEVICE_KEY, mode); } catch { /* private mode: for this visit only */ }
  applyColorMode();
}

export function applyColorMode(): void {
  const root = document.documentElement;
  const mode = resolvedMode();
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#F7F7FA' : '#08080E');
  reapplyAccent();
  reapplyPremiumTheme();
  listeners.forEach((fn) => fn(saved));
}

media?.addEventListener('change', () => { if (saved === 'system' && !device) applyColorMode(); });

/** After sign-in: this account's choice. Before 0234 (or signed out), the device decides. */
export async function loadColorMode(): Promise<void> {
  const [{ data, error }, asked] = await Promise.all([supabase.rpc('my_color_mode'), supabase.rpc('my_color_mode_asked')]);
  saved = !error && (data === 'light' || data === 'dark') ? data : 'system';
  applyColorMode();
  // Ask only when the account says it never chose (0254). An error (0254 not pasted, or offline) never asks.
  setMustAsk(!asked.error && asked.data === false);
}

function setMustAsk(v: boolean): void {
  if (mustAsk === v) return;
  mustAsk = v;
  askListeners.forEach((fn) => fn(v));
}

/** The first sign-in question (0254): shown while this is true; any choice answers it. */
export const colorModeMustAsk = (): boolean => mustAsk;
export function onColorModeAsk(fn: (ask: boolean) => void): () => void {
  askListeners.add(fn);
  return () => { askListeners.delete(fn); };
}

/** The first sign-in question's live preview (0254): shows a mode without saving it or answering the question. */
export function previewColorMode(mode: ColorMode): void {
  saved = mode;
  applyColorMode();
}

export async function setColorMode(mode: ColorMode): Promise<string | null> {
  saved = mode;
  applyColorMode();
  setMustAsk(false);   // any choice — the question, Settings, the sun/moon — answers it (0254)
  const { error } = await supabase.rpc('set_color_mode', { p_mode: mode });
  return error ? error.message : null;
}

/** Signed out, or another account: back to the device's setting (memberCaches). */
export function clearColorMode(): void {
  saved = 'system';
  setMustAsk(false);
  applyColorMode();
}

export function onColorMode(fn: (m: ColorMode) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
