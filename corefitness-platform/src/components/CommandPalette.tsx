import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Building2, CornerDownLeft, LifeBuoy, Search, type LucideIcon } from 'lucide-react';
import { listGyms, listTickets, type PlatformGym, type PlatformTicket } from '../lib/platform';

interface Hit { key: string; icon: LucideIcon; label: string; hint: string; to: string }

/**
 * Ctrl+K (⌘K): jump to any screen, any gym's page, or any support ticket by
 * typing. Gyms and tickets are read when it opens, so it is never stale and
 * costs nothing while closed.
 */
export default function CommandPalette({ pages }: { pages: { path: string; label: string; icon: LucideIcon; lede: string }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [gyms, setGyms] = useState<PlatformGym[]>([]);
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
    };
    const ask = () => setOpen(true);
    window.addEventListener('keydown', key);
    window.addEventListener('platform:search', ask);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('platform:search', ask); };
  }, []);
  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    setTimeout(() => input.current?.focus(), 0);
    void listGyms().then(setGyms, () => undefined);
    void listTickets().then(setTickets, () => undefined);
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    const has = (...xs: (string | null | undefined)[]) => !s || xs.some((x) => x?.toLowerCase().includes(s));
    return [
      ...pages.filter((p) => has(p.label, p.lede)).map((p) => ({ key: 'p' + p.path, icon: p.icon, label: p.label, hint: 'Screen', to: p.path })),
      ...gyms.filter((g) => s && has(g.name, g.slug)).slice(0, 8).map((g) => ({ key: 'g' + g.id, icon: Building2, label: g.name,
        hint: `Gym · ${g.members} member${g.members === 1 ? '' : 's'}${g.lock_reason ? ' · read-only' : ''}`, to: `/gyms/${g.id}` })),
      ...tickets.filter((t) => s && has(t.subject, t.gym_name)).slice(0, 5).map((t) => ({ key: 't' + t.id, icon: LifeBuoy, label: t.subject,
        hint: `Support · ${t.gym_name}`, to: '/support' })),
    ];
  }, [q, pages, gyms, tickets]);

  const go = (h: Hit | undefined) => { if (!h) return; setOpen(false); navigate(h.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[sel]); }
  };

  if (!open) return null;
  return createPortal((
    <div className="palette-shade" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
        <label className="search palette-input">
          <Search size={16} />
          <input ref={input} value={q} placeholder="Find a gym, a ticket or a screen" aria-label="Search everything"
            onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} />
        </label>
        <div className="palette-list" role="listbox">
          {hits.length === 0 && <p className="empty">Nothing matches “{q}”.</p>}
          {hits.map((h, i) => {
            const Icon = h.icon;
            return (
              <button key={h.key} type="button" role="option" aria-selected={i === sel} className={`palette-hit${i === sel ? ' on' : ''}`}
                onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
                <Icon size={16} />
                <span className="palette-label">{h.label}</span>
                <span className="palette-hint">{h.hint}</span>
                {i === sel && <CornerDownLeft size={14} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ), document.body);
}
