import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';
import { panelStyle } from './Card';

/**
 * The frame every member screen is built in.
 *
 * The app had no shared page structure, and it showed: `space-y-6 pb-4` on
 * Home, `space-y-5 pb-4` on Profile, `space-y-3` inside Rewards, section
 * labels that were uppercase Anton on one screen and small bold sentence case
 * on the next, and content that ran underneath the floating nav because the
 * scroller only reserved 24px for a dock 90px tall.
 *
 * None of that is a bug a build can catch, and all of it is why the app read as
 * assembled rather than designed. These four components are the fix, and they
 * are **presentation only** — no page changes what it fetches or writes by
 * adopting them.
 *
 * The rules they encode:
 *
 *   One rhythm       `--stack` between sections, `--stack-tight` within one.
 *   One left edge    Header, section eyebrows and card content share it.
 *   Two surfaces     Page, then card. An inset is a tint, not a third card.
 *   One clearance    Every scroll ends above the dock, once, here.
 */

/**
 * A screen. Wrap the whole page in it and let it own the vertical rhythm.
 *
 * `pb` is the clearance above the floating dock. It belongs to the page rather
 * than the layout because a screen with its own sticky footer (Track, Book)
 * needs to opt out, and a magic number repeated per page is how the old
 * overlaps happened.
 */
export function Page({
  children,
  className,
  dockClear = true,
}: {
  children: ReactNode;
  className?: string;
  /** Set false when the screen supplies its own bottom bar. */
  dockClear?: boolean;
}) {
  return (
    <div
      className={cn('flex flex-col noc-stack', className)}
      style={{
        gap: 'var(--stack)',
        paddingBottom: dockClear ? 'var(--dock-clear)' : undefined,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A pushed screen's header (Nocturne): a text "Back" row, then a 26px title
 * and one line on what the screen is for.
 *
 * `back` is opt-in. A tab root (Today, Train, You) has nowhere to go back *to*
 * — the bar is the way out, and the shell draws a root's header itself — and a
 * back control there lies about the structure of the app.
 *
 * **Back undoes the last step; it never navigates somewhere fixed.** Five
 * screens once hardcoded Home, so opening Progress from Train and pressing back
 * landed on a screen the member had never been on. `history.length > 1` guards
 * the one case `navigate(-1)` gets wrong: a screen opened directly (a
 * notification tap, a cold start) with nothing behind it, where -1 leaves the
 * app. Home is the only sane landing for that.
 */
export function PageTitle({
  title,
  subtitle,
  back = false,
  action,
  fallback = '/member/home',
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
  /** Where Back lands when there is no history. A screen shared with trainers passes theirs. */
  fallback?: string;
}) {
  const navigate = useNavigate();
  return (
    <header className="flex flex-col">
      {back && (
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(fallback))}
          className="self-start flex items-center"
          // 44px tall to a thumb; the visible row is the 13px line inside it.
          style={{ gap: 7, height: 44, marginTop: -12, marginBottom: 2, fontSize: 13, color: 'var(--color-primary-300)' }}
        >
          <ArrowLeft size={15} />
          Back
        </button>
      )}
      <div className="flex items-start" style={{ gap: 12 }}>
        <div className="min-w-0 flex-1">
          <h1 style={{
            fontSize: 'var(--text-display)', fontWeight: 500, letterSpacing: '-0.02em',
            lineHeight: 1.12, color: 'var(--color-text-primary)',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="flex-shrink-0 self-center">{action}</div>}
      </div>
    </header>
  );
}

/**
 * A titled block of a screen.
 *
 * The eyebrow is always the display face, uppercase, at the meta size — the one
 * section-heading treatment in the app. `action` is right-aligned and centred
 * against the eyebrow, not floated above it, so "See all" never sits half a
 * line higher than the title it belongs to.
 */
export function Section({
  title,
  hint,
  action,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col', className)} style={{ gap: 'var(--stack-tight)' }}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="display text-white" style={{ fontSize: 'var(--text-title)' }}>{title}</h2>
            )}
            {hint && (
              <p className="mt-0.5 leading-snug" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
                {hint}
              </p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * A list row: something on the left, something optional on the right.
 *
 * The trailing slot is **vertically centred against the whole row**. Rewards
 * had its Redeem buttons pinned to the top of three-line rows, so the button
 * and the thing it acts on were never on the same line — the sort of small
 * misalignment that reads as sloppiness without anyone being able to name it.
 *
 * `lead` is a fixed 36px column so every title in a list starts at the same x,
 * whether or not its row has an icon.
 */
export function Row({
  lead,
  title,
  meta,
  trailing,
  onClick,
  style,
}: {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn('w-full flex items-center gap-3 rounded-2xl text-left', onClick && 'active:opacity-80')}
      style={{ ...panelStyle, padding: 'var(--card-pad)', ...style }}
    >
      {lead && (
        <div className="flex-shrink-0 grid place-items-center" style={{ width: 36, height: 36 }}>
          {lead}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-white truncate" style={{ fontSize: 'var(--text-body)' }}>
          {title}
        </div>
        {meta && (
          <div className="mt-0.5 leading-snug" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
            {meta}
          </div>
        )}
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </Tag>
  );
}

/**
 * A stat as a ring, an icon, a number and its unit.
 *
 * From the reference layout the gym liked: a row of three of these under a
 * "Your progress" header, each one a small gauge rather than a number in a box.
 *
 * `fraction` is optional and that is the honest part. A ring drawn full on
 * every tile is decoration pretending to be a measurement — several of these
 * numbers (total check-ins, points earned) have no ceiling to be a fraction
 * *of*. Pass one only where a target genuinely exists; without it the ring is
 * a plain tinted disc and the number speaks for itself.
 */
export function RingStat({
  icon,
  value,
  unit,
  label,
  fraction,
  tone = 'primary',
  onClick,
  wide = false,
}: {
  icon: ReactNode;
  value: ReactNode;
  unit?: string;
  label: ReactNode;
  /** 0–1. Omit when the number has no target. */
  fraction?: number;
  tone?: 'primary' | 'secondary';
  onClick?: () => void;
  /** Span both columns of a `Bento`. Ignored outside one. */
  wide?: boolean;
}) {
  const accent = tone === 'secondary' ? 'var(--color-secondary)' : 'var(--color-primary)';
  const R = 15;                      // radius of a 36px ring with a 3px stroke
  const CIRC = 2 * Math.PI * R;
  const pct = fraction == null ? null : Math.max(0, Math.min(1, fraction));
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={cn('rounded-2xl text-left', onClick && 'w-full active:opacity-80')}
      style={{
        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
        padding: 'var(--card-pad)', gridColumn: wide ? 'span 2' : undefined,
      }}
    >
      <span className="relative grid place-items-center" style={{ width: 36, height: 36 }}>
        <svg width="36" height="36" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r={R} fill="none" stroke="var(--color-surface-high)" strokeWidth="3" />
          {pct != null && (
            <circle
              cx="18" cy="18" r={R} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${CIRC * pct} ${CIRC}`}
            />
          )}
        </svg>
        <span className="relative" style={{ color: accent }}>{icon}</span>
      </span>

      <p className="mt-3 flex items-baseline gap-1">
        <span className="display text-white leading-none" style={{ fontSize: 'var(--text-display)' }}>{value}</span>
        {unit && (
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>{unit}</span>
        )}
      </p>
      <p className="mt-1 leading-snug" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </Tag>
  );
}
