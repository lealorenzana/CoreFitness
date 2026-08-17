import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, X } from 'lucide-react';

import AchievementBadge from '../components/ui/AchievementBadge';
import LevelProgressCard from '../components/ui/LevelProgressCard';
import SectionHeader from '../components/ui/SectionHeader';
import { panelStyle } from '../components/ui/Card';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  TIER_STYLE, type AchievementDef, type AchievementRole,
} from '../data/achievements';
import {
  catalogFor, categoriesFor, listUnlocks, loadCatalogue, syncAchievements,
} from '../lib/api/achievements';
import { getCurrentMemberId } from '../services/bookingService';

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
  const navigate = useNavigate();
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

  useEffect(() => { load(); }, [load]);

  const earnedCount = catalog.filter((a) => unlocked.has(a.key)).length;
  const pct = catalog.length ? Math.round((earnedCount / catalog.length) * 100) : 0;

  const modalRoot = typeof document !== 'undefined' ? document.getElementById('modal-root') : null;

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => navigate(isTrainer ? '/trainer/profile' : '/member/progress')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Achievements</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {loading ? 'Checking what you have earned…' : `${earnedCount} of ${catalog.length} unlocked`}
          </p>
        </div>
      </motion.div>

      {loading ? (
        <SkeletonList count={4} />
      ) : (
        <>
          {/* Overall completion */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="p-4"
            style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
          >
            <div className="flex items-baseline justify-between mb-2">
              <span className="display text-2xl text-white">{pct}%</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                {earnedCount}/{catalog.length}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-high)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'var(--color-secondary)' }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="flex gap-3 mt-3 flex-wrap">
              {(['bronze', 'silver', 'gold', 'platinum'] as const).map((t) => {
                const total = catalog.filter((a) => a.tier === t).length;
                if (total === 0) return null;
                const got = catalog.filter((a) => a.tier === t && unlocked.has(a.key)).length;
                return (
                  <span key={t} className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: 'var(--color-text-muted)' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: TIER_STYLE[t].ring }} />
                    {got}/{total} {TIER_STYLE[t].label}
                  </span>
                );
              })}
            </div>
          </motion.div>

          {/* Members get the level rules restated here; a trainer has no level.
              `linkToAchievements` is off because we are already on that page. */}
          {!isTrainer && <LevelProgressCard linkToAchievements={false} />}

          {categories.map((cat) => {
            const items = catalog.filter((a) => a.category === cat);
            const got = items.filter((a) => unlocked.has(a.key)).length;
            return (
              <section key={cat}>
                <SectionHeader title={cat} hint={`${got} of ${items.length}`} />
                <div className="grid grid-cols-3 gap-2">
                  {items.map((def, i) => (
                    <AchievementBadge
                      key={def.key}
                      def={def}
                      unlocked={unlocked.has(def.key)}
                      index={i}
                      onClick={() => setDetail(def)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* Detail sheet. Portalled to #modal-root because `<main>` scrolls and is
          `relative` — a fixed overlay rendered inline would scroll with it. */}
      {modalRoot && createPortal(
        <AnimatePresence>
          {detail && (
            <motion.div
              /* #modal-root is `pointer-events-none` — see PhoneChassis. */
              className="absolute inset-0 z-[230] flex items-end pointer-events-auto"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDetail(null)}
            >
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} />
              <motion.div
                className="relative w-full p-5 pb-8"
                style={{
                  background: 'var(--color-surface-raised)',
                  borderTop: '1px solid var(--color-border)',
                  borderTopLeftRadius: 'var(--radius-panel)',
                  borderTopRightRadius: 'var(--radius-panel)',
                }}
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setDetail(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }}
                  aria-label="Close"
                >
                  <X size={15} />
                </button>

                <div className="flex flex-col items-center text-center">
                  <span
                    className="w-20 h-20 rounded-full flex items-center justify-center mb-3"
                    style={{
                      background: unlocked.has(detail.key)
                        ? `${TIER_STYLE[detail.tier].ring}24` : 'var(--color-surface-high)',
                      border: `2px solid ${unlocked.has(detail.key)
                        ? TIER_STYLE[detail.tier].ring : 'var(--color-border)'}`,
                    }}
                  >
                    <detail.icon
                      size={34}
                      style={{
                        color: unlocked.has(detail.key) ? TIER_STYLE[detail.tier].ring : 'var(--color-text-muted)',
                        opacity: unlocked.has(detail.key) ? 1 : 0.45,
                      }}
                    />
                  </span>

                  <span className="text-xs font-bold uppercase tracking-[0.16em] mb-1"
                    style={{ color: TIER_STYLE[detail.tier].ring }}>
                    {TIER_STYLE[detail.tier].label}
                  </span>
                  <h2 className="display text-xl text-white">{detail.title}</h2>

                  {unlocked.has(detail.key) ? (
                    <>
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {detail.description}
                      </p>
                      <p className="text-xs mt-3 font-semibold" style={{ color: 'var(--color-secondary)' }}>
                        Unlocked{' '}
                        {new Date(`${unlocked.get(detail.key)}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </>
                  ) : (
                    <div
                      className="mt-3 px-4 py-3 rounded-xl flex items-start gap-2.5 text-left"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    >
                      <Lock size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-text-muted)' }} />
                      <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {detail.requirement}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        modalRoot
      )}
    </div>
  );
}
