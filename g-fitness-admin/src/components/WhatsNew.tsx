import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Release { id: string; title: string; items: string[]; published_at: string }

/**
 * What changed in the dashboard (0212), shown once at the top of the
 * dashboard: the newest note Core Fitness wrote for this app that this person
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
  return (
    <div className="mx-4 mt-4 rounded-xl border px-4 py-3" role="status" data-whats-new
      style={{ borderColor: 'rgba(139,92,246,0.45)', background: 'radial-gradient(120% 160% at 0% 0%, rgba(124,58,237,0.28), rgba(124,58,237,0.06) 60%), var(--color-surface)' }}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: 'rgba(124,58,237,0.25)', color: '#C4B5FD' }}><Sparkles size={17} /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white">{r.title}
            <span className="font-normal text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
              {new Date(r.published_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · from Core Fitness
            </span></p>
          <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-[13px]" style={{ color: 'var(--color-text-secondary)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            {r.items.map((it) => <li key={it} className="flex gap-2"><span style={{ color: '#A78BFA' }}>•</span><span>{it}</span></li>)}
          </ul>
        </div>
        <div className="flex items-center gap-1.5 flex-none">
          <button type="button" onClick={done} className="h-8 px-3 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--color-primary)' }}>Got it</button>
          <button type="button" onClick={done} aria-label="Close what's new" className="w-8 h-8 grid place-items-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}><X size={15} /></button>
        </div>
      </div>
    </div>
  );
}
