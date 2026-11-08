import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell as BellIcon, Bug, ChevronRight, Inbox, LifeBuoy, Wallet, type LucideIcon } from 'lucide-react';
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
  // What each kind is, at a glance (2026-11-08: the panel was bare numbers, and the count an unstyled "3").
  const iconOf = (kind: string): LucideIcon =>
    /appl/.test(kind) ? Inbox : /support|ticket/.test(kind) ? LifeBuoy : /crash|error/.test(kind) ? Bug : /pay|due|overdue|bill/.test(kind) ? Wallet : BellIcon;
  return (
    <div ref={box} className="pbell">
      <button className="btn ghost pbell__btn" aria-label={total ? `${total} things need you` : 'Nothing needs you'} aria-expanded={open}
        data-tip={total ? `${total} thing${total === 1 ? '' : 's'} need you — click to see` : 'Nothing needs you right now'} onClick={() => setOpen((v) => !v)}>
        <BellIcon size={17} />
        {total > 0 && <span className="pbell__count">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div className="pbell__panel" role="dialog" aria-label="Needs you" data-floating>
          <div className="pbell__head"><b>Needs you</b>{total > 0 && <span>{total} waiting</span>}</div>
          {items.length === 0 ? <p className="pbell__empty">Nothing needs you right now.</p> : items.map((i) => {
            const Icon = iconOf(i.kind);
            return (
              <Link key={i.kind} to={i.href} className="pbell__row" onClick={() => setOpen(false)}>
                <span className="pbell__icon"><Icon size={16} /></span>
                <span className="pbell__label">{i.label}</span>
                <span className="pbell__n">{i.count}</span>
                <ChevronRight size={15} className="pbell__go" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
