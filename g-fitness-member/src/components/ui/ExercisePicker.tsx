import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretDown, Check, MagnifyingGlass, X } from '@phosphor-icons/react';
import type { Exercise } from '../../lib/api/workoutSets';
import { GLASS, SCRIM } from './glass';

/**
 * Choose an exercise — a field that opens a searchable glass sheet.
 *
 * This replaced a native `<select>`. On Windows and many Android WebViews the
 * open list is browser chrome: a white box with a bright blue highlight dropped
 * over a dark app, forty rows long, with no search and nothing styleable from
 * CSS (member's screenshot, 2026-09-17). A sheet can be searched, groups the
 * catalogue by muscle group, shows the equipment each needs, and marks the
 * current choice.
 *
 * Portalled into `#phone-overlay-root`. The always-mounted wrapper owns the only
 * pointer-events declaration — an exiting AnimatePresence child keeps its last
 * props, so putting `pointer-events-auto` on the child leaves an invisible layer
 * eating taps after it closes (CLAUDE.md).
 */
export default function ExercisePicker({
  exercises,
  value,
  onChange,
}: {
  exercises: Exercise[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const chosen = exercises.find((e) => e.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    // Focus after the sheet has started to arrive, so the keyboard does not fight it.
    const t = setTimeout(() => searchRef.current?.focus(), 260);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q
      ? exercises.filter((e) => `${e.name} ${e.muscleGroup} ${e.equipment}`.toLowerCase().includes(q))
      : exercises;
    const byGroup = new Map<string, Exercise[]>();
    for (const e of hits) {
      const key = e.muscleGroup || 'Other';
      byGroup.set(key, [...(byGroup.get(key) ?? []), e]);
    }
    return [...byGroup.entries()];
  }, [exercises, query]);

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (id: string) => { onChange(id); close(); };
  const root = document.getElementById('phone-overlay-root');
  const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="field-input w-full flex items-center text-left noc-press-soft"
        style={{ gap: 10 }}
      >
        <span className="flex-1 min-w-0">
          {chosen ? (
            <>
              <span className="block truncate" style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{chosen.name}</span>
              <span className="block truncate" style={{ fontSize: 12, marginTop: 1, color: 'var(--color-text-muted)' }}>
                {label(chosen.muscleGroup)}{chosen.equipment ? ` · ${chosen.equipment}` : ''}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>Choose an exercise…</span>
          )}
        </span>
        <CaretDown size={16} style={{ color: 'var(--color-text-muted)' }} />
      </button>

      {root && createPortal(
        <div className="absolute inset-0" style={{ pointerEvents: open ? 'auto' : 'none' }} aria-hidden={!open}>
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={close}
                  className="absolute inset-0"
                  style={SCRIM}
                />
                <motion.div
                  role="dialog" aria-modal="true" aria-label="Choose an exercise"
                  initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                  className="absolute inset-x-0 bottom-0 flex flex-col"
                  style={{
                    ...GLASS,
                    borderBottom: 'none',
                    borderRadius: '20px 20px 0 0',
                    maxHeight: '82%',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                  }}
                >
                  <div aria-hidden className="mx-auto" style={{ width: 42, height: 4, borderRadius: 2, marginTop: 10, background: 'rgba(233, 233, 237, 0.25)' }} />

                  <div className="flex items-center justify-between flex-none" style={{ padding: '12px var(--gutter) 10px', gap: 12 }}>
                    <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Choose an exercise</h2>
                    <button type="button" onClick={close} aria-label="Close" className="grid place-items-center noc-press"
                      style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}>
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex-none" style={{ padding: '0 var(--gutter) 10px' }}>
                    <label className="relative block">
                      <MagnifyingGlass size={16} className="absolute" style={{ left: 13, top: 15, color: 'var(--color-text-muted)' }} />
                      <input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name, muscle or equipment"
                        aria-label="Search exercises"
                        className="field-input"
                        style={{ paddingLeft: 38, background: 'rgba(8, 8, 14, 0.45)' }}
                      />
                    </label>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide" style={{ padding: '0 var(--gutter) 18px' }}>
                    {groups.length === 0 ? (
                      <p style={{ fontSize: 13, padding: '18px 0', color: 'var(--color-text-muted)' }}>
                        No exercise matches “{query}”.
                      </p>
                    ) : groups.map(([group, items]) => (
                      <section key={group} style={{ marginTop: 8 }}>
                        <p className="eyebrow" style={{ padding: '8px 0 4px' }}>{label(group)}</p>
                        {items.map((e, i) => {
                          const on = e.id === value;
                          return (
                            <div key={e.id}>
                              <button
                                type="button"
                                onClick={() => pick(e.id)}
                                aria-pressed={on}
                                className="w-full flex items-center text-left noc-row"
                                style={{ gap: 12, minHeight: 50, padding: '8px 0' }}
                              >
                                <span className="flex-1 min-w-0">
                                  <span className="block truncate" style={{
                                    fontSize: 14.5, fontWeight: 600,
                                    color: on ? 'var(--color-primary-300)' : 'var(--color-text-primary)',
                                  }}>
                                    {e.name}
                                  </span>
                                  <span className="block truncate" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
                                    {e.equipment ? label(e.equipment) : 'No equipment'}{e.isTimed ? ' · timed' : ''}
                                  </span>
                                </span>
                                {on && <Check size={17} weight="bold" style={{ color: 'var(--color-primary-300)' }} />}
                              </button>
                              {i < items.length - 1 && <div className="hair" />}
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>,
        root,
      )}
    </>
  );
}
