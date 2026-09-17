import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Lock, SealCheck, X } from '@phosphor-icons/react';

import LevelProgressCard from '../components/ui/LevelProgressCard';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  tierStyle, type AchievementDef, type AchievementRole,
} from '../data/achievements';
import {
  catalogFor, categoriesFor, listUnlocks, loadCatalogue, syncAchievements,
} from '../lib/api/achievements';
import { getCurrentMemberId } from '../services/bookingService';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, ProgressBar, SectionHead } from '../components/ui/noc';
import { GLASS, SCRIM } from '../components/ui/glass';

/**
 * The achievement gallery, shared by both roles.
 *
 * Which set to draw comes from the route rather than a prop, because the two
 * bottom navs route to `/member/achievements` and `/trainer/achievements` and
 * one page serving both is one page to keep consistent. The *grading* is not
 * decided here at all — `sync_my_achievements()` reads the caller's own role.
 *
 * The old badges tab (deleted in migration 0020) had neither a table nor
 * earning rules. Everything on this screen is backed by
 * `achievement_unlocks`, and every locked tile states the rule that would
 * unlock it.
 */
export default function Achievements() {
  const location = useLocation();
  const isTrainer = location.pathname.startsWith('/trainer');
  const role: AchievementRole = isTrainer ? 'trainer' : 'member';

  const [unlocked, setUnlocked] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AchievementDef | null>(null);

  /**
   * Held in state, not `useMemo`. The catalogue is a table since 0038, so
   * `catalogFor` reads a cache that is empty until `loadCatalogue()` resolves —
   * a memo keyed on `role` would compute empty once and never recompute, and
   * the gallery would stay blank forever.
   */
  const [catalog, setCatalog] = useState<AchievementDef[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = await getCurrentMemberId();
      if (!uid) return;
      // Re-graded on open, so a badge earned since the app launched shows up
      // here without a restart. `force` on the catalogue so an achievement the
      // admin added while the app was open appears without a relaunch.
      await Promise.all([syncAchievements().catch(() => {}), loadCatalogue(true)]);
      setCatalog(catalogFor(role));
      setCategories(categoriesFor(role));
      const rows = await listUnlocks(uid);
      setUnlocked(new Map(rows.map((r) => [r.achievement_key, r.unlocked_on])));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your achievements'));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const earnedCount = catalog.filter((a) => unlocked.has(a.key)).length;
  const pct = catalog.length ? Math.round((earnedCount / catalog.length) * 100) : 0;

  const modalRoot = typeof document !== 'undefined' ? document.getElementById('modal-root') : null;
  const unlockedOn = (key: string) =>
    new Date(`${unlocked.get(key)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Page>
      {/* Back undoes the last step. It navigated to Progress (or the trainer
          profile) whatever the member had come from. */}
      <PageTitle back fallback={isTrainer ? '/trainer/profile' : '/member/progress'}
        title="Achievements"
        subtitle={loading ? 'Checking what you have earned…' : `${earnedCount} of ${catalog.length} unlocked`} />

      {loading ? (
        <SkeletonList count={4} />
      ) : (
        <>
          <section>
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 'var(--text-hero)', fontWeight: 600, lineHeight: 1, letterSpacing: 'var(--tracking-hero)', color: 'var(--color-text-primary)' }}>
                {pct}%
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{earnedCount} of {catalog.length}</span>
            </div>
            <ProgressBar style={{ marginTop: 12 }} fraction={catalog.length ? earnedCount / catalog.length : null} />
            <div className="flex flex-wrap" style={{ gap: '8px 16px', marginTop: 12 }}>
              {(['bronze', 'silver', 'gold', 'platinum'] as const).map((t) => {
                const total = catalog.filter((a) => a.tier === t).length;
                if (total === 0) return null;
                const got = catalog.filter((a) => a.tier === t && unlocked.has(a.key)).length;
                return (
                  <span key={t} className="inline-flex items-center" style={{ gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <span aria-hidden className="rounded-full" style={{ width: 7, height: 7, background: tierStyle(t).ring }} />
                    {got}/{total} {tierStyle(t).label}
                  </span>
                );
              })}
            </div>
          </section>

          {/* Members get the level rules restated here; a trainer has no level.
              `linkToAchievements` is off because we are already on that page. */}
          {!isTrainer && <LevelProgressCard linkToAchievements={false} />}

          {categories.map((cat) => {
            const items = catalog.filter((a) => a.category === cat);
            const got = items.filter((a) => unlocked.has(a.key)).length;
            return (
              <section key={cat}>
                <SectionHead title={cat} meta={`${got} of ${items.length}`} />
                <div style={{ marginTop: 4 }}>
                  {/* Earned first — within a category the list reads as "what you
                      have, then what is next", the order the member scans for. */}
                  {[...items].sort((a, b) => Number(unlocked.has(b.key)) - Number(unlocked.has(a.key))).map((def, i) => {
                    const have = unlocked.has(def.key);
                    const Icon = def.icon;
                    return (
                      <LineRow
                        key={def.key}
                        gutterWidth={30}
                        gutter={<Icon size={19} style={{ color: have ? tierStyle(def.tier).ring : 'var(--color-text-muted)', opacity: have ? 1 : 0.6 }} />}
                        title={def.title}
                        dim={!have}
                        // A locked row states the rule that would unlock it —
                        // every one, so nothing here is a mystery.
                        meta={have ? `${tierStyle(def.tier).label} · unlocked ${unlockedOn(def.key)}` : def.requirement}
                        action={have ? <SealCheck size={17} weight="fill" style={{ color: 'var(--color-primary-400)' }} /> : undefined}
                        onClick={() => setDetail(def)}
                        last={i === items.length - 1}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* Detail sheet, portalled. The wrapper is always mounted and is the only
          node declaring pointer-events — the overlay used to carry
          `pointer-events-auto` inside AnimatePresence, which leaves an invisible
          tap-eating layer when an exit animation never finishes. */}
      {modalRoot && createPortal(
        <div className="absolute inset-0 z-[230]" style={{ pointerEvents: detail ? 'auto' : 'none' }}>
          <AnimatePresence>
            {detail && (
              <motion.div
                className="absolute inset-0 flex items-end"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setDetail(null)}
              >
                <div className="absolute inset-0" style={SCRIM} />
                <motion.div
                  className="relative w-full flex flex-col items-center text-center"
                  style={{
                    ...GLASS,
                    borderBottom: 'none',
                    borderRadius: '20px 20px 0 0',
                    padding: '12px var(--gutter) calc(28px + env(safe-area-inset-bottom))',
                  }}
                  initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                  onClick={(e) => e.stopPropagation()}
                  role="dialog" aria-modal="true" aria-label={detail.title}
                >
                  <div aria-hidden style={{ width: 42, height: 4, borderRadius: 2, background: 'rgba(233, 233, 237, 0.25)' }} />
                  <button onClick={() => setDetail(null)} aria-label="Close" className="absolute grid place-items-center"
                    style={{ top: 14, right: 16, width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}>
                    <X size={16} />
                  </button>

                  {(() => {
                    const have = unlocked.has(detail.key);
                    const ring = tierStyle(detail.tier).ring;
                    return (
                      <>
                        <span className="grid place-items-center rounded-full" style={{
                          width: 84, height: 84, marginTop: 22,
                          background: have ? `color-mix(in srgb, ${ring} 16%, transparent)` : 'var(--color-surface-high)',
                          boxShadow: `inset 0 0 0 1px ${have ? ring : 'rgba(233, 233, 237, 0.14)'}${have ? `, 0 0 30px -10px ${ring}` : ''}`,
                        }}>
                          <detail.icon size={34} style={{ color: have ? ring : 'var(--color-text-muted)', opacity: have ? 1 : 0.5 }} />
                        </span>
                        <p className="eyebrow" style={{ marginTop: 14, color: ring }}>{tierStyle(detail.tier).label}</p>
                        <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: 'var(--color-text-primary)' }}>{detail.title}</h2>
                        {have ? (
                          <>
                            <p style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{detail.description}</p>
                            <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-primary-300)' }}>Unlocked {unlockedOn(detail.key)}</p>
                          </>
                        ) : (
                          <p className="flex items-start text-left" style={{ gap: 8, marginTop: 12, fontSize: 13.5, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                            <Lock size={15} className="flex-none" style={{ marginTop: 2, color: 'var(--color-text-muted)' }} />
                            {detail.requirement}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        modalRoot,
      )}
    </Page>
  );
}
