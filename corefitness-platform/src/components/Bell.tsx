import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell as BellIcon } from 'lucide-react';
import { bell, CHANGED, type BellItem } from '../lib/platform';

/**
 * The platform owner's bell (0137): applications, support waiting, overdue gyms,
 * crashes — one call, re-read on every move and every minute. Silent before
 * 0137 (the call fails; there is simply nothing to ring).
 */
export default function Bell() {
  const { pathname } = useLocation();
  const [items, setItems] = useState<BellItem[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const pull = () => void bell().then((b) => { if (alive) setItems(b); }, () => undefined);
    pull();
    const t = window.setInterval(pull, 60_000);
    window.addEventListener(CHANGED, pull);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener(CHANGED, pull); };
  }, [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const total = items.reduce((n, i) => n + i.count, 0);
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button className="btn ghost" aria-label={total ? `${total} things need you` : 'Nothing needs you'} data-tip={total ? `${total} thing${total === 1 ? '' : 's'} need you — click to see` : 'Nothing needs you right now'} onClick={() => setOpen((v) => !v)}
        style={{ width: 40, padding: 0, position: 'relative' }}>
        <BellIcon size={17} />
        {total > 0 && <span className="count" style={{ position: 'absolute', top: -6, right: -6 }}>{total}</span>}
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 46, width: 320, zIndex: 30, padding: 12, boxShadow: '0 20px 50px -12px rgba(0,0,0,0.7)' }}>
          {items.length === 0 ? <p className="empty" style={{ padding: '14px 0' }}>Nothing needs you right now.</p> : items.map((i) => (
            <Link key={i.kind} to={i.href} className="todo" onClick={() => setOpen(false)}>
              <span className="todo-icon" style={{ fontWeight: 800, fontSize: 13 }}>{i.count}</span>
              <span className="todo-text">{i.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
