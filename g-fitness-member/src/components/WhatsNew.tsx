import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useT } from '../lib/i18n';

interface Release { id: string; title: string; items: string[]; published_at: string }

/**
 * What changed in the app (0212), once: the newest note Core Fitness wrote for
 * this app — member or trainer — that this person has not seen, as a card at the
 * top of the screen on Today (member) or the hub (trainer). "Seen" is in the
 * database, so another phone does not show it again; "Got it" or the close
 * records it. Silent before 0212, and when nothing is new.
 *
 * Portalled into #phone-overlay-root (pointer-events: none); the card itself
 * takes the taps, so nothing under it is blocked (CLAUDE.md).
 */
export default function WhatsNew({ app }: { app: 'member' | 'trainer' }) {
  const t = useT();
  const [r, setR] = useState<Release | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.rpc('my_whats_new', { p_app: app }).then(({ data, error }) => {
      const n = data as Release | null;
      if (alive && !error && n && typeof n.id === 'string' && typeof n.title === 'string' && Array.isArray(n.items)) setR(n);
    });
    return () => { alive = false; };
  }, [app]);
  if (!r) return null;
  const root = document.getElementById('phone-overlay-root') ?? document.body;
  // A query builder runs only when awaited or then'd — a bare `void rpc()` never reaches the database.
  const done = () => { void supabase.rpc('mark_release_seen', { p_id: r.id }).then(() => undefined, () => undefined); setR(null); };
  return createPortal(
    <div role="status" data-whats-new
      style={{ position: 'absolute', left: 12, right: 12, top: 'calc(env(safe-area-inset-top, 0px) + 12px)', pointerEvents: 'auto', zIndex: 5,
        borderRadius: 20, padding: 16, background: 'radial-gradient(120% 140% at 0% 0%, rgba(124,58,237,0.42), transparent 62%), #14131F',
        border: '1px solid rgba(167,139,250,0.4)', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.8)', animation: 'noc-rise 0.3s ease both' }}>
      <div className="flex items-start" style={{ gap: 12 }}>
        <span className="grid place-items-center flex-none" style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(124,58,237,0.3)', color: 'var(--color-primary-300)' }}><Sparkles size={18} /></span>
        <div className="min-w-0" style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{t(r.title)}</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('From Core Fitness')}</p>
        </div>
        <button type="button" onClick={done} aria-label={t('Close')} className="grid place-items-center flex-none" style={{ width: 32, height: 32, color: 'var(--color-text-muted)' }}><X size={16} /></button>
      </div>
      <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {r.items.map((it) => (
          <li key={it} className="flex" style={{ gap: 8, fontSize: 13, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
            <span style={{ color: 'var(--color-primary-300)' }}>•</span><span>{t(it)}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={done} style={{ marginTop: 12, width: '100%', height: 42, borderRadius: 14, fontWeight: 700, fontSize: 14,
        background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>{t('Got it')}</button>
    </div>,
    root,
  );
}
