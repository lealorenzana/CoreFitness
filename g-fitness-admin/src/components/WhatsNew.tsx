import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Release { id: string; title: string; items: string[]; published_at: string }

/**
 * What changed in the dashboard (0212), shown once over the top-right
 * corner of the dashboard (floating, it moves nothing): the newest note Core Fitness wrote for this app that this person
 * has not seen. "Seen" is in the database, so a second computer does not show it
 * again; closing it (or "Got it") records it. Silent before 0212, and when
 * there is nothing new.
 */
export default function WhatsNew() {
  const [r, setR] = useState<Release | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.rpc('my_whats_new', { p_app: 'admin' }).then(({ data, error }) => {
      const n = data as Release | null;
      if (alive && !error && n && typeof n.id === 'string' && typeof n.title === 'string' && Array.isArray(n.items)) setR(n);
    });
    return () => { alive = false; };
  }, []);
  if (!r) return null;
  // A query builder runs only when awaited or then'd — a bare `void rpc()` never reaches the database.
  const done = () => { void supabase.rpc('mark_release_seen', { p_id: r.id }).then(() => undefined, () => undefined); setR(null); };
  // Floating, never in the page's flow: it sits over the top-right corner and
  // pushes nothing down (owner's rule, 2026-10-26). Portalled to <body> so no
  // page's overflow or stacking context clips it.
  return createPortal(
    <div role="dialog" aria-label={r.title} data-whats-new
      className="fixed z-[60] rounded-2xl border p-4 wn-rise"
      style={{ top: 76, right: 20, width: 'min(400px, calc(100vw - 40px))', borderColor: 'rgba(139,92,246,0.45)',
        background: 'radial-gradient(120% 140% at 0% 0%, rgba(124,58,237,0.32), transparent 60%), #15131F',
        boxShadow: '0 28px 70px -18px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.03)' }}>
      <style>{'@keyframes wnRise{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}.wn-rise{animation:wnRise .25s ease both}@media (prefers-reduced-motion: reduce){.wn-rise{animation:none}}'}</style>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: 'rgba(124,58,237,0.25)', color: '#C4B5FD' }}><Sparkles size={17} /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white leading-snug">{r.title}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {new Date(r.published_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · from Core Fitness
          </p>
        </div>
        <button type="button" onClick={done} aria-label="Close what's new" className="w-8 h-8 -mt-1 -mr-1 grid place-items-center rounded-lg hover:bg-white/5 flex-none" style={{ color: 'var(--color-text-muted)' }}><X size={15} /></button>
      </div>
      <ul className="mt-3 grid gap-1.5 text-[13px] max-h-[50vh] overflow-y-auto" style={{ color: 'var(--color-text-secondary)' }}>
        {r.items.map((it) => <li key={it} className="flex gap-2 leading-snug"><span style={{ color: '#A78BFA' }}>•</span><span>{it}</span></li>)}
      </ul>
      <button type="button" onClick={done} className="mt-4 w-full h-9 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--color-primary)' }}>Got it</button>
    </div>,
    document.body,
  );
}
