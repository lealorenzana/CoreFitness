import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { TIER_STYLE, type AchievementDef } from '../../data/achievements';

/**
 * One badge tile.
 *
 * A locked badge is drawn, not hidden. Hiding the ones you haven't earned turns
 * the gallery into a list of things you already know about yourself; showing
 * them greyed with their requirement underneath is what makes it a set worth
 * completing. The icon is still visible through the grey — a silhouette gives
 * away nothing and reads as a puzzle rather than a wall.
 */
export default function AchievementBadge({
  def,
  unlocked,
  index = 0,
  onClick,
}: {
  def: AchievementDef;
  unlocked: boolean;
  /** Position in its group, for the stagger. */
  index?: number;
  onClick?: () => void;
}) {
  const tier = TIER_STYLE[def.tier];
  const Icon = def.icon;

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), type: 'spring', stiffness: 340, damping: 24 }}
      className="p-3 flex flex-col items-center gap-2 text-center active:scale-95 transition-transform"
      style={{
        background: 'var(--color-surface-raised)',
        border: `1px solid ${unlocked ? `${tier.ring}66` : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-card)',
        // The earned ones carry a faint halo in their tier colour, so a full
        // row of them reads as gold/platinum at a glance without labels.
        boxShadow: unlocked ? `0 0 18px -6px ${tier.glow}` : 'none',
      }}
      aria-label={`${def.title} — ${unlocked ? 'unlocked' : 'locked'}`}
    >
      <span
        className="relative w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: unlocked ? `${tier.ring}24` : 'var(--color-surface-high)',
          border: `1px solid ${unlocked ? `${tier.ring}80` : 'var(--color-border)'}`,
        }}
      >
        <Icon
          size={21}
          style={{ color: unlocked ? tier.ring : 'var(--color-text-muted)', opacity: unlocked ? 1 : 0.45 }}
        />
        {!unlocked && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          >
            <Lock size={9} style={{ color: 'var(--color-text-muted)' }} />
          </span>
        )}
      </span>

      <span
        className="text-xs font-semibold leading-tight"
        style={{ color: unlocked ? '#fff' : 'var(--color-text-muted)' }}
      >
        {def.title}
      </span>
    </motion.button>
  );
}
