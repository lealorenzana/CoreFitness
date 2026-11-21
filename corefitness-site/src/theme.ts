/**
 * Light or dark (2026-10-21). index.html sets `data-theme` on <html> before the
 * first paint — the visitor's saved choice, else their device's setting; this
 * reads and changes it. The choice is a per-visitor convenience, so it lives in
 * localStorage and every access is guarded: blocked storage just means the page
 * follows the device again next time.
 */
export type Theme = 'light' | 'dark';
const KEY = 'cf-site-theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(t: Theme): void {
  // Every colour would otherwise transition at once and the swap looks glitchy: off for two frames.
  const root = document.documentElement;
  root.classList.add('theme-swap');
  root.dataset.theme = t;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-swap')));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f7f6f9' : '#0e0d12');
  try { localStorage.setItem(KEY, t); } catch { /* blocked storage: the choice lasts this visit */ }
}
