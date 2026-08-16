import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { panelStyle } from './Card';
import type { PillTone } from './StatCard';

/**
 * A row: tinted icon tile, title, subtitle, and something on the right.
 *
 * This shape appears on nearly every screen — quick actions, bookings, payment
 * history, a trainer in a list. It was hand-rolled each time, which is how the
 * icon tiles ended up three different sizes.
 *
 * The right-hand side is either `value` (+ optional `valueLabel` beneath it) or
 * a chevron when the row navigates. Pass both and the value wins; a row that
 * shows a number and a chevron reads as two competing affordances.
 */

const tileTones: Record<PillTone, { background: string; color: string }> = {
  primary: { background: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  secondary: { background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' },
  muted: { background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' },
};

export default function ListRow({
  icon: Icon,
  tone = 'primary',
  title,
  subtitle,
  value,
  valueLabel,
  onClick,
}: {
  icon?: LucideIcon;
  tone?: PillTone;
  title: string;
  subtitle?: string;
  value?: string | number;
  valueLabel?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 text-left"
      style={{ ...panelStyle, borderRadius: 'var(--radius-card)' }}
    >
      {Icon && (
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={tileTones[tone]}
        >
          <Icon size={19} />
        </span>
      )}

      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white truncate">{title}</span>
        {subtitle && (
          <span className="block text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
            {subtitle}
          </span>
        )}
      </span>

      {value != null ? (
        <span className="text-right flex-shrink-0">
          <span className="block text-sm font-bold text-white">{value}</span>
          {valueLabel && (
            <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {valueLabel}
            </span>
          )}
        </span>
      ) : onClick ? (
        <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0" />
      ) : null}
    </Tag>
  );
}
