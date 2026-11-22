import * as React from 'react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MoreHorizontal, Search, ChevronDown, Lightbulb, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Popover from './Popover';

/**
 * The admin redesign kit (2026-10-11), from the owner's mock-ups for Members,
 * Attendance, History, Trainers and Invitations: a page title with pill tabs,
 * a hero card with an icon tile and a ring, stat tiles with icon tiles, filter
 * chips that carry counts, one toolbar (search · selects · Filter), tables with
 * pill statuses and a "…" menu per row, pill pagination, and a right-hand rail
 * of Quick actions / Needs attention / Tip cards.
 *
 * Pages keep their data and rules; this file is only how they look. Every
 * component is module-level (never declared in a render body).
 */

import { TONE, type Tone } from './rdTokens';

// Each fill is a variable whose fallback is the dark look; light.css gives the solid light value.
// Design V2: a flat surface with a hairline; no sheen, no glow.
const CARD_BG = 'var(--rd-card-bg, var(--color-surface))';
const CARD_LINE = '1px solid var(--rd-card-line, rgba(255, 255, 255, 0.06))';
const MUTED = 'var(--color-text-muted)';
const SECOND = 'var(--color-text-secondary)';

// ─── Page header ─────────────────────────────────────────────────────────────

export interface RdTab { label: string; to: string; count?: number }

