import { useEffect, useRef, useState } from 'react';
import { Check, LayoutGrid } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

/** A layout and whether the Details pane is on: a screen preference, never a person's data. */
export interface Look { view: string; pane: boolean }

const valid = (v: unknown, views: [string, string][], fallback: Look): Look => {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Look>;
  return { view: views.some(([k]) => k === o.view) ? o.view! : fallback.view, pane: typeof o.pane === 'boolean' ? o.pane : fallback.pane };
};

/**
 * One screen's look, kept on the signed-in account (0285, owner 2026-11-28): it survives a refresh, leaving the page
 * and signing out, and follows the person to another computer. Before 0285 it was in this browser's storage; that
 * value is read once, moved to the account and removed.
 */
export function useLook(page: string, legacyKey: string, views: [string, string][], fallback: Look): [Look, (l: Look) => void] {
  const [look, setLook] = useState<Look>(fallback);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc('my_view_prefs');
      if (!alive) return;
      const saved = !error && data && typeof data === 'object' ? (data as Record<string, unknown>)[page] : undefined;
      if (saved) { setLook(valid(saved, views, fallback)); return; }
      let legacy: unknown;
      try { legacy = JSON.parse(localStorage.getItem(legacyKey) ?? 'null'); } catch { legacy = null; }
      if (legacy) {
        const l = valid(legacy, views, fallback);
        setLook(l);
        if (!error) { void supabase.rpc('set_view_pref', { p_key: page, p_value: l }).then(() => undefined, () => undefined); try { localStorage.removeItem(legacyKey); } catch { /* private window */ } }
      }
    })();
    return () => { alive = false; };
    // Read once per screen; views and fallback are constants of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, legacyKey]);
  const save = (l: Look) => { setLook(l); void supabase.rpc('set_view_pref', { p_key: page, p_value: l }).then(() => undefined, () => undefined); };
  return [look, save];
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
