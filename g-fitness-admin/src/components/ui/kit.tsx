import * as React from 'react';
import { motion } from 'framer-motion';
import { Search, X, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The admin's layout kit.
 *
 * Twelve pages had each grown their own header, their own stat row, their own
 * "no results" line and their own idea of how wide a card should be. They drift
 * apart one page at a time, and two of the results are visible from across the
 * room: a roster holding **one** trainer drew a card 1,700px wide, and an empty
 * rewards catalogue drew two full-width panels to say "nothing here" twice.
 *
 * The rules these encode:
 *
 * - **A card is as wide as its content deserves, never as wide as the screen.**
 *   `CardGrid` lays out fixed-width columns, so one card is one column wide and
 *   the row simply has empty space to its right. That is what an almost-empty
 *   list should look like.
 * - **Nothing is announced twice.** `EmptyState` is bounded and centred; it
 *   never inflates to fill a panel that has nothing in it.
 * - **Opening something must not move everything else.** Forms and details
 *   float above the page (`Modal`, `DetailSheet`) instead of expanding inline
 *   and pushing the list you were reading off the bottom of the screen.
 * - **A long list is paged, always.** `usePaged` + `Pagination`, at a page size
 *   that fits the row height, so no screen can grow without limit.
 */

const SURFACE       = 'var(--color-surface)';
const SURFACE_HIGH  = 'var(--color-surface-high)';
const BORDER        = 'var(--color-border)';
const PRIMARY       = 'var(--color-primary)';
const PRIMARY_LIGHT = 'var(--color-primary-light)';
const SECONDARY     = 'var(--color-secondary)';
const TEXT_SECOND   = 'var(--color-text-secondary)';
const TEXT_MUTED    = 'var(--color-text-muted)';

// ─── Page header ─────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Buttons. Kept on one line with the title so the page starts at the content. */
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start justify-between gap-4 flex-wrap"
    >
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-white">{title}</h1>
        {subtitle && (
          <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </motion.div>
  );
}

// ─── Stat tiles ──────────────────────────────────────────────────────────────

export interface StatItem {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Amber for the number that means "someone is waiting". */
  tone?: 'primary' | 'secondary';
  /** Makes the tile a button. A statistic you can act on should be clickable. */
  onClick?: () => void;
}

/**
 * A row of small tiles, sized to their content.
 *
 * These used to be a `grid-cols-3`, so three numbers stretched across the full
 * page and a single figure sat alone in a 1,700px box. They are numbers; they
 * need about 150px each.
 */
export function StatTiles({ items }: { items: StatItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((s) => {
        const Icon = s.icon;
        const tone = s.tone === 'secondary' ? SECONDARY : PRIMARY;
        const Tag = s.onClick ? 'button' : 'div';
        return (
          <Tag
            key={s.label}
            onClick={s.onClick}
            className="flex items-center gap-2.5 pl-2.5 pr-4 py-2 rounded-xl text-left transition-colors"
            style={{
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              minWidth: 132,
              cursor: s.onClick ? 'pointer' : 'default',
            }}
          >
            {Icon && (
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: s.tone === 'secondary' ? 'var(--color-secondary-light)' : PRIMARY_LIGHT }}
              >
                <Icon size={13} style={{ color: tone }} />
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-[9px] uppercase tracking-wider truncate" style={{ color: TEXT_MUTED }}>
                {s.label}
              </span>
              <span className="block text-base font-bold text-white tabular-nums leading-tight">
                {s.value}
              </span>
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

// ─── Section panel ───────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon?: LucideIcon;
  /** Shown as a pill beside the title — how many things are in here. */
  count?: number;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Drops the panel chrome, for a section that is already inside one. */
  bare?: boolean;
}

export function Section({ title, icon: Icon, count, hint, actions, children, className, bare }: SectionProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={14} style={{ color: PRIMARY }} className="flex-shrink-0" />}
          <h3 className="text-[13px] font-bold text-white truncate">{title}</h3>
          {count != null && (
            <span
              className="text-[10px] font-semibold tabular-nums px-1.5 rounded-full flex-shrink-0"
              style={{ background: SURFACE_HIGH, color: TEXT_SECOND }}
            >
              {count}
            </span>
          )}
          {hint && (
            <span className="text-[10px] truncate hidden md:inline" style={{ color: TEXT_MUTED }}>· {hint}</span>
          )}
        </div>
        {actions && <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>}
      </div>
      {children}
    </>
  );

  if (bare) return <div className={className}>{body}</div>;

  return (
    <div
      className={className}
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        padding: 16,
      }}
    >
      {body}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

/**
 * Bounded and centred, so an empty page reads as calm rather than broken.
 * Never stretches: `maxWidth` is the whole point of this component.
 */
export function EmptyState({
  icon: Icon, title, hint, action, compact,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center mx-auto ${compact ? 'py-5' : 'py-10'}`}
      style={{ maxWidth: 340 }}>
      {Icon && (
        <span className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5"
          style={{ background: SURFACE_HIGH }}>
          <Icon size={17} style={{ color: TEXT_MUTED }} />
        </span>
      )}
      <p className="text-[13px] font-semibold text-white">{title}</p>
      {hint && <p className="text-[11px] mt-1 leading-relaxed" style={{ color: TEXT_MUTED }}>{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ─── Card grid ───────────────────────────────────────────────────────────────

/**
 * Fixed-width columns, not stretchy ones.
 *
 * `auto-fill` + `minmax(min, 1fr)` is the whole fix for the 1,700px trainer
 * card: the track count comes from the container width, so one card occupies
 * one track and leaves the rest of the row empty — which is the honest picture
 * of a roster with one person in it.
 */
export function CardGrid({
  min = 280, children, className = '',
}: { min?: number; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

/**
 * One clickable tile. The whole card is the target, so a list of things you can
 * open does not need a row of "View" buttons repeated down the page — the
 * chevron says it, once, per card.
 */
export function TileCard({
  onClick, children, dim, accent, className = '', title,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  /** Retired / inactive rows stay legible but recede. */
  dim?: boolean;
  /** Draws the left edge in amber — "this one needs you". */
  accent?: boolean;
  className?: string;
  title?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`text-left w-full rounded-xl p-3 transition-colors group ${className}`}
      style={{
        background: SURFACE,
        border: `1px solid ${accent ? 'rgba(245,158,11,0.35)' : BORDER}`,
        borderLeft: accent ? `3px solid ${SECONDARY}` : `1px solid ${BORDER}`,
        opacity: dim ? 0.55 : 1,
        cursor: onClick ? 'pointer' : 'default',
        // A <button> centres its content vertically — the browser's own
        // stylesheet does it, and nothing in the markup hints at it. Grid rows
        // stretch every card to the tallest one, so three cards with different
        // amounts of text ended up with their titles at three different
        // heights, which reads as broken alignment rather than as centring.
        // Column flex from the top pins the content where the eye expects it.
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
      }}
    >
      {children}
    </Tag>
  );
}

/** The affordance that says a tile opens something. */
export function OpenChevron() {
  return (
    <ChevronRight
      size={14}
      className="flex-shrink-0 transition-transform group-hover:translate-x-0.5"
      style={{ color: TEXT_MUTED }}
    />
  );
}

// ─── Toolbar: search + filter chips ──────────────────────────────────────────

export function SearchBox({
  value, onChange, placeholder = 'Search…', width,
}: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <div className="relative" style={{ width: width ?? undefined, flex: width ? undefined : '1 1 200px', minWidth: 180 }}>
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: TEXT_MUTED }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-8 pr-8 rounded-lg text-xs text-white"
        style={{ background: SURFACE_HIGH, border: `1px solid ${BORDER}` }}
      />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
          style={{ color: TEXT_MUTED }}>
          <X size={11} />
        </button>
      )}
    </div>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Filter chips rather than a `<select>`: the options and their counts are
 * visible without a click, which is what makes "are there any pending ones?"
 * answerable at a glance.
 */
export function Chips<T extends string>({
  options, value, onChange,
}: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="h-9 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors"
            style={{
              background: on ? PRIMARY_LIGHT : SURFACE_HIGH,
              border: `1px solid ${on ? PRIMARY : BORDER}`,
              color: on ? PRIMARY : TEXT_SECOND,
            }}
          >
            {o.label}
            {o.count != null && (
              <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Search, filters and per-section actions on one line. */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 flex-wrap">{children}</div>;
}

// ─── Paging ──────────────────────────────────────────────────────────────────
// The `usePaged` hook lives in `src/hooks/usePaged.ts`: a module exporting both
// components and a hook breaks Fast Refresh.

/** "Showing 1–10 of 42" — so a paged list never looks like the whole list. */
export function PageSummary({ page, perPage, total, noun }: {
  page: number; perPage: number; total: number; noun: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>
      {total <= perPage ? `${total} ${noun}` : `${from}–${to} of ${total} ${noun}`}
    </span>
  );
}
