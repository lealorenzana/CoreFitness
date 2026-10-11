/**
 * Behave like an installed app, not a web page (2026-10-11).
 *
 * Holding a picture in the trainer's rail opened the browser's own menu —
 * "Open in new tab", "Download image" — which no Android app has. The page's
 * long-press menu is switched off everywhere except where it belongs: text a
 * person types into (copy and paste) and links marked `data-allow-menu`.
 * Images also stop being draggable; CSS (`index.css`) stops the iOS callout.
 * A screen that wants its own long-press (the rail's room settings) listens
 * for it itself — see `useLongPress`.
 */
export function feelLikeAnApp(): void {
  document.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.closest('input, textarea, [contenteditable="true"], [data-allow-menu]')) return;
    e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => {
    if ((e.target as HTMLElement | null)?.tagName === 'IMG') e.preventDefault();
  });
}
