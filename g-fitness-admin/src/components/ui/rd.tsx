import * as React from 'react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MoreHorizontal, Search, ChevronDown, Lightbulb } from 'lucide-react';
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

const CARD_BG = 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0) 60%), var(--color-surface)';
const CARD_LINE = '1px solid rgba(255, 255, 255, 0.06)';
const MUTED = 'var(--color-text-muted)';
const SECOND = 'var(--color-text-secondary)';

// ─── Page header ─────────────────────────────────────────────────────────────

export interface RdTab { label: string; to: string; count?: number }

/** A section's sibling pages as pills (NavLinks — every bookmark still works). */
export function RdTabs({ tabs }: { tabs: RdTab[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex items-center gap-2" role="tablist" data-rd-tabs>
      {tabs.map((t) => {
        const on = pathname === t.to;
        return (
          <NavLink key={t.to} to={t.to} role="tab" aria-selected={on}
            className="h-10 px-5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            style={{
              background: on ? 'rgba(124, 58, 237, 0.18)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${on ? 'rgba(139, 92, 246, 0.7)' : 'rgba(255,255,255,0.08)'}`,
              color: on ? '#E9E3FF' : SECOND,
              boxShadow: on ? '0 0 0 3px rgba(124, 58, 237, 0.12)' : undefined,
            }}>
            {t.label}
            {t.count ? <span className="text-xs px-1.5 rounded-full" style={{ background: TONE.amber.bg, color: TONE.amber.fg }}>{t.count}</span> : null}
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
          <h1 className="text-[30px] leading-tight font-bold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-[15px] mt-1" style={{ color: SECOND }}>{subtitle}</p>}
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
    <div {...rest} className={`rounded-2xl ${className}`}
      style={{
        background: glow
          ? 'radial-gradient(120% 160% at 0% 0%, rgba(124, 58, 237, 0.30), rgba(124, 58, 237, 0) 55%), radial-gradient(80% 120% at 100% 100%, rgba(124, 58, 237, 0.10), transparent 60%), var(--color-surface)'
          : CARD_BG,
        border: glow ? '1px solid rgba(139, 92, 246, 0.28)' : CARD_LINE,
        ...style,
      }}>
      {children}
    </div>
  );
}

export function IconTile({ icon: Icon, tone = 'violet', size = 56 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  const t = TONE[tone];
  return (
    <span className="grid place-items-center flex-none" style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), background: t.bg, border: `1px solid ${t.line}`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 30px -14px ${t.dot}`,
    }}>
      <Icon size={Math.round(size * 0.44)} style={{ color: t.fg }} strokeWidth={1.9} />
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
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
        background: tone === 'amber' ? 'linear-gradient(90deg,#F59E0B,#FBBF24)' : 'linear-gradient(90deg,#6D28D9,#8B5CF6)' }} />
    </div>
  );
}

// ─── Stat tiles ──────────────────────────────────────────────────────────────

export function StatTile({ icon, tone = 'violet', label, value, sub, onClick, tip, active }: {
  icon: LucideIcon; tone?: Tone; label: string; value: React.ReactNode; sub?: React.ReactNode;
  onClick?: () => void; tip?: string; active?: boolean;
}) {
  const body = (
    <>
      <IconTile icon={icon} tone={tone} size={60} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
        <span className="block text-[30px] leading-tight font-bold text-white tabular-nums">{value}</span>
        {sub && <span className="block text-[13px]" style={{ color: SECOND }}>{sub}</span>}
      </span>
      {onClick && <ChevronRight size={18} style={{ color: SECOND }} className="flex-none" />}
    </>
  );
  const style: React.CSSProperties = {
    background: active ? 'radial-gradient(120% 140% at 0% 0%, rgba(124,58,237,0.22), transparent 60%), var(--color-surface)' : CARD_BG,
    border: active ? '1px solid rgba(139, 92, 246, 0.55)' : CARD_LINE,
  };
  return onClick ? (
    <button type="button" onClick={onClick} data-tip={tip} className="rounded-2xl p-5 flex items-center gap-4 text-left transition-transform hover:-translate-y-0.5" style={style}>{body}</button>
  ) : (
    <div data-tip={tip} className="rounded-2xl p-5 flex items-center gap-4" style={style}>{body}</div>
  );
}

// ─── Filter chips ────────────────────────────────────────────────────────────

export interface Chip<K extends string> { key: K; label: string; count?: number | null; tone?: Tone }

export function FilterChips<K extends string>({ items, value, onChange }: { items: Chip<K>[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap" data-rd-chips role="tablist">
      {items.map((c) => {
        const on = c.key === value;
        return (
          <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(c.key)} data-chip={c.key}
            className="h-12 px-4 rounded-xl inline-flex items-center gap-2.5 text-[15px] transition-colors"
            style={{
              background: on ? 'rgba(124, 58, 237, 0.2)' : CARD_BG,
              border: `1px solid ${on ? 'rgba(139, 92, 246, 0.75)' : 'rgba(255,255,255,0.07)'}`,
              color: on ? '#EDE9FE' : 'var(--color-text-primary)',
            }}>
            {c.tone && <span className="w-2.5 h-2.5 rounded-full" style={{ background: TONE[c.tone].dot }} />}
            <span style={{ color: on ? '#EDE9FE' : SECOND }}>{c.label}</span>
            {c.count != null && <b className="text-[17px] tabular-nums text-white">{c.count}</b>}
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
      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        aria-label={label ?? placeholder} onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
        className="w-full h-12 pl-11 pr-4 rounded-xl text-[15px] text-white outline-none focus:ring-2"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }} />
    </label>
  );
}

export function RdSelect({ value, onChange, children, label, className = '' }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; label: string; className?: string;
}) {
  return (
    <label className={`relative inline-block ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="appearance-none h-12 w-full pl-4 pr-10 rounded-xl text-[15px] text-white outline-none cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', colorScheme: 'dark' }}>
        {children}
      </select>
      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SECOND }} />
    </label>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'amber' | 'ghost' | 'danger' | 'soft';
const BTN: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: 'linear-gradient(180deg, #8B5CF6, #7C3AED)', color: '#fff', border: '1px solid rgba(167,139,250,0.6)', boxShadow: '0 10px 30px -12px rgba(124,58,237,0.8)' },
  secondary: { background: 'rgba(255,255,255,0.025)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' },
  amber: { background: TONE.amber.bg, color: TONE.amber.fg, border: `1px solid ${TONE.amber.line}` },
  ghost: { background: 'transparent', color: SECOND, border: '1px solid transparent' },
  danger: { background: TONE.red.bg, color: TONE.red.fg, border: `1px solid ${TONE.red.line}` },
  soft: { background: TONE.violet.bg, color: TONE.violet.fg, border: `1px solid ${TONE.violet.line}` },
};

