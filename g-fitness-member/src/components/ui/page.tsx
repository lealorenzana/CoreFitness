import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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
      className={cn('flex flex-col', className)}
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
 * The title block: what this screen is, and one line on what it is for.
 *
 * `back` is opt-in. A tab root (Home, Book, Progress, Profile) has nowhere to
 * go back *to* — the dock is the way out — and a back arrow there is a control
 * that lies about the structure of the app.
 */
export function PageTitle({
  title,
  subtitle,
  back = false,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="flex items-start gap-3">
      {back && (
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex-shrink-0 grid place-items-center rounded-full"
          style={{
            width: 36, height: 36, marginTop: 2,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="display text-white" style={{ fontSize: 'var(--text-display)' }}>{title}</h1>
        {subtitle && (
          <p className="mt-1 leading-snug" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0 self-center">{action}</div>}
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
 * A number with its label, for the tile grids.
 *
 * Deliberately borderless. The grids it replaces were cards inside a card
 * inside the page — three nested radii and three borders around one number,
 * which is what made Progress look busy at a glance. A tint is enough
 * separation when the parent already has an edge.
 */
export function Tile({
  value,
  label,
  icon,
  onClick,
  tone = 'default',
}: {
  value: ReactNode;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'primary' | 'secondary';
}) {
  const colour =
    tone === 'primary' ? 'var(--color-primary)'
    : tone === 'secondary' ? 'var(--color-secondary)'
    : 'var(--color-text-primary)';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn('rounded-xl text-left', onClick && 'w-full')}
      style={{ background: 'var(--color-surface-high)', padding: 'var(--card-pad)' }}
    >
      {icon && <div className="mb-2" style={{ color: 'var(--color-text-muted)' }}>{icon}</div>}
      <p className="display leading-none" style={{ fontSize: 'var(--text-display)', color: colour }}>
        {value}
      </p>
      <p className="mt-1.5 leading-snug" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </Tag>
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
