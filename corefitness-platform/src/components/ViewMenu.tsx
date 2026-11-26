import { useEffect, useRef, useState } from 'react';
import { Check, LayoutGrid } from 'lucide-react';

/** A layout and whether the Details pane is on: a screen preference, never a person's data. */
export interface Look { view: string; pane: boolean }

/** The saved choice for one screen, or the fallback when there is none (or it names a layout that no longer exists). */
export function readLook(key: string, views: [string, string][], fallback: Look): Look {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}');
    return { view: views.some(([k]) => k === v.view) ? v.view : fallback.view, pane: typeof v.pane === 'boolean' ? v.pane : fallback.pane };
  } catch { return fallback; }
}
export function saveLook(key: string, look: Look) {
  try { localStorage.setItem(key, JSON.stringify(look)); } catch { /* private window */ }
}

/** The View menu, like File Explorer's (2026-11-27): one layout chosen, and the Details pane on or off. Gyms and Applications. */
export default function ViewMenu({ views, look, onChange }: { views: [string, string][]; look: Look; onChange: (l: Look) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="gx-viewmenu" ref={box}>
      <button type="button" className="btn ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <LayoutGrid size={15} /> View
      </button>
      {open && (
        <div role="menu" className="gx-menu">
          {views.map(([k, label]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={look.view === k}
              onClick={() => { onChange({ ...look, view: k }); setOpen(false); }}>
              <span className="gx-tick">{look.view === k && <i />}</span>{label}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitemcheckbox" aria-checked={look.pane}
            onClick={() => { onChange({ ...look, pane: !look.pane }); setOpen(false); }}>
            <span className="gx-tick">{look.pane && <Check size={13} />}</span>Details pane
          </button>
        </div>
      )}
    </span>
  );
}
