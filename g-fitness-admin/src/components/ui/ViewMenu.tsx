import { useState } from 'react';
import { Check, LayoutGrid } from 'lucide-react';
import Popover from './Popover';

/**
 * The View menu, like File Explorer's (2026-11-27, the platform owner's ask; the platform's Gyms and Applications
 * have the same): one layout chosen, and the Details pane on or off. The page keeps the choice in its address, never
 * in the browser's storage (per-user state never lives in localStorage).
 */
export default function ViewMenu({ views, view, pane, onChange }: {
  views: [string, string][]; view: string; pane: boolean; onChange: (view: string, pane: boolean) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pick = (v: string, p: boolean) => { onChange(v, p); setAnchor(null); };
  return (
    <>
      <button type="button" className="a-chip" aria-haspopup="menu" aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} data-view-menu>
        <LayoutGrid size={12} />View
      </button>
      <Popover anchor={anchor} open={!!anchor} onClose={() => setAnchor(null)} width={200}>
        <div role="menu" className="a-viewmenu">
          {views.map(([k, label]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={view === k} onClick={() => pick(k, pane)}>
              <span className="a-tick">{view === k && <i />}</span>{label}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitemcheckbox" aria-checked={pane} onClick={() => pick(view, !pane)}>
            <span className="a-tick">{pane && <Check size={13} />}</span>Details pane
          </button>
        </div>
      </Popover>
    </>
  );
}
