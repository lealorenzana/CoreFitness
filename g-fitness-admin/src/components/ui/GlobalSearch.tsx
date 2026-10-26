import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Users, Dumbbell, ShieldCheck, CalendarDays, Repeat,
  PartyPopper, Banknote, CreditCard, BookOpen, CornerDownLeft, Loader2,
  ShoppingBag, ListChecks, CalendarRange, Flag, Gift, Trophy, Wrench, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  globalSearch, KIND_LABEL, KIND_ORDER, KIND_PAGE, MIN_QUERY_LENGTH,
  type SearchHit, type SearchKind,
} from '../../services/searchService';
import { allPages, searchPlaces } from '../../services/searchPages';
import { NAV, isGroup, type Leaf } from '../layout/nav';
import { useNavAccess } from '../../hooks/useNavAccess';
import Avatar from './Avatar';

const BORDER      = 'var(--color-border)';
const PRIMARY     = 'var(--color-primary)';
const TEXT_SECOND = 'var(--color-text-secondary)';
const TEXT_MUTED  = 'var(--color-text-muted)';
const PANEL       = '#15131F';
const WELL        = 'rgba(255,255,255,0.035)';
const HOVER       = 'rgba(124,58,237,0.16)';

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  member: Users, trainer: Dumbbell, staff: ShieldCheck, class: CalendarDays, template: Repeat,
  event: PartyPopper, plan: Banknote, payment: CreditCard, resource: BookOpen,
  product: ShoppingBag, exercise: ListChecks, program: CalendarRange, challenge: Flag,
  reward: Gift, badge: Trophy, equipment: Wrench,
};

/** The chips across the top: each narrows the list to a few kinds. */
type Scope = 'all' | 'pages' | 'people' | 'money' | 'classes' | 'training' | 'engagement';
const SCOPES: { key: Scope; label: string; kinds: SearchKind[] }[] = [
  { key: 'all', label: 'All', kinds: [] },
  { key: 'pages', label: 'Pages', kinds: [] },
  { key: 'people', label: 'People', kinds: ['member', 'trainer', 'staff'] },
  { key: 'money', label: 'Money', kinds: ['payment', 'plan', 'product'] },
  { key: 'classes', label: 'Classes', kinds: ['class', 'template', 'event'] },
  { key: 'training', label: 'Training', kinds: ['exercise', 'program', 'resource', 'equipment'] },
  { key: 'engagement', label: 'Engagement', kinds: ['challenge', 'reward', 'badge'] },
];

/** One row in the list, whether a page or a record. */
interface Row {
  key: string;
  section: string;
  title: string;
  subtitle: string | null;
  tag?: string | null;
  icon: LucideIcon;
  photoUrl?: string | null;
  href: string;
}

/** Waits for typing to settle before querying: a burst of keys is one round trip. */
const DEBOUNCE_MS = 180;