/** A section's sibling pages as pills (NavLinks — every bookmark still works). */
export function RdTabs({ tabs }: { tabs: RdTab[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="v2-seg" role="tablist" data-rd-tabs>
      {tabs.map((t) => {
        const on = pathname === t.to;
        return (
          <NavLink key={t.to} to={t.to} role="tab" aria-selected={on}
            data-on={on || undefined}>
            {t.label}
            {t.count ? <em>{t.count}</em> : null}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function RdHeader({ title, subtitle, tabs, actions }: {
  title: string; subtitle?: React.ReactNode; tabs?: RdTab[]; actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap" data-rd-header>
      <div className="flex items-center gap-8 flex-wrap min-w-0">
        <div className="min-w-0">
          {/* One type scale across the app (Design V2): 22px titles, 13px subtitles. */}
          <h1 className="text-[22px] leading-tight font-semibold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-[13px] mt-0.5" style={{ color: SECOND }}>{subtitle}</p>}
        </div>
        {tabs && <RdTabs tabs={tabs} />}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
    </header>
  );
}

// ─── Surfaces ────────────────────────────────────────────────────────────────

export function RdCard({ children, className = '', style, glow, ...rest }: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    // `glow` is kept so callers compile, and marks the card for tests; it no longer paints a glow (Design V2, S6).
    <div {...rest} data-glow={glow ? 'true' : undefined} className={`rounded-xl ${className}`}
      style={{ background: CARD_BG, border: CARD_LINE, ...style }}>
      {children}
    </div>
  );
}

export function IconTile({ icon: Icon, tone = 'violet', size = 56 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  // Design V2 (S2): no tinted tile behind an icon. A small icon in the words' colour; amber only when it warns.
  const s = Math.max(14, Math.min(20, Math.round(size * 0.36)));
  return (
    <span data-tile={tone} data-icon-tile className="grid place-items-center flex-none" style={{ width: s, height: s }}>
      <Icon size={s} strokeWidth={1.75} style={{ color: tone === 'amber' ? 'var(--v2-warn, #F59E0B)' : 'var(--color-text-muted)' }} />
    </span>
  );
}

/** A progress ring; `value` is 0..1, or null to draw an empty track. */
export function Ring({ value, label, sub, size = 132, tone = 'violet' }: {
  value: number | null; label: React.ReactNode; sub?: React.ReactNode; size?: number; tone?: Tone;
}) {
  const stroke = Math.max(8, Math.round(size * 0.075));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  const id = `ring-${tone}-${size}`;
  return (
    <div className="relative grid place-items-center flex-none" style={{ width: size, height: size }} data-ring>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tone === 'amber' ? '#F59E0B' : '#6D28D9'} />
            <stop offset="100%" stopColor={tone === 'amber' ? '#FBBF24' : '#A78BFA'} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-bold text-white" style={{ fontSize: Math.round(size * 0.19) }}>{label}</div>
          {sub && <div className="text-xs mt-0.5" style={{ color: SECOND }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

/** A thin progress bar; renders nothing without a real fraction. */
export function Bar({ value, tone = 'violet' }: { value: number | null; tone?: Tone }) {
  if (value === null || !Number.isFinite(value)) return null;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`,
        background: tone === 'amber' ? 'var(--v2-warn, #F59E0B)' : 'var(--color-primary)' }} />
    </div>
  );
}

// ─── Stat tiles ──────────────────────────────────────────────────────────────

export function StatTile({ icon: _icon, tone = 'violet', label, value, sub, onClick, tip, active, compact }: {
  icon: LucideIcon; tone?: Tone; label: string; value: React.ReactNode; sub?: React.ReactNode;
  onClick?: () => void; tip?: string; active?: boolean; compact?: boolean;
}) {
  // Design V2: label, the number, one line under it. A row of these is one strip split by hairlines
  // (v2.css, [data-stat-tile]); `icon` is kept so callers compile, and no longer drawn (S2).
  void _icon;
  const body = (
    <>
      <span className="min-w-0 flex-1 text-left">
        <span className="v2-fig-l flex items-center gap-1.5">
          {tone === 'amber' && <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--v2-warn, #F59E0B)' }} />}
          <span className="truncate">{label}</span>
        </span>
        <span className={`v2-fig-n${compact ? ' sm' : ''}`}>{value}</span>
        {sub && <span className="v2-fig-d">{sub}</span>}
      </span>
      {onClick && <ChevronRight size={15} style={{ color: MUTED }} className="flex-none" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} data-tip={tip} data-stat-tile data-active={active || undefined} className="v2-fig">{body}</button>
  ) : (
    <div data-tip={tip} data-stat-tile data-active={active || undefined} className="v2-fig">{body}</div>
  );
}

// ─── Filter chips ────────────────────────────────────────────────────────────

export interface Chip<K extends string> { key: K; label: string; count?: number | null; tone?: Tone }

export function FilterChips<K extends string>({ items, value, onChange, compact }: { items: Chip<K>[]; value: K; onChange: (k: K) => void; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? 'flex-nowrap overflow-x-auto pb-0.5' : 'flex-wrap'}`} style={compact ? { scrollbarWidth: 'none' } : undefined} data-rd-chips role="tablist">
      {items.map((c) => {
        const on = c.key === value;
        return (
          <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(c.key)} data-chip={c.key}
            className="v2-chip flex-none">
            {c.tone && <span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE[c.tone].dot }} />}
            <span>{c.label}</span>
            {c.count != null && <em>{c.count}</em>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Toolbar pieces ──────────────────────────────────────────────────────────

export function SearchField({ value, onChange, placeholder, autoFocus, onEnter, label }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onEnter?: () => void; label?: string;
}) {
  return (
    <label className="relative flex-1 min-w-[220px] block">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        aria-label={label ?? placeholder} onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
        className="w-full h-9 pl-9 pr-3 rounded-lg text-[13px] text-white outline-none focus:ring-2"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }} />
    </label>
  );
}

interface SelectOption { value: string; text: string; disabled?: boolean }

/** The <option> children as data — options may come in arrays and fragments. */
function optionsOf(children: React.ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  const textOf = (n: React.ReactNode): string => React.Children.toArray(n).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join('');
  const walk = (n: React.ReactNode) => React.Children.forEach(n, (c) => {
    if (!React.isValidElement(c)) return;
    const el = c as React.ReactElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>;
    if (el.type === 'option') out.push({ value: String(el.props.value ?? ''), text: textOf(el.props.children), disabled: el.props.disabled });
    else walk(el.props.children);
  });
  walk(children);
  return out;
}

/**
 * A dropdown in the kit's look (2026-10-12). The browser's own <select> list is
 * the operating system's white menu — on a dark dashboard it read as broken. This
 * is a button (role=combobox, named by `label`) and a dark listbox in a Popover,
 * with a search box once there are more than eight options and full keyboard use
 * (↑ ↓ Home End Enter Esc). Callers still pass plain <option> children.
 */
export function RdSelect({ value, onChange, children, label, className = '' }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; label: string; className?: string;
}) {
  const options = optionsOf(children);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listId = React.useId();
  const current = options.find((o) => o.value === value) ?? null;
  const searchable = options.length > 8;
  const shown = q.trim() ? options.filter((o) => o.text.toLowerCase().includes(q.trim().toLowerCase())) : options;
  // A first option with an empty value is the placeholder ("Member", "All coaches"…).
  const isPlaceholder = !current || (current.value === '' && options[0]?.value === '');

  const openList = () => {
    setQ('');
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o: SelectOption) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    anchor?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0); }
    else if (e.key === 'End') { e.preventDefault(); setHi(shown.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = shown[hi]; if (o) pick(o); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button ref={setAnchor} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey} data-rd-select={label}
        className="v2-select h-9 w-full pl-3 pr-9 rounded-lg text-[13px] text-left outline-none cursor-pointer"
        style={{
          background: 'var(--v2-field, rgba(255,255,255,0.03))',
          border: `1px solid ${open ? 'var(--color-primary)' : 'rgb(var(--hair-rgb, 255 255 255) / 0.12)'}`,
          color: isPlaceholder ? SECOND : 'var(--color-text-primary)',
        }}>
        <span className="block truncate">{current?.text ?? options[0]?.text ?? label}</span>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-transform"
          style={{ color: SECOND, transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)` }} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={Math.max(anchor?.offsetWidth ?? 200, 200)}>
        {/* Theme colours, never a fixed #1A1530: in light that was a dark box with dark words (owner, 2026-11-07). */}
        <div className="v2-menu" style={{ background: 'var(--surface-solid, #161622)', boxShadow: 'inset 0 0 0 1px rgb(var(--hair-rgb, 255 255 255) / 0.12)', borderRadius: 8 }}>
          {searchable && (
            <div className="p-2" style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.07)' }}>
              <label className="relative block">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
                <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey} placeholder={`Find ${label.toLowerCase()}`}
                  aria-label={`Find ${label.toLowerCase()}`}
                  className="w-full h-9 pl-8 pr-3 rounded-lg text-[13.5px] text-white outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)' }} />
              </label>
            </div>
          )}
          <div id={listId} role="listbox" aria-label={label} className="max-h-[300px] overflow-y-auto p-1.5" style={{ scrollbarWidth: 'thin' }}>
            {shown.length === 0 ? (
              <p className="px-3 py-3 text-[13px]" style={{ color: MUTED }}>No match for &ldquo;{q}&rdquo;</p>
            ) : shown.map((o, i) => {
              const on = o.value === value;
              return (
                <button key={`${o.value}-${i}`} type="button" role="option" aria-selected={on} disabled={o.disabled}
                  onMouseEnter={() => setHi(i)} onClick={() => pick(o)}
                  ref={(el) => { if (el && i === hi && open) el.scrollIntoView({ block: 'nearest' }); }}
                  className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] text-left disabled:opacity-40"
                  style={{ background: i === hi ? 'rgb(var(--hair-rgb, 255 255 255) / 0.06)' : 'transparent', color: o.value === '' ? SECOND : 'var(--color-text-primary)', fontWeight: on ? 600 : 400 }}>
                  <span className="flex-1 truncate">{o.text}</span>
                  {on && <Check size={14} style={{ color: 'var(--color-text-primary)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'amber' | 'ghost' | 'danger' | 'soft';
const BTN: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: 'var(--v2-act, #F59E0B)', color: 'var(--v2-on-act, #1a1206)', border: '1px solid transparent' },
  secondary: { background: 'var(--rd-soft-bg, rgba(255,255,255,0.025))', color: 'var(--color-text-primary)', border: '1px solid var(--rd-input-line, rgba(255,255,255,0.12))' },
  amber: { background: 'transparent', color: 'var(--color-text-primary)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.14)' },
  ghost: { background: 'transparent', color: SECOND, border: '1px solid transparent' },
  danger: { background: 'transparent', color: TONE.red.fg, border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.14)' },
  soft: { background: 'transparent', color: 'var(--color-text-primary)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.14)' },
};

export function RdButton({ variant = 'secondary', icon: Icon, children, size = 'md', className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; icon?: LucideIcon; size?: 'sm' | 'md' | 'lg';
}) {
  const h = size === 'lg' ? 'h-10 px-4 text-[14px]' : size === 'sm' ? 'h-8 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13px]';
  return (
    <button type="button" {...rest}
      className={`${h} v2-btn rounded-lg inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${className}`} data-variant={variant}
      style={{ ...BTN[variant], ...rest.style }}>
      {Icon && <Icon size={size === 'sm' ? 14 : 15} />}{children}
    </button>
  );
}

export function Pill({ tone = 'gray', children, icon: Icon, solidDot }: { tone?: Tone; children: React.ReactNode; icon?: LucideIcon; solidDot?: boolean }) {
  const t = TONE[tone];
  return (
    // Design V2: status is a dot and a word, never a coloured pill (owner, 2026-11-22). `solidDot` is
    // kept for callers; every pill now has its dot unless it carries an icon, which takes the dot's place.
    <span data-pill={tone} data-solid-dot={solidDot ? 'true' : undefined}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap"
      style={{ color: 'var(--color-text-primary)' }}>
      {Icon ? <Icon size={14} style={{ color: t.fg }} /> : <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: t.dot }} />}
      {children}
    </span>
  );
}

// ─── The "…" menu ────────────────────────────────────────────────────────────

export interface MenuItem { label: string; icon?: LucideIcon; onClick: () => void; tone?: 'danger' | 'warn'; hidden?: boolean; disabled?: boolean }

export function DotMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;
  const setOpen = (v: boolean) => { if (!v) setAnchor(null); };
  const shown = items.filter((i) => !i.hidden);
  if (shown.length === 0) return null;
  return (
    <>
      <button type="button" aria-label={label} onClick={(e) => { e.stopPropagation(); setAnchor(anchor ? null : e.currentTarget); }} data-dot-menu
        className="w-10 h-10 rounded-xl grid place-items-center transition-colors hover:bg-white/5"
        style={{ border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)', color: 'var(--color-text-primary)' }}>
        <MoreHorizontal size={18} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={220}>
        <div className="py-1.5" role="menu">
          {shown.map((i) => {
            const Icon = i.icon;
            return (
              <button key={i.label} type="button" role="menuitem" disabled={i.disabled}
                onClick={(e) => { e.stopPropagation(); setOpen(false); i.onClick(); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] hover:bg-white/5 disabled:opacity-40"
                style={{ color: i.tone === 'danger' ? TONE.red.fg : i.tone === 'warn' ? TONE.amber.fg : 'var(--color-text-primary)' }}>
                {Icon && <Icon size={16} />}{i.label}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export function RdTable({ head, children, empty, boxRef }: {
  head: (string | { label: React.ReactNode; className?: string; align?: 'right' | 'center' })[]; children: React.ReactNode; empty?: React.ReactNode;
  /** Fit pages: the table scrolls in its own box, measured by useFitRows. */
  boxRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <div ref={boxRef} className={boxRef ? 'rd-fit-scroll' : 'overflow-x-auto'} data-rd-table>
      <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {head.map((h, i) => {
              const cell = typeof h === 'string' ? { label: h } : h;
              return (
                <th key={i} className={`text-[12px] font-medium py-2.5 px-4 whitespace-nowrap sticky top-0 z-[1] ${cell.className ?? ''}`}
                  style={{ color: MUTED, textAlign: cell.align ?? 'left', borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)', background: 'var(--surface-solid, #161622)' }}>
                  {cell.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Tr({ children, onClick, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr {...rest} onClick={onClick} className={`group v2-tr ${onClick ? 'cursor-pointer' : ''}`}>{children}</tr>
  );
}

export function Td({ children, className = '', align, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'right' | 'center' }) {
  return (
    <td {...rest} className={`py-2.5 px-4 align-middle text-[13px] tabular-nums ${className}`}
      style={{ borderBottom: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.06)', textAlign: align, color: 'var(--color-text-primary)', ...rest.style }}>
      {children}
    </td>
  );
}

/** "Showing 1–10 of 160 members" and pill pages, with … for long ranges. */
export function TableFooter({ page, perPage, total, noun, onPage }: { page: number; perPage: number; total: number; noun: string; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1, to = Math.min(total, page * perPage);
  const nums: (number | '…')[] = [];
  if (pages <= 7) for (let i = 1; i <= pages; i++) nums.push(i);
  else {
    nums.push(1);
    if (page > 3) nums.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) nums.push(i);
    if (page < pages - 2) nums.push('…');
    nums.push(pages);
  }
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5" data-rd-footer>
      <p className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{from}–{to} of {total.toLocaleString('en-PH')} {noun}</p>
      {pages > 1 && (
        <div className="v2-pager">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></button>
          {nums.map((n, i) => n === '…'
            ? <span key={`e${i}`}>…</span>
            : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>)}
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

export function EmptyBlock({ icon: Icon, title, body, action, compact }: { icon: LucideIcon; title: string; body?: React.ReactNode; action?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-6' : 'py-12'} px-6`} data-rd-empty>
      <Icon size={20} strokeWidth={1.75} style={{ color: MUTED }} />
      <p className="text-[13px] font-semibold mt-3" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
      {body && <p className="text-[12.5px] mt-1 max-w-sm" style={{ color: SECOND }}>{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── The right rail ──────────────────────────────────────────────────────────

export function RailCard({ icon, tone = 'violet', title, sub, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & {
  icon?: LucideIcon; tone?: Tone; title: string; sub?: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <RdCard className="p-4" {...rest}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={16} style={{ color: tone === 'amber' ? 'var(--v2-warn, #F59E0B)' : MUTED }} strokeWidth={1.75} />}
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
      </div>
      {sub && <p className="text-[12.5px] mt-1" style={{ color: SECOND }}>{sub}</p>}
      <div className="mt-3 flex flex-col gap-1.5">{children}</div>
    </RdCard>
  );
}

export function RailAction({ icon: Icon, label, onClick, href }: { icon: LucideIcon; label: string; onClick?: () => void; href?: string }) {
  const cls = 'v2-railbtn';
  return href
    ? <a href={href} className={cls}><Icon size={15} />{label}</a>
    : <button type="button" onClick={onClick} className={cls}><Icon size={15} />{label}</button>;
}

export function RailRow({ tone, label, count, onClick }: { tone: Tone; label: string; count: number | string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: TONE[tone].dot }} />
      <span className="flex-1 text-left">{label}</span>
      <b className="tabular-nums font-semibold">{count}</b>
      {onClick && <ChevronRight size={14} style={{ color: MUTED }} />}
    </>
  );
  // A row with nothing to open is a row, not a disabled button.
  return onClick
    ? <button type="button" onClick={onClick} className="v2-railrow">{inner}</button>
    : <div className="v2-railrow">{inner}</div>;
}

export function TipCard({ children, title = 'Tip' }: { children: React.ReactNode; title?: string }) {
  return (
    <RdCard className="p-4">
      <div className="flex items-center gap-2">
        <Lightbulb size={15} style={{ color: MUTED }} />
        <h4 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h4>
      </div>
      <div className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: SECOND }}>{children}</div>
    </RdCard>
  );
}

/** Two columns: the page and its rail. The rail drops below on a narrow screen. */
export function WithRail({ children, rail }: { children: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="rd-with-rail" data-with-rail>
      <div className="min-w-0 flex flex-col gap-6">{children}</div>
      <aside className="min-w-0 flex flex-col gap-5">{rail}</aside>
    </div>
  );
}

/** A colourful initials circle (photos still win), as in the mock-ups. */
const AVATAR_TONES = ['#8B5CF6', '#F59E0B', '#7C3AED', '#F59E0B', '#A855F7'];
export function Initials({ name, photo, size = 44, tone }: { name: string; photo?: string | null; size?: number; tone?: 'violet' | 'amber' }) {
  const [broken, setBroken] = useState(false);
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  if (photo && !broken) return <img src={photo} alt="" onError={() => setBroken(true)} className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />;
  void tone; void AVATAR_TONES;
  return (
    <span className="rounded-full grid place-items-center font-semibold flex-none" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)),
      background: 'var(--raised-solid, #1E1B30)', color: 'var(--color-text-secondary)' }}>{init}</span>
  );
}

/**
 * A fit page's body (2026-10-11): from 1280px wide it holds the screen — the main column and the
 * rail each scroll in their own box, never the page. Pair with `rd-fit` on the page root.
 */
export function FitBody({ children, rail }: { children: React.ReactNode; rail?: React.ReactNode }) {
  return (
    <div className="rd-fit-grid" data-fit-body style={rail ? undefined : { gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div className="rd-fit-main">{children}</div>
      {rail && <aside className="rd-fit-rail">{rail}</aside>}
    </div>
  );
}


/**
 * In-page sections as one segmented bar (role=tab buttons, not links): the page
 * keeps its own state, usually in `?tab=`. A count shows in amber when something waits.
 */
export function PageTabs<K extends string>({ tabs, value, onChange, label }: {
  tabs: { key: K; label: string; count?: number; icon?: LucideIcon }[]; value: K; onChange: (k: K) => void; label: string;
}) {
  return (
    <div className="v2-seg" role="tablist" aria-label={label} data-page-tabs>
      {tabs.map((t) => {
        const on = t.key === value;
        const Icon = t.icon;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.key)} data-tab={t.key}
            data-on={on || undefined}>
            {Icon && <Icon size={14} />}{t.label}
            {t.count ? <em>{t.count}</em> : null}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled field in the kit's look — a text input, number or textarea. */
export function RdField({ label, hint, group, children }: { label: string; hint?: React.ReactNode; group?: boolean; children: React.ReactNode }) {
  // A row of buttons is a group, never inside a <label>: a label names its first button after
  // the whole row, and a tap on the hint presses that button.
  if (group) return (
    <div role="group" aria-label={label} className="block">
      <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: SECOND }}>{label}</span>
      {children}
      {hint && <span className="block text-[12px] mt-1" style={{ color: MUTED }}>{hint}</span>}
    </div>
  );
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: SECOND }}>{label}</span>
      {children}
      {hint && <span className="block text-[12px] mt-1" style={{ color: MUTED }}>{hint}</span>}
    </label>
  );
}

// ─── Design V2 pilot (owner, 2026-11-23: "too bland"): figures that move, shapes for numbers ─────────────

/**
 * A whole number that counts up once when it appears (CSS only: a registered custom property animated
 * from 0, drawn by a counter). The real number is always in the page for readers and checks; with
 * reduced motion, or a number past 999 (a counter cannot draw the comma), it is plain text.
 */
export function CountUp({ value }: { value: number }) {
  if (!Number.isInteger(value) || value < 0 || value > 999) return <>{value.toLocaleString('en-PH')}</>;
  return (
    <span className="v2-countup">
      <span className="sr-only">{value}</span>
      <span aria-hidden className="v2-countup-n" style={{ '--v2-n': value } as React.CSSProperties} />
    </span>
  );
}

/** A grey shape where a value will be, instead of "…" or "Loading…". */
export function Skel({ w = 48, h = 14 }: { w?: number | string; h?: number }) {
  return <span className="v2-skel" style={{ width: w, height: h }} aria-hidden />;
}

/**
 * A small trend line from real values, optionally over a comparison line (for example last month to the
 * same day). It draws itself in from the left. Nothing is drawn with fewer than two points.
 */
export function Spark({ values, compare, label }: { values: number[]; compare?: number[]; label: string }) {
  const n = Math.max(values.length, compare?.length ?? 0);
  if (values.length < 2) return null;
  const max = Math.max(1, ...values, ...(compare ?? []));
  const pts = (v: number[]) => v.map((y, i) => `${((i / (n - 1)) * 100).toFixed(2)},${(29 - (y / max) * 27).toFixed(2)}`).join(' ');
  return (
    <svg className="v2-spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label}>
      {compare && compare.length > 1 && <polyline className="cmp" points={pts(compare)} vectorEffect="non-scaling-stroke" />}
      <polyline className="cur" points={pts(values)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A handful of bars (for example new members per month), the last one in the gym's colour; each says its value on hover. */
export function MiniBars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="v2-minibars" role="img" aria-label={values.map((v, i) => `${labels[i]}: ${v}`).join(', ')}>
      {values.map((v, i) => (
        <span key={labels[i]} data-tip={`${labels[i]}: ${v}`} className={i === values.length - 1 ? 'now' : ''}
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, '--i': i } as React.CSSProperties} />
      ))}
    </div>
  );
}
