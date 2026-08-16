import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Users, Dumbbell, ShieldCheck, CalendarDays, Repeat,
  PartyPopper, Banknote, CreditCard, BookOpen, CornerDownLeft, Loader2,
} from 'lucide-react';
import {
  globalSearch, KIND_LABEL, KIND_ORDER, MIN_QUERY_LENGTH,
  type SearchHit, type SearchKind,
} from '../../services/searchService';
import Avatar from './Avatar';

const SURFACE        = 'var(--color-surface)';
const SURFACE_RAISED = 'var(--color-surface-raised)';
const BORDER         = 'var(--color-border)';
const PRIMARY        = 'var(--color-primary)';
const PRIMARY_LIGHT  = 'var(--color-primary-light)';
const TEXT_SECOND    = 'var(--color-text-secondary)';
const TEXT_MUTED     = 'var(--color-text-muted)';

const KIND_ICON: Record<SearchKind, typeof Users> = {
  member: Users,
  trainer: Dumbbell,
  staff: ShieldCheck,
  class: CalendarDays,
  template: Repeat,
  event: PartyPopper,
  plan: Banknote,
  payment: CreditCard,
  resource: BookOpen,
};

/** Waits for typing to settle before querying. 180ms is below the threshold
 *  where a keystroke feels laggy, and it collapses a burst of eight characters
 *  into one round trip instead of eight. */
