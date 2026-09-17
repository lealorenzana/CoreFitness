import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * The Nocturne kit: the pieces every rebuilt member screen is made of.
 *
 * Nocturne's structure in Core Fitness colour (see the header of `index.css`),
 * and the colour roles are enforced **here**, by variant name, so a screen
 * cannot quietly invent a third meaning:
 *
 *   action     amber   something you can do next — book, renew, save, spend
 *   structure  violet  where you are, what you have — selection, progress, state
 *   ghost      neutral a secondary way out — "Chart", "Ask the assistant"
 *
 * Violet is never small text: text in a violet role uses `--color-primary-300`.
 *
 * Presentation only. Nothing here fetches, writes or decides a rule.
 */

type Tone = 'action' | 'structure' | 'muted';

const TONE_TEXT: Record<Tone, string> = {
  action: 'var(--color-secondary)',
  structure: 'var(--color-primary-300)',
  muted: 'var(--color-text-secondary)',
};

/** Small, spaced capitals. `mark` adds the 14×2 accent dash to the left. */
export function Eyebrow({
  children,
  mark,
  tone,
  className,
  style,
}: {
  children: ReactNode;
  mark?: boolean;
  /** Colour the text itself — for a live label like "Showing · Waist". */
  tone?: Tone;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p className={cn('eyebrow flex items-center', className)}
      style={{ gap: 10, ...(tone ? { color: TONE_TEXT[tone] } : null), ...style }}>
      {mark && (
        <span aria-hidden className="flex-none" style={{
          width: 14, height: 2, borderRadius: 1,
          background: 'var(--color-primary)', boxShadow: '0 0 6px var(--color-primary)',
        }} />
      )}
      {children}
    </p>
  );
}

/** A section's heading: 17px title on the left, a quiet count or link on the right. */
export function SectionHead({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      {meta != null && (
        <span className="flex-none" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
          {meta}
        </span>
      )}
    </div>
  );
}

/**
 * A list row: optional gutter, title and meta, optional trailing action, and a
 * solid hairline beneath. Flat — no card. A list is rows on the page; a card
 * around each row was the "cards inside cards" that made screens read busy.
 *
 * The trailing action is **text in its role colour**, not a button inside a
 * button: the whole row is the target when `onClick` is set, and the word on
 * the right says what the tap does. A nested `<button>` would be invalid and
 * would eat the outer tap.
 */
export function LineRow({
  gutter,
  gutterWidth = 52,
  title,
  meta,
  action,
  actionTone = 'action',
  onClick,
  dim,
  last,
}: {
  gutter?: ReactNode;
  gutterWidth?: number;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  actionTone?: Tone;
  onClick?: () => void;
  /** Unavailable — a full class, a locked reward. Still readable, never below the text floor. */
  dim?: boolean;
  /** Omit the separator under the final row. */
  last?: boolean;
}) {
  const body = (
    <>
      {gutter != null && (
        <span className="flex-none" style={{ width: gutterWidth, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {gutter}
        </span>
      )}
      <span className="flex-1 min-w-0 block">
        <span className="block truncate" style={{
          fontSize: 14.5, color: dim ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
        }}>
          {title}
        </span>
        {meta != null && (
          <span className="block" style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.45 }}>
            {meta}
          </span>
        )}
      </span>
      {action != null && (
        <span className="flex-none" style={{ fontSize: 13, color: TONE_TEXT[actionTone] }}>{action}</span>
      )}
    </>
  );

  const rowStyle: CSSProperties = { gap: 12, padding: '13px 0' };
  return (
    <div>
      {onClick ? (
        <button onClick={onClick} className="w-full flex items-center text-left noc-row" style={rowStyle}>{body}</button>
      ) : (
        <div className="flex items-center" style={rowStyle}>{body}</div>
      )}
      {!last && <div className="hair" />}
    </div>
  );
}

/**
 * The one button shape: 46px, 8px radius, line and glow rather than a slab.
 *
 * `fill` is the solid amber slab, kept for the single most important action on
 * a screen when a line would undersell it (Renew on an expired membership).
 * Use it once per screen at most.
 */
export function NocButton({
  children,
  icon,
  variant = 'action',
  onClick,
  disabled,
  type = 'button',
  className,
  style,
}: {
  children: ReactNode;
  icon?: ReactNode;
  variant?: 'action' | 'fill' | 'structure' | 'ghost';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  style?: CSSProperties;
}) {
  const skin: CSSProperties =
    variant === 'fill'
      ? { background: 'var(--color-secondary)', color: 'var(--color-bg)', border: '1px solid var(--color-secondary)',
          boxShadow: '0 0 26px -8px var(--color-secondary)' }
      : variant === 'action'
        ? { color: 'var(--color-secondary)', border: '1px solid var(--color-secondary)',
            background: 'color-mix(in srgb, var(--color-secondary) 8%, transparent)',
            boxShadow: '0 0 26px -10px var(--color-secondary)' }
        : variant === 'structure'
          ? { color: 'var(--color-primary-300)', border: '1px solid var(--color-primary)',
              background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }
          : { color: 'var(--color-text-secondary)', border: '1px solid var(--color-hairline)' };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn('flex items-center justify-center noc-press disabled:opacity-50 disabled:cursor-not-allowed', className)}
      style={{ height: 46, borderRadius: 'var(--radius-btn)', gap: 7, fontSize: 14, fontWeight: 500, ...skin, ...style }}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * A 4px progress bar. **Renders nothing without a real fraction** — a bar is a
 * claim that there is a target, and a bar with no denominator is decoration
 * pretending to be a measurement (the same rule `RingStat` follows).
 */