/** The title with the typed text marked, so it is clear why a row matched. */
function Marked({ text, term }: { text: string; term: string }): ReactNode {
  const t = term.trim();
  const i = t ? text.toLowerCase().indexOf(t.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="bg-transparent font-semibold" style={{ color: '#C4B5FD' }}>{text.slice(i, i + t.length)}</mark>{text.slice(i + t.length)}</>;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const canSee = useNavAccess();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [failed, setFailed] = useState<SearchKind[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  /** "Searched and found nothing", apart from "nothing typed yet". */
  const [searched, setSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** An older, slower request must not overwrite a newer one's results. */
  const requestId = useRef(0);

  // Closing resets everything here, in the handler, not in an effect on `open`.
  const close = useCallback(() => {
    setOpen(false); setTerm(''); setScope('all'); setHits([]); setFailed([]); setSearched(false); setCursor(0);
  }, []);

  // Ctrl/Cmd+K from anywhere; Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close(); else setOpen(true);
      }
      if (e.key === 'Escape' && open) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await globalSearch(trimmed);
        if (id !== requestId.current) return;
        setHits(res.hits); setFailed(res.failed); setSearched(true); setCursor(0);
      } catch {
        if (id !== requestId.current) return;
        setHits([]); setSearched(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  /** A record kind is offered only if this account may open the page it lives on. */
  const kindVisible = useMemo(() => {
    const leaves = new Map<string, Leaf>();
    for (const e of NAV) for (const l of isGroup(e) ? e.children : [e]) leaves.set(l.path, l);
    return (k: SearchKind) => { const l = leaves.get(KIND_PAGE[k]); return !l || canSee(l); };
  }, [canSee]);

  const active = term.trim().length >= MIN_QUERY_LENGTH;
  const places = useMemo(() => (active ? searchPlaces(term, canSee, 8) : []), [active, term, canSee]);
  const visibleHits = useMemo(() => hits.filter((h) => kindVisible(h.kind)), [hits, kindVisible]);

  /** How many rows each chip would show, so an empty chip reads as empty before it is pressed. */
  const counts = useMemo(() => {
    const c: Record<Scope, number> = { all: 0, pages: places.length, people: 0, money: 0, classes: 0, training: 0, engagement: 0 };
    for (const h of visibleHits) for (const s of SCOPES) if (s.kinds.includes(h.kind)) c[s.key] += 1;
    c.all = places.length + visibleHits.length;
    return c;
  }, [places, visibleHits]);

  /** The rows as drawn, in order, so ↑/↓ walk exactly what is on screen. */
  const rows = useMemo<Row[]>(() => {
    if (!active) {
      return allPages(canSee).map((p) => ({ key: p.id, section: 'Go to', title: p.title, subtitle: p.subtitle, icon: p.icon, href: p.href }));
    }
    const out: Row[] = [];
    if (scope === 'all' || scope === 'pages') {
      for (const p of places) out.push({ key: p.id, section: 'Pages and settings', title: p.title, subtitle: p.subtitle, tag: p.tag, icon: p.icon, href: p.href });
    }
    if (scope !== 'pages') {
      const allowed = scope === 'all' ? null : SCOPES.find((s) => s.key === scope)!.kinds;
      for (const k of KIND_ORDER) {
        if (allowed && !allowed.includes(k)) continue;
        for (const h of visibleHits) {
          if (h.kind !== k) continue;
          out.push({ key: `${h.kind}-${h.id}`, section: KIND_LABEL[k], title: h.title, subtitle: h.subtitle, tag: h.tag, icon: KIND_ICON[k], photoUrl: h.photoUrl, href: h.href });
        }
      }
    }
    return out;
  }, [active, canSee, scope, places, visibleHits]);

  const showLoading = active && loading;
  const showEmpty = active && searched && !loading && rows.length === 0;
  const shownFailed = failed.filter(kindVisible);

  const go = (href: string) => { close(); navigate(href); };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && rows[cursor]) { e.preventDefault(); go(rows[cursor].href); }
    else if (e.key === 'Tab' && active) {
      // Tab walks the chips, so narrowing never needs the mouse.
      e.preventDefault();
      const i = SCOPES.findIndex((s) => s.key === scope);
      setScope(SCOPES[(i + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length].key);
      setCursor(0);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const trigger = (
    <button
      onClick={() => setOpen(true)}
      data-tip="Find a member, payment, class, page or setting — a letter is enough (Ctrl K)"
      className="flex items-center gap-2 h-10 pl-3 pr-2 rounded-full transition-colors w-full max-w-md"
      style={{ background: 'var(--color-surface-raised)', border: `1px solid ${BORDER}` }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
    >
      <Search size={15} style={{ color: TEXT_MUTED }} />
      <span className="text-sm flex-1 text-left" style={{ color: TEXT_MUTED }}>Search anything…</span>
      <kbd className="hidden md:inline-flex items-center h-6 px-1.5 rounded text-xs font-medium"
        style={{ background: 'var(--color-surface)', border: `1px solid ${BORDER}`, color: TEXT_MUTED }}>Ctrl K</kbd>
    </button>
  );

  const list = rows.map((r, index) => {
    const head = index === 0 || rows[index - 1].section !== r.section ? r.section : null;
    const on = index === cursor;
    const Icon = r.icon;
    return (
      <div key={r.key}>
        {head && (
          <p className="px-5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: TEXT_MUTED }}>{head}</p>
        )}
        <button
          data-index={index}
          data-search-row={r.section}
          onClick={() => go(r.href)}
          onMouseMove={() => { if (cursor !== index) setCursor(index); }}
          className="w-[calc(100%-16px)] mx-2 text-left px-3 py-2 flex items-center gap-3 rounded-xl"
          style={{ background: on ? HOVER : 'transparent', boxShadow: on ? 'inset 0 0 0 1px rgba(139,92,246,0.35)' : 'none' }}
        >
          {r.photoUrl !== undefined
            ? <Avatar name={r.title} photoUrl={r.photoUrl} size={32} />
            : (
              <span className="w-8 h-8 rounded-lg grid place-items-center flex-none"
                style={{ background: on ? 'rgba(124,58,237,0.3)' : WELL, color: on ? '#C4B5FD' : TEXT_SECOND }}>
                <Icon size={15} />
              </span>
            )}
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-white truncate"><Marked text={r.title} term={active ? term : ''} /></span>
            {r.subtitle && <span className="block text-xs truncate" style={{ color: TEXT_MUTED }}>{r.subtitle}</span>}
          </span>
          {r.tag && (
            <span className="text-[11px] px-2 py-0.5 rounded-full flex-none"
              style={{ background: WELL, color: TEXT_SECOND, border: `1px solid ${BORDER}` }}>{r.tag}</span>
          )}
          {on
            ? <CornerDownLeft size={14} className="flex-none" style={{ color: '#C4B5FD' }} />
            : <ArrowRight size={14} className="flex-none opacity-0" />}
        </button>
      </div>
    );
  });

  const dialog = open && (
    <>
      <div className="absolute inset-0 gs-fade" style={{ background: 'rgba(5,4,10,0.66)', backdropFilter: 'blur(3px)' }} onClick={close} />
      <div
        role="dialog" aria-modal="true" aria-label="Search"
        className="relative mt-[10vh] w-[min(720px,94vw)] rounded-2xl overflow-hidden gs-rise flex flex-col"
        style={{ background: `radial-gradient(90% 60% at 0% 0%, rgba(124,58,237,0.16), transparent 60%), ${PANEL}`,
          border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 40px 100px -30px rgba(0,0,0,0.9)', maxHeight: '76vh' }}
      >
        <style>{'@keyframes gsFade{from{opacity:0}to{opacity:1}}@keyframes gsRise{from{opacity:0;transform:translateY(-10px) scale(.985)}to{opacity:1;transform:none}}.gs-fade{animation:gsFade .15s ease both}.gs-rise{animation:gsRise .18s ease both}@media (prefers-reduced-motion: reduce){.gs-fade,.gs-rise{animation:none}}'}</style>
        <div className="flex items-center gap-3 px-5 h-16 flex-none" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {showLoading
            ? <Loader2 size={19} className="animate-spin flex-none" style={{ color: '#A78BFA' }} />
            : <Search size={19} className="flex-none" style={{ color: '#A78BFA' }} />}
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => { setTerm(e.target.value); setCursor(0); }}
            onKeyDown={onInputKey}
            aria-label="Search everything"
            placeholder="Search members, payments, classes, pages, settings…"
            className="flex-1 bg-transparent text-[15px] text-white outline-none focus-visible:outline-none border-0 focus:ring-0 placeholder:text-[var(--color-text-muted)]"
          />
          {term && (
            <button onClick={() => { setTerm(''); setCursor(0); inputRef.current?.focus(); }}
              className="text-xs px-2 h-7 rounded-md" style={{ color: TEXT_MUTED, background: WELL }}>Clear</button>
          )}
          <button onClick={close} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Close search">
            <X size={17} />
          </button>
        </div>

        {active && (
          <div className="flex items-center gap-1.5 px-4 py-2.5 overflow-x-auto flex-none" style={{ borderBottom: `1px solid ${BORDER}` }} role="tablist" aria-label="Narrow the search">
            {SCOPES.map((s) => {
              const on = s.key === scope;
              const n = counts[s.key];
              return (
                <button key={s.key} role="tab" aria-selected={on} data-scope={s.key}
                  onClick={() => { setScope(s.key); setCursor(0); inputRef.current?.focus(); }}
                  className="h-7 px-3 rounded-full text-xs font-medium flex items-center gap-1.5 flex-none transition-colors"
                  style={{ background: on ? PRIMARY : WELL, color: on ? '#fff' : n ? TEXT_SECOND : TEXT_MUTED,
                    border: `1px solid ${on ? 'transparent' : BORDER}`, opacity: !on && searched && n === 0 ? 0.55 : 1 }}>
                  {s.label}
                  {searched && <span className="tabular-nums" style={{ opacity: 0.75 }}>{n}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div ref={listRef} className="overflow-y-auto flex-1 min-h-0 pb-2">
          {active && shownFailed.length > 0 && (
            <p className="px-5 pt-3 text-xs" style={{ color: 'var(--color-secondary)' }}>
              Could not search: {shownFailed.map((k) => KIND_LABEL[k]).join(', ')}
            </p>
          )}
          {!active && (
            <p className="px-5 pt-4 text-xs" style={{ color: TEXT_MUTED }}>
              Type anything — a name, an invoice number, an amount, a class, a page or a setting. Or jump to a page:
            </p>
          )}
          {list}
          {showEmpty && (
            <div className="px-6 py-12 text-center">
              <span className="w-11 h-11 mx-auto rounded-xl grid place-items-center" style={{ background: WELL, color: TEXT_MUTED }}><Search size={18} /></span>
              <p className="text-sm mt-3 text-white">
                Nothing {scope === 'all' ? '' : `in ${SCOPES.find((s) => s.key === scope)!.label} `}matches “{term.trim()}”
              </p>
              <p className="text-xs mt-1.5 max-w-md mx-auto" style={{ color: TEXT_MUTED }}>
                {scope !== 'all' && counts.all > 0
                  ? `${counts.all} found elsewhere — press All.`
                  : 'Searched every page and setting, and the names, emails, phones, invoices, amounts, classes, events, plans, products, exercises, programs, challenges, rewards, badges, equipment and resources you can open.'}
              </p>
            </div>
          )}
        </div>

        <div className="px-5 h-10 flex items-center gap-4 text-[11px] flex-none" style={{ borderTop: `1px solid ${BORDER}`, color: TEXT_MUTED }}>
          <span><Key>↑</Key><Key>↓</Key> move</span>
          <span><Key>↵</Key> open</span>
          {active && <span><Key>Tab</Key> narrow</span>}
          <span><Key>Esc</Key> close</span>
          {active && searched && <span className="ml-auto tabular-nums">{rows.length} {rows.length === 1 ? 'result' : 'results'}</span>}
        </div>
      </div>
    </>
  );

  return (
    <>
      {trigger}
      {/* Portalled to body so the header's stacking never traps it. The wrapper
          is always mounted and owns pointer-events, so a closed search can never
          leave an invisible backdrop eating clicks. */}
      {typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-center items-start"
          style={{ pointerEvents: open ? 'auto' : 'none' }}>
          {dialog}
        </div>,
        document.body,
      )}
    </>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid place-items-center min-w-[20px] h-5 px-1 mr-1 rounded text-[10px] font-medium"
      style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, color: TEXT_SECOND }}>{children}</kbd>
  );
}
