import type { LucideIcon } from 'lucide-react';
import { panelStyle } from './Card';

/**
 * One number, stated large.
 *
 * The reference gets its character from oversized figures with a small unit
 * riding alongside, plus a coloured pill for status. Everything here is
 * optional except `value` and `label`, because the honesty rule means a card
 * frequently has a number and nothing else to say about it.
 *
 * `value` accepts a string so a screen can pass an em dash when a figure has no
 * source — never a zero standing in for "unknown", which reads as a real
 * measurement of nothing.
 */

export type PillTone = 'primary' | 'secondary' | 'muted';

const pillTones: Record<PillTone, { background: string; color: string; border: string }> = {
  primary: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    border: '1px solid rgba(124,58,237,0.30)',
  },
  secondary: {
    background: 'var(--color-secondary-light)',
    color: 'var(--color-secondary)',
    border: '1px solid rgba(245,158,11,0.30)',
  },
  muted: {
    background: 'var(--color-bg)',
    color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)',
  },
};

export function Pill({ label, tone = 'muted' }: { label: string; tone?: PillTone }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={pillTones[tone]}
    >
      {label}
    </span>
  );
}

export default function StatCard({
  value,
  unit,
  label,
  icon: Icon,
  pill,
  pillTone = 'muted',
  onClick,
}: {
  value: string | number;
  /** Small trailing unit — "kg", "min", "days". Omit for a bare count. */
  unit?: string;
  label: string;
  icon?: LucideIcon;
  pill?: string;
  pillTone?: PillTone;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className="rounded-2xl p-4 text-left w-full"
      style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        {Icon ? (
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-surface-high)' }}
          >
            <Icon size={16} style={{ color: 'var(--color-secondary)' }} />
          </span>
        ) : (
          <span />
        )}
        {pill && <Pill label={pill} tone={pillTone} />}
      </div>

      <p className="flex items-baseline gap-1">
        <span className="display text-3xl text-white">{value}</span>
        {unit && (
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            {unit}
          </span>
        )}
      </p>
      <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </Tag>
  );
}
