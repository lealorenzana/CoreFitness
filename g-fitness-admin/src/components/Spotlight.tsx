import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * "Switch it on in Settings → …" buttons (owner, 2026-11-24): a link with `?focus=<name>` lands on the
 * element marked `data-focus="<name>"`, scrolls it to the middle of the screen and outlines it for a
 * moment, so the owner sees exactly what the button meant. Pages that load their settings late are
 * waited for (up to 5 s); a name that never appears does nothing.
 */
export default function Spotlight() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const name = new URLSearchParams(search).get('focus');
    if (!name) return;
    let tries = 0;
    let off: number | undefined;
    const find = window.setInterval(() => {
      const el = document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(name)}"]`);
      if (!el && ++tries < 33) return;
      window.clearInterval(find);
      if (!el) return;
      // After the page's own scroll to its section (Settings does one on load).
      window.setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.removeAttribute('data-spotlight'); void el.offsetWidth; el.setAttribute('data-spotlight', '');
        off = window.setTimeout(() => el.removeAttribute('data-spotlight'), 3200);
      }, 350);
    }, 150);
    return () => { window.clearInterval(find); window.clearTimeout(off); };
  }, [pathname, search]);
  return null;
}