export function RdButton({ variant = 'secondary', icon: Icon, children, size = 'md', className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; icon?: LucideIcon; size?: 'sm' | 'md' | 'lg';
}) {
  const h = size === 'lg' ? 'h-[52px] px-6 text-base' : size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-12 px-5 text-[15px]';
  return (
    <button type="button" {...rest}
      className={`${h} rounded-xl inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{ ...BTN[variant], ...rest.style }}>
      {Icon && <Icon size={size === 'sm' ? 15 : 18} />}{children}
    </button>
  );
}

export function Pill({ tone = 'gray', children, icon: Icon, solidDot }: { tone?: Tone; children: React.ReactNode; icon?: LucideIcon; solidDot?: boolean }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13.5px] font-medium whitespace-nowrap"
      style={{ background: t.bg, border: `1px solid ${t.line}`, color: t.fg }}>
      {solidDot && <span className="w-2 h-2 rounded-full" style={{ background: t.dot }} />}
      {Icon && <Icon size={14} />}
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
        style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-primary)' }}>
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

export function RdTable({ head, children, empty }: {
  head: (string | { label: React.ReactNode; className?: string; align?: 'right' | 'center' })[]; children: React.ReactNode; empty?: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto" data-rd-table>
      <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {head.map((h, i) => {
              const cell = typeof h === 'string' ? { label: h } : h;
              return (
                <th key={i} className={`text-[12.5px] font-semibold uppercase tracking-wider py-4 px-4 whitespace-nowrap ${cell.className ?? ''}`}
                  style={{ color: SECOND, textAlign: cell.align ?? 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
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
    <tr {...rest} onClick={onClick} className={`group transition-colors hover:bg-white/[0.025] ${onClick ? 'cursor-pointer' : ''}`}>{children}</tr>
  );
}

export function Td({ children, className = '', align, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'right' | 'center' }) {
  return (
    <td {...rest} className={`py-3.5 px-4 align-middle text-[14.5px] ${className}`}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: align, color: 'var(--color-text-primary)', ...rest.style }}>
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
  const btn = (on: boolean): React.CSSProperties => ({
    background: on ? 'linear-gradient(180deg,#8B5CF6,#7C3AED)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${on ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.08)'}`, color: on ? '#fff' : 'var(--color-text-primary)',
  });
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-4" data-rd-footer>
      <p className="text-[14.5px]" style={{ color: SECOND }}>Showing {from}–{to} of {total.toLocaleString('en-PH')} {noun}</p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}
            className="w-10 h-10 rounded-full grid place-items-center disabled:opacity-30" style={btn(false)}><ChevronLeft size={16} /></button>
          {nums.map((n, i) => n === '…'
            ? <span key={`e${i}`} className="px-1" style={{ color: SECOND }}>…</span>
            : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
                className="h-10 px-2 rounded-full text-[14px] font-semibold" style={{ ...btn(n === page), minWidth: 40 }}>{n}</button>)}
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}
            className="w-10 h-10 rounded-full grid place-items-center disabled:opacity-30" style={btn(false)}><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

