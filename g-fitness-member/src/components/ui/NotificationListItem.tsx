import { Check } from '@phosphor-icons/react';
import type { Notification } from '../../services/notificationService';
import { getRelativeTime } from '../../services/notificationService';

/**
 * One notification row, drawn the same way in the bell and in the full list
 * (Nocturne redesign).
 *
 * The message is clamped to two lines on purpose — this is the scanning view.
 * Tapping opens `NotificationDetail`, which is where the whole thing is readable.
 *
 * Unread is a violet dot on the left and a brighter title, not a washed row: a
 * list where half the rows are tinted reads as a list of warnings. Selection is
 * amber — it is the thing about to be acted on.
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
  return (
    <div
      onClick={selectable ? onToggleSelect : onClick}
      role="button"
      tabIndex={0}
      aria-pressed={selectable ? selected : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (selectable ? onToggleSelect : onClick)?.();
        }
      }}
      className="flex items-start cursor-pointer"
      style={{
        gap: 10,
        padding: '12px var(--card-pad)',
        backgroundColor: selected ? 'color-mix(in srgb, var(--color-secondary) 10%, transparent)' : 'transparent',
        // The divider is inset to the text, not the row: the selection tint
        // bleeds to the edge, and a rule that did too ran past the page margin.
        backgroundImage: 'linear-gradient(var(--color-separator), var(--color-separator))',
        backgroundSize: 'calc(100% - var(--card-pad) * 2) 1px',
        backgroundPosition: 'bottom center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {selectable ? (
        <span
          className="grid place-items-center shrink-0"
          style={{
            width: 20, height: 20, marginTop: 1, borderRadius: 5,
            border: `1px solid ${selected ? 'var(--color-secondary)' : 'var(--color-hairline)'}`,
            background: selected ? 'var(--color-secondary)' : 'transparent',
            color: 'var(--color-bg)',
          }}
          aria-hidden
        >
          {selected && <Check size={13} weight="bold" />}
        </span>
      ) : (
        <span aria-hidden className="shrink-0 rounded-full" style={{
          width: 7, height: 7, marginTop: 7,
          background: n.read ? 'transparent' : 'var(--color-primary)',
          boxShadow: n.read ? 'none' : '0 0 6px var(--color-primary)',
        }} />
      )}

      <span className="flex-1 min-w-0">
        <span className="block truncate" style={{
          fontSize: 14.5, color: n.read ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
        }}>
          {n.title}
        </span>
        <span className="block line-clamp-2" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
          {n.message}
        </span>
        <span className="block" style={{ fontSize: 12, marginTop: 5, color: 'var(--color-text-muted)' }}>
          {getRelativeTime(n.timestamp)}
          {n.archived && ' · archived'}
        </span>
      </span>
      {trailing}
    </div>
  );
}
