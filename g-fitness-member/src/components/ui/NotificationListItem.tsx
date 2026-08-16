import { Check, ChevronRight } from 'lucide-react';
import type { Notification } from '../../services/notificationService';
import { iconFor } from '../../utils/notificationDisplay';
import { getRelativeTime } from '../../services/notificationService';

/**
 * One notification row, drawn the same way in the bell and in the full list.
 *
 * The message is clamped to two lines here on purpose — this is the scanning
 * view. Tapping opens `NotificationDetail`, which is where the whole thing is
 * readable. Before that sheet existed a long trainer recommendation was simply
 * truncated with no way to see the rest.
 */
export default function NotificationListItem({
  notification: n,
  onClick,
  selectable = false,
  selected = false,
  onToggleSelect,
  trailing,
}: {
  notification: Notification;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Extra control on the right — the bell's clear button. */
  trailing?: React.ReactNode;
}) {
  const Icon = iconFor(n.type);

  return (
    <div
      onClick={selectable ? onToggleSelect : onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (selectable ? onToggleSelect : onClick)?.();
        }
      }}
      className="px-4 py-3 flex items-start gap-3 cursor-pointer"
      style={{
        // Unread carries a violet wash; selection wins over it so the current
        // selection is never ambiguous in a mixed list.
        background: selected
          ? 'var(--color-secondary-light)'
          : n.read ? 'transparent' : 'var(--color-primary-light)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {selectable ? (
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: selected ? 'var(--color-secondary)' : 'var(--color-surface-high)',
            border: `1px solid ${selected ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            color: selected ? '#000' : 'transparent',
          }}
          aria-hidden
        >
          <Check size={16} strokeWidth={3} />
        </span>
      ) : (
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: n.read ? 'var(--color-surface-high)' : 'var(--color-primary)',
            color: n.read ? 'var(--color-text-secondary)' : '#fff',
          }}
        >
          <Icon size={17} />
        </span>
      )}

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          {!n.read && (
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--color-secondary)' }} />
          )}
          <span className={`block text-sm truncate ${n.read ? 'font-medium text-white/80' : 'font-bold text-white'}`}>
            {n.title}
          </span>
        </span>
        <span className="block text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
          {n.message}
        </span>
        <span className="block text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {getRelativeTime(n.timestamp)}
          {n.archived && ' · archived'}
        </span>
      </span>

      {!selectable && (
        <ChevronRight size={16} className="flex-shrink-0 mt-1" style={{ color: 'var(--color-text-muted)' }} />
      )}
      {trailing}
    </div>
  );
}