export function EmptyBlock({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6" data-rd-empty>
      <Icon size={52} strokeWidth={1.4} style={{ color: 'rgba(196, 181, 253, 0.55)' }} />
      <p className="text-[17px] font-semibold text-white mt-4">{title}</p>
      {body && <p className="text-[14.5px] mt-1.5 max-w-md" style={{ color: SECOND }}>{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── The right rail ──────────────────────────────────────────────────────────

export function RailCard({ icon, tone = 'violet', title, sub, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & {
  icon?: LucideIcon; tone?: Tone; title: string; sub?: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <RdCard className="p-5" {...rest}>
      <div className="flex items-center gap-3">
        {Icon && <Icon size={26} style={{ color: TONE[tone].fg }} strokeWidth={1.8} />}
        <h3 className="text-[19px] font-semibold text-white">{title}</h3>
      </div>
      {sub && <p className="text-[14px] mt-1.5" style={{ color: SECOND }}>{sub}</p>}
      <div className="mt-4 flex flex-col gap-2.5">{children}</div>
    </RdCard>
  );
}

export function RailAction({ icon: Icon, label, onClick, href }: { icon: LucideIcon; label: string; onClick?: () => void; href?: string }) {
  const cls = 'h-14 px-4 rounded-xl flex items-center gap-3.5 text-[15.5px] font-semibold text-white transition-colors hover:bg-white/[0.04]';
  const st: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.015)' };
  return href
    ? <a href={href} className={cls} style={st}><Icon size={20} />{label}</a>
    : <button type="button" onClick={onClick} className={cls} style={st}><Icon size={20} />{label}</button>;
}

export function RailRow({ tone, label, count, onClick }: { tone: Tone; label: string; count: number | string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: TONE[tone].dot }} />
      <span className="flex-1 text-left">{label}</span>
      <b className="tabular-nums">{count}</b>
      {onClick && <ChevronRight size={16} style={{ color: SECOND }} />}
    </>
  );
  const cls = 'h-14 px-4 rounded-xl flex items-center gap-3 text-[15.5px] text-white';
  const st: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' };
  // A row with nothing to open is a row, not a disabled button.
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} transition-colors hover:bg-white/[0.04]`} style={st}>{inner}</button>
    : <div className={cls} style={st}>{inner}</div>;
}

export function TipCard({ children, title = 'Tip' }: { children: React.ReactNode; title?: string }) {
  return (
    <RdCard className="p-5">
      <div className="flex items-center gap-2.5">
        <Lightbulb size={20} style={{ color: '#FBBF24' }} />
        <h4 className="text-[16px] font-semibold text-white">{title}</h4>
      </div>
      <div className="text-[14px] mt-2 leading-relaxed" style={{ color: SECOND }}>{children}</div>
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
  const bg = tone === 'amber' ? '#F59E0B' : tone === 'violet' ? '#7C3AED' : AVATAR_TONES[(name.charCodeAt(0) || 0) % AVATAR_TONES.length];
  return (
    <span className="rounded-full grid place-items-center font-bold flex-none" style={{ width: size, height: size, fontSize: Math.round(size * 0.36),
      background: bg, color: bg === '#F59E0B' ? '#1A1205' : '#fff' }}>{init}</span>
  );
}
