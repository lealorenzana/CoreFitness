import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TIER_STYLE, type AchievementDef } from '../../data/achievements';

/**
 * The unlock celebration.
 *
 * Purely decorative, which is the reason framer-motion is allowed to drive all
 * of it: nothing here has to be *correct* if frames never arrive. The one thing
 * that matters — recording that the badge was seen — is done by the caller on a
 * tap, not on an animation callback. An `onAnimationComplete` that never fires
 * because the phone locked mid-celebration would replay the same badge forever.
 *
 * Dismissal is a tap, never a timer. A member who unlocks something while
 * putting their phone in a bag should still get to see what they earned.
 */

const RAYS = 12;

export default function AchievementUnlockOverlay({
  def,
  remaining,
  onDismiss,
}: {
  def: AchievementDef | null;
  /** How many more are queued behind this one. */
  remaining: number;
  onDismiss: () => void;
}) {
  const root = typeof document !== 'undefined' ? document.getElementById('phone-overlay-root') : null;

  const body = (
    <AnimatePresence>
      {def && (
        <motion.div
          key={def.key}
          /* `pointer-events-auto` is load-bearing, not tidiness:
             #phone-overlay-root is `pointer-events-none` so it doesn't swallow
             taps for the whole app while empty. Without this the celebration
             painted correctly and every click fell straight through it — the
             badge could not be dismissed, and because dismissing is what calls
             markSeen, it came back on every launch. */
          className="absolute inset-0 z-[240] flex items-center justify-center p-6 pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }} />

          <div className="relative flex flex-col items-center text-center">
            {/* Rays. They fire outwards once and stay — a loop would turn a
                moment into wallpaper. */}
            <div className="relative w-40 h-40 flex items-center justify-center">
              {Array.from({ length: RAYS }).map((_, i) => (
                <motion.span
                  key={i}
                  className="absolute origin-bottom rounded-full"
                  style={{
                    width: 2,
                    height: 26,
                    background: TIER_STYLE[def.tier].ring,
                    transform: `rotate(${(360 / RAYS) * i}deg) translateY(-46px)`,
                  }}
                  initial={{ opacity: 0, scaleY: 0.2 }}
                  animate={{ opacity: [0, 1, 0], scaleY: [0.2, 1, 0.6] }}
                  transition={{ duration: 0.9, delay: 0.18 + i * 0.02, ease: 'easeOut' }}
                />
              ))}

              {/* Expanding ring */}
              <motion.span
                className="absolute rounded-full"
                style={{ width: 96, height: 96, border: `2px solid ${TIER_STYLE[def.tier].ring}` }}
                initial={{ scale: 0.6, opacity: 0.9 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 1.1, delay: 0.2, ease: 'easeOut' }}
              />

              {/* The badge itself, landing with a spring overshoot. */}
              <motion.span
                className="relative w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  background: `${TIER_STYLE[def.tier].ring}26`,
                  border: `2px solid ${TIER_STYLE[def.tier].ring}`,
                  boxShadow: `0 0 46px -6px ${TIER_STYLE[def.tier].glow}`,
                }}
                initial={{ scale: 0, rotate: -35 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.06 }}
              >
                <def.icon size={42} style={{ color: TIER_STYLE[def.tier].ring }} />
              </motion.span>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34 }}
              className="flex flex-col items-center"
            >
              <span
                className="text-xs font-bold uppercase tracking-[0.18em] mb-2"
                style={{ color: TIER_STYLE[def.tier].ring }}
              >
                {TIER_STYLE[def.tier].label} unlocked
              </span>
              <h2 className="display text-2xl text-white">{def.title}</h2>
              <p className="text-xs mt-2 max-w-[15rem] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {def.description}
              </p>

              <button
                onClick={onDismiss}
                className="mt-6 h-11 px-8 rounded-full font-bold text-sm text-black"
                style={{ background: 'var(--color-secondary)' }}
              >
                {remaining > 0 ? `Next (${remaining})` : 'Nice'}
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return root ? createPortal(body, root) : body;
}
