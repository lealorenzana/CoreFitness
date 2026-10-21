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
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f6f5fb' : '#0b0b12');
  try { localStorage.setItem(KEY, t); } catch { /* blocked storage: the choice lasts this visit */ }
}
