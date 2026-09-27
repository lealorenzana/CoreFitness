import { useEffect, useState } from 'react';
import { AlertTriangle, Megaphone, X } from 'lucide-react';
import { dismissAnnouncement, myAnnouncements, type Announcement } from '../lib/api/support';

/**
 * What Core Fitness has told this gym (0137) — maintenance, a new feature — as
 * a line above every screen, until the person dismisses it. Silent when there
 * is nothing: a banner that is always there is furniture.
 */
export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => { const a = await myAnnouncements(); if (alive) setItems(a); })();
    return () => { alive = false; };
  }, []);
  if (items.length === 0) return null;
  const a = items[0];
  const warn = a.level === 'warning';
  return (
    <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm" role="status"
      style={{ borderColor: warn ? 'var(--color-secondary)' : 'var(--color-primary)',
        background: warn ? 'var(--color-secondary-light)' : 'var(--color-primary-light)' }}>
      {warn ? <AlertTriangle size={16} className="mt-0.5 flex-none" style={{ color: 'var(--color-secondary)' }} />
        : <Megaphone size={16} className="mt-0.5 flex-none" style={{ color: 'var(--color-primary)' }} />}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">{a.title}{' '}<span className="font-normal text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>from Core Fitness</span></p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{a.body}</p>
      </div>
      {items.length > 1 && <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>+{items.length - 1} more</span>}
      <button aria-label="Dismiss this announcement" style={{ color: 'var(--color-text-muted)' }}
        onClick={() => { void dismissAnnouncement(a.id); setItems((x) => x.slice(1)); }}>
        <X size={14} />
      </button>
    </div>
  );
}
