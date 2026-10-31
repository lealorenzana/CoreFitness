import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabaseClient';

/**
 * The tours (guides G4, 2026-10-31): the first time a person opens a main
 * screen, a spotlight walks them through its parts — one line each, Next or
 * Skip. Seen is kept on the account (`tours_seen`, 0221 — never the phone), so
 * a new phone does not show it again; Help replays any tour (`replayTour`).
 *
 * A screen calls `useTour(app, tour)` with its steps from `lib/tours.ts`. A step
 * whose part is not on the screen (switched off, nothing to show) is skipped.
 * Before 0221 the read fails and no tour shows — better none than one every visit.
 * The same file lives in both apps; keep them identical.
 */

export type TourApp = 'member' | 'coach' | 'admin';
export interface TourStep { target: string; title: string; text: string }
export interface TourDef { id: string; app: TourApp; name: string; path: string; steps: TourStep[] }

const seen = new Map<TourApp, Set<string> | null>();
const loading = new Map<TourApp, Promise<Set<string> | null>>();
let replay: string | null = null;
let active: { def: TourDef; translate: (s: string) => string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Forget what was read — called with the other per-person caches on sign-out and gym switch. */
export function clearTourCache(): void { seen.clear(); loading.clear(); replay = null; active = null; emit(); }

async function seenFor(app: TourApp): Promise<Set<string> | null> {
  if (seen.has(app)) return seen.get(app) ?? null;
  if (!loading.has(app)) {
    loading.set(app, (async () => {
      const { data, error } = await supabase.rpc('my_tours_seen', { p_app: app });
      const s = error || !Array.isArray(data) ? null : new Set<string>(data as string[]);
      seen.set(app, s);
      return s;
    })());
  }
  return loading.get(app) as Promise<Set<string> | null>;
}

/** Help's Replay: the next time this tour's screen opens, it runs again. */
export function replayTour(id: string): void { replay = id; }

function end(def: TourDef) {
  active = null;
  emit();
  seen.get(def.app)?.add(def.id);
  // A query only runs when its result is asked for — so ask, and let a failure pass quietly.
  void supabase.rpc('mark_tour_seen', { p_app: def.app, p_tour: def.id }).then(() => undefined, () => undefined);
}

/** Shows `def`'s tour on this screen when it has not been seen, or when Help asked to replay it. */
export function useTour(def: TourDef | undefined, translate: (s: string) => string = (s) => s, ready = true): void {
  useEffect(() => {
    if (!def || !ready) return;
    // The fixture checks' runner sets this so a tour never covers the screen under test (run-ui-checks.mjs).
    if ((window as { __CF_NO_TOURS?: boolean }).__CF_NO_TOURS) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const wanted = replay === def.id;
        const s = wanted ? null : await seenFor(def.app);
        if (!alive) return;
        if (!wanted && (s === null || s.has(def.id))) return;
        if (wanted) replay = null;
        // The screen may still be loading: wait (up to five seconds) for one of its parts to appear.
        for (let k = 0; k < 17 && alive && !def.steps.some((x) => document.querySelector(x.target)); k++) {
          await new Promise((r) => window.setTimeout(r, 300));
        }
        if (!alive) return;
        active = { def, translate };
        emit();
      })();
    }, 900);
    return () => { alive = false; window.clearTimeout(timer); if (active?.def.id === def.id) { active = null; emit(); } };
    // translate is stable per render of the screen's language; the tour id decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.id, ready]);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => active;

/** Mount once near the root of the app. */
export function TourHost() {
  const cur = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!cur) return null;
  return createPortal(<Spotlight key={cur.def.id} def={cur.def} t={cur.translate} />, document.body);
}

/** Nothing of the tour is on this screen (all switched off): count it seen and draw nothing. */
function EndNow({ def }: { def: TourDef }) {
  useEffect(() => { end(def); }, [def]);
  return null;
}

function Spotlight({ def, t }: { def: TourDef; t: (s: string) => string }) {
  const steps = def.steps.filter((s) => document.querySelector(s.target));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    const place = () => setRect(el.getBoundingClientRect());
    place();
    const timer = window.setTimeout(place, still ? 0 : 350);
    window.addEventListener('resize', place);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', place); };
  }, [step, still]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') end(def); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [def]);

  if (!step) return <EndNow def={def} />;
  const pad = 8;
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const vh = window.innerHeight, vw = window.innerWidth;
  const below = !hole || hole.top + hole.height + 190 < vh;
  const bubbleTop = hole ? (below ? hole.top + hole.height + 12 : Math.max(12, hole.top - 12 - 170)) : vh / 2 - 85;
  const last = i === steps.length - 1;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${t(def.name)} — ${i + 1} of ${steps.length}`} data-tour={def.id}
      style={{ position: 'fixed', inset: 0, zIndex: 990 }}>
      {/* The dark around the part being shown; a tap on it does nothing, so a tour is never closed by accident. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0 }} />
      {hole && (
        <div aria-hidden data-tour-hole
          style={{ position: 'absolute', ...hole, borderRadius: 14, boxShadow: '0 0 0 9999px rgba(5,5,10,0.72)',
            outline: '2px solid var(--color-primary, #7C3AED)', transition: still ? 'none' : 'all 0.25s ease', pointerEvents: 'none' }} />
      )}
      <div data-tour-bubble
        style={{ position: 'absolute', left: Math.max(12, Math.min(vw - 12 - Math.min(340, vw - 24), (hole?.left ?? 12))), top: bubbleTop,
          width: Math.min(340, vw - 24), borderRadius: 16, padding: 16, background: 'var(--color-surface, #14141F)',
          border: '1px solid var(--color-border, rgba(255,255,255,0.12))', color: 'var(--color-text-primary, #fff)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', transition: still ? 'none' : 'top 0.25s ease, left 0.25s ease' }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted, #8b8ba0)' }}>{i + 1} / {steps.length}</p>
        <p style={{ fontSize: 15.5, fontWeight: 700, marginTop: 2 }}>{t(step.title)}</p>
        <p style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-secondary, #a1a1b5)' }}>{t(step.text)}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <button type="button" onClick={() => end(def)} data-tour-skip style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-muted, #8b8ba0)' }}>
            {t('Skip')}
          </button>
          <button type="button" data-tour-next
            onClick={() => (last ? end(def) : setI(i + 1))}
            style={{ height: 38, padding: '0 18px', borderRadius: 12, fontWeight: 700, fontSize: 14, background: 'var(--color-secondary, #F59E0B)', color: '#1a1206' }}>
            {last ? t('Done') : t('Next')}
          </button>
        </div>
      </div>
    </div>
  );
}