const DEBOUNCE_MS = 180;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [failed, setFailed] = useState<SearchKind[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  /** Distinguishes "nothing typed yet" from "searched and found nothing". The
   *  empty state must not claim "No results" before a search has run. */
  const [searched, setSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Guards against an older, slower request overwriting a newer one's results. */
  const requestId = useRef(0);

  // Closing resets everything, and it happens in the handler rather than in an
  // effect watching `open`. Resetting from an effect means the dialog re-renders
  // once more after it has already gone — a cascading render for state nobody
  // will see, and the lint rule that flags it is right.
  const close = useCallback(() => {
    setOpen(false);
    setTerm('');
    setHits([]);
    setFailed([]);
    setSearched(false);
    setCursor(0);
  }, []);

  // Ctrl/Cmd+K from anywhere. Registered on the document so it works no matter
  // which page has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // Read `open` directly rather than from a functional updater: `close()`
        // is a side effect and must not run inside one.
        if (open) close(); else setOpen(true);
      }
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    // The dialog animates in; focusing in the same frame focuses an element
    // that is still scaling, and Chrome scrolls it into view oddly.
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const trimmed = term.trim();
    // Too short to search: return without touching state. `active` below derives
    // the empty view from `term` instead, so there is nothing to clear.
    if (trimmed.length < MIN_QUERY_LENGTH) return;
    const id = ++requestId.current;
    // The spinner starts when the request does, not on the keystroke. Inside the
    // 180ms debounce nothing is in flight, so claiming otherwise would be a lie
    // — and it keeps the setState out of the effect body, where it would cause
    // an extra render per character typed.
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await globalSearch(trimmed);
        if (id !== requestId.current) return;   // a newer keystroke already won
        setHits(res.hits);
        setFailed(res.failed);
        setSearched(true);
        setCursor(0);
      } catch {
        if (id !== requestId.current) return;
        // globalSearch already degrades per-section; reaching here means
        // something outside those sections failed. Show nothing rather than a
        // stale result list that no longer matches what was typed.
        setHits([]);
        setSearched(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  /** Grouped for display, but also flattened in the same order so ↑/↓ walk the
   *  list exactly as it is drawn. Deriving both from one pass is what keeps the
   *  highlight and the keyboard in agreement. */
  const { sections, flat } = useMemo(() => {
    const byKind = new Map<SearchKind, SearchHit[]>();
    for (const hit of hits) {
      const list = byKind.get(hit.kind);
      if (list) list.push(hit);
      else byKind.set(hit.kind, [hit]);
    }
    const ordered = KIND_ORDER
      .filter((k) => byKind.has(k))
      .map((k) => ({ kind: k, items: byKind.get(k)! }));
    return { sections: ordered, flat: ordered.flatMap((s) => s.items) };
  }, [hits]);

  /** True once the term is long enough to have been searched. Clearing the box
   *  makes this false again, so the "nothing typed yet" hint returns without any
   *  state having to be cleared. */
  const active = term.trim().length >= MIN_QUERY_LENGTH;
  const showLoading = active && loading;
  const showEmpty = active && searched && !loading && flat.length === 0;

  const go = (hit: SearchHit) => {
    close();
    navigate(hit.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && flat[cursor]) {
      e.preventDefault();
      go(flat[cursor]);
    }
  };

  // Keep the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const trigger = (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 h-10 pl-3 pr-2 rounded-full transition-colors w-full max-w-md"
      style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
    >
      <Search size={15} style={{ color: TEXT_MUTED }} />
      <span className="text-sm flex-1 text-left" style={{ color: TEXT_MUTED }}>
        Search anything…
      </span>
      <kbd
        className="hidden md:inline-flex items-center h-6 px-1.5 rounded text-xs font-medium"
        style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_MUTED }}
      >
        Ctrl K
      </kbd>
    </button>
  );

  const dialog = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={close}
          />
          {/* Centred by the flex parent, NOT by `left-1/2 -translate-x-1/2`.
              Framer writes `transform` inline on every frame to animate `y` and
              `scale`, which overwrites Tailwind's `-translate-x-1/2` — so the
              panel kept its `left: 50%` with nothing pulling it back, and sat
              half its own width right of centre. Anything Framer animates must
              not also be load-bearing for layout. */}
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="relative mt-[12vh] w-[min(680px,92vw)] rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
          >
            <div
              className="flex items-center gap-3 px-4 h-14"
              style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE }}
            >
              {showLoading
                ? <Loader2 size={17} className="animate-spin" style={{ color: PRIMARY }} />
                : <Search size={17} style={{ color: TEXT_MUTED }} />}
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search anything — a letter is enough"
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[var(--color-text-muted)]"
              />
              <button onClick={close} style={{ color: TEXT_MUTED }} aria-label="Close search">
                <X size={17} />
              </button>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto">
              {active && failed.length > 0 && (
                // Naming what could not be searched, instead of quietly
                // returning fewer results and letting it read as "not found".
                <p className="px-4 py-2 text-xs" style={{ color: 'var(--color-secondary)' }}>
                  Could not search: {failed.map((k) => KIND_LABEL[k]).join(', ')}
                </p>
              )}

              {active && sections.map((section) => {
                const Icon = KIND_ICON[section.kind];
                return (
                  <div key={section.kind}>
                    <p
                      className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: TEXT_MUTED }}
                    >
                      {KIND_LABEL[section.kind]}
                    </p>
                    {section.items.map((hit) => {
                      const index = flat.indexOf(hit);
                      const active = index === cursor;
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          data-index={index}
                          onClick={() => go(hit)}
                          onMouseEnter={() => setCursor(index)}
                          className="w-full text-left px-4 py-2.5 flex items-center gap-3"
                          style={{ background: active ? PRIMARY_LIGHT : 'transparent' }}
                        >
                          {hit.photoUrl !== undefined
                            ? <Avatar name={hit.title} photoUrl={hit.photoUrl} size={30} />
                            : (
                              <span
                                className="w-[30px] h-[30px] rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: SURFACE }}
                              >
                                <Icon size={14} style={{ color: TEXT_SECOND }} />
                              </span>
                            )}
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-white truncate">{hit.title}</span>
                            {hit.subtitle && (
                              <span className="block text-xs truncate" style={{ color: TEXT_SECOND }}>
                                {hit.subtitle}
                              </span>
                            )}
                          </span>
                          {hit.tag && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: SURFACE, color: TEXT_SECOND, border: `1px solid ${BORDER}` }}
                            >
                              {hit.tag}
                            </span>
                          )}
                          {active && <CornerDownLeft size={13} style={{ color: TEXT_MUTED }} />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {showEmpty && (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm" style={{ color: TEXT_SECOND }}>
                    Nothing matches "{term.trim()}"
                  </p>
                  <p className="text-xs mt-1.5" style={{ color: TEXT_MUTED }}>
                    Searched: names, emails, phones, addresses, emergency contacts, QR codes,
                    specialisations, class and event titles, locations, plans, invoice numbers,
                    amounts and resources.
                  </p>
                </div>
              )}

              {!active && (
                <div className="px-4 py-10 text-center">
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>
                    Start typing — one letter is enough. Members, trainers, staff, classes,
                    timetable, events, plans, payments and resources are all searched at once.
                  </p>
                </div>
              )}
            </div>

            <div
              className="px-4 h-9 flex items-center gap-4 text-xs"
              style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_MUTED }}
            >
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {trigger}
      {/* Portalled to `body` so the dialog is never clipped by the header's
          `overflow` or trapped beneath it in the stacking order — the header is
          `sticky` with its own z-index, which would otherwise win.

          The wrapper sits OUTSIDE `AnimatePresence` on purpose. `AnimatePresence`
          only unmounts an exiting child once its exit animation reports
          completion, and that never happens on a page that is not compositing —
          a background tab, a locked phone, this harness. Measured here: after
          Escape the dialog had already animated to `opacity: 0`, and stayed in
          the DOM indefinitely. Invisible, but its full-screen backdrop would
          still swallow every click on the page — the same undismissable-overlay
          bug this project has shipped three times.

          So dismissal does not depend on Framer finishing anything. This div is
          always mounted, re-renders the instant `open` flips, and kills pointer
          events on the whole overlay. A stuck node is then inert rather than a
          trap. It is a plain div with no transform, so it creates no containing
          block and the `fixed` children still resolve against the viewport. */}
      {typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex justify-center items-start"
          style={{ pointerEvents: open ? 'auto' : 'none' }}
        >
          {dialog}
        </div>,
        document.body
      )}
    </>
  );
}