export function ProgressBar({
  fraction,
  tone = 'structure',
  style,
}: {
  fraction: number | null | undefined;
  tone?: 'structure' | 'action';
  style?: CSSProperties;
}) {
  if (fraction == null || !Number.isFinite(fraction)) return null;
  const pct = Math.max(0, Math.min(1, fraction));
  const fill = tone === 'action' ? 'var(--color-secondary)' : 'var(--color-primary)';
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}
      className="overflow-hidden" style={{ height: 4, borderRadius: 2, background: 'var(--color-surface-high)', ...style }}>
      {/* A 2% floor so "started" never renders as an empty track. */}
      {/* Grows in from the left — transform only, so the width stays the truth. */}
      <div className="noc-grow-x" style={{ width: `${Math.max(pct * 100, pct > 0 ? 2 : 0)}%`, height: '100%', background: fill,
        boxShadow: `0 0 12px ${fill}` }} />
    </div>
  );
}

/** A status marker: 12px, 4px radius, outlined in its role. */
export function StatusPill({ label, tone = 'structure' }: { label: string; tone?: Tone }) {
  return (
    <span className="inline-block whitespace-nowrap" style={{
      fontSize: 12, lineHeight: 1.4, padding: '1px 8px', borderRadius: 4,
      color: TONE_TEXT[tone],
      border: `1px solid ${tone === 'muted' ? 'var(--color-hairline)'
        : tone === 'action' ? 'color-mix(in srgb, var(--color-secondary) 55%, transparent)'
        : 'var(--color-primary-800)'}`,
    }}>
      {label}
    </span>
  );
}

/**
 * Text tabs with an underline: the Train filter, the Progress rail.
 * Selection is structure, so the underline is violet.
 */
export function TextTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  gap = 22,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  gap?: number;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex overflow-x-auto scrollbar-hide" style={{ gap, fontSize: 12.5 }}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className="flex-none whitespace-nowrap relative noc-press"
            style={{
              paddingBottom: 7,
              color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: on ? 500 : 400,
            }}
          >
            {t.label}
            {/* The underline scales in from the left rather than appearing, so
                switching tabs reads as the selection moving. */}
            <span aria-hidden className="noc-underline absolute left-0 right-0 bottom-0" style={{
              height: 2, borderRadius: 1, background: 'var(--color-primary)',
              boxShadow: on ? '0 0 8px var(--color-primary)' : 'none',
              transform: on ? 'scaleX(1)' : 'scaleX(0)', opacity: on ? 1 : 0,
            }} />
          </button>
        );
      })}
    </div>
  );
}

/** A filter chip. Selected is structure: violet tint, violet edge, violet text. */
export function Chip({ label, on, onClick }: { label: string; on?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="flex-none whitespace-nowrap noc-press"
      style={{
        padding: '8px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12.5,
        border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
        background: on ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)' : 'transparent',
        color: on ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
      }}
    >
      {label}
    </button>
  );
}

/** A bare figure over its label — no box. */
export function InlineStat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1, color: 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 5 }}>{label}</div>
    </div>
  );
}

/**
 * A panel: 14px radius, hairline edge. `glow` lights it from the top-left in a
 * role colour with a hairline along the top edge — the Nocturne hero treatment,
 * for the one panel a screen leads with.
 */
export function Panel({
  children,
  glow,
  filled,
  onClick,
  className,
  style,
  ariaLabel,
}: {
  children: ReactNode;
  glow?: 'structure' | 'action';
  /** A card fill rather than the page ground — for the one current item in a list. */
  filled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const hue = glow === 'action' ? '245, 158, 11' : '124, 58, 237';
  const css: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-panel)',
    padding: 'var(--card-pad)',
    background: glow
      ? `radial-gradient(150% 120% at 8% 0%, rgba(${hue}, 0.22) 0%, transparent 66%)${filled ? ', var(--color-surface)' : ''}`
      : filled ? 'var(--color-surface)' : 'transparent',
    ...style,
  };
  const topLine = glow ? (
    <span aria-hidden className="noc-sweep" style={{
      position: 'absolute', top: 0, left: 16, right: 16, height: 1,
      background: `linear-gradient(to right, rgb(${hue}), transparent)`,
    }} />
  ) : null;

  if (onClick) {
    return (
      <button onClick={onClick} aria-label={ariaLabel} className={cn('w-full text-left block noc-press-soft', className)} style={css}>
        {topLine}{children}
      </button>
    );
  }
  return <div className={className} style={css}>{topLine}{children}</div>;
}
