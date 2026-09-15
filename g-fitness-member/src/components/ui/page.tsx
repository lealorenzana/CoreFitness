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
}: {
  icon: ReactNode;
  value: ReactNode;
  unit?: string;
  label: string;
  /** 0–1. Omit when the number has no target. */
  fraction?: number;
  tone?: 'primary' | 'secondary';
  onClick?: () => void;
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
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', padding: 'var(--card-pad)' }}
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

/**
 * A horizontal rail of icon tiles — the reference's Categories row.
 *
 * Scrolls rather than wraps: a wrapping grid of eight categories pushes the
 * content below it off a phone screen, and the rail says "there is more this
 * way" by cutting the last tile, which a wrapped grid cannot.
 *
 * Every tile keeps its count. A filter is worth tapping or it is not, and the
 * number is the only thing on the tile that answers that.
 */
export function CategoryRail({
  items,
  active,
  onPick,
}: {
  items: { id: string; label: string; icon: ReactNode; count?: number }[];
  active?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto scrollbar-hide"
      // The rail runs edge to edge while the page keeps its gutter: a row that
      // stops short of the screen edge reads as a mistake rather than as a
      // scroller.
      style={{ marginLeft: 'calc(var(--gutter) * -1)', marginRight: 'calc(var(--gutter) * -1)',
               paddingLeft: 'var(--gutter)', paddingRight: 'var(--gutter)' }}
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            onClick={() => onPick(it.id)}
            className="flex-shrink-0 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-colors"
            style={{
              width: 78, height: 78,
              background: on ? 'var(--color-primary)' : 'var(--color-surface-raised)',
              border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
              color: on ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {it.icon}
            <span className="font-semibold capitalize leading-none truncate max-w-[68px]"
              style={{ fontSize: 'var(--text-meta)' }}>
              {it.label}
            </span>
            {it.count != null && (
              <span className="tabular-nums leading-none"
                style={{ fontSize: 'var(--text-meta)', opacity: 0.65 }}>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One destination in a hub grid.
 *
 * Profile was eleven stacked rows, each with a title and a sentence of
 * subtitle — about 800px of scrolling to see what the app contains, on a screen
 * 852px tall. Everything was *there* and nothing was visible.
 *
 * Three to a row, icon and label only. The subtitles were the reason the list
 * was long, and they were explaining destinations whose names already say it:
 * "Payments — what you've paid and when". Where a name genuinely needs help,
 * the section header above the grid does it once for the whole group.
 */
export function NavTile({
  icon,
  label,
  onClick,
  tone = 'primary',
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'secondary' | 'muted';
}) {
  const accent =
    tone === 'secondary' ? 'var(--color-secondary)'
    : tone === 'muted' ? 'var(--color-text-muted)'
    : 'var(--color-primary)';
  const wash =
    tone === 'secondary' ? 'var(--color-secondary-light)'
    : tone === 'muted' ? 'var(--color-surface-high)'
    : 'var(--color-primary-light)';
  return (
    <button
      onClick={onClick}
      className="rounded-2xl flex flex-col items-center justify-center gap-2 text-center active:opacity-80"
      style={{
        ...panelStyle,
        // Tall enough for two lines of label without the row jumping when one
        // tile wraps and its neighbours do not.
        minHeight: 96,
        paddingLeft: 8, paddingRight: 8, paddingTop: 12, paddingBottom: 12,
      }}
    >
      <span className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
        style={{ background: wash, color: accent }}>
        {icon}
      </span>
      <span className="font-semibold text-white leading-tight"
        style={{ fontSize: 'var(--text-meta)' }}>
        {label}
      </span>
    </button>
  );
}
