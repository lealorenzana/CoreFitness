import { Flame, HourglassMedium } from '@phosphor-icons/react';
import StreakOrb from './StreakOrb';
import StreakWeeks from './StreakWeeks';
import type { SquadStreak, StreakWeek } from '../../lib/api/streak';

const WORDS: Record<StreakWeek['state'], string> = {
  hit: 'Team target reached', frozen: 'Frozen', miss: 'Team target missed',
  before: 'Before the team began', current: 'This week — still going',
};

/**
 * The squad's streak (0153) — TikTok's friend streak, for a gym: one flame the
 * whole squad keeps alive, weeks in a row at the squad's target. The orb fills
 * with the days everyone trained this week; an hourglass on the gym's last open
 * day says it ends tonight. Computed in SQL, never stored.
 */
export default function SquadStreakPanel({ s }: { s: SquadStreak }) {
  const live = s.needed > 0 && !s.outOfReach;
  const line = s.needed === 0
    ? 'Target reached this week — the team points are yours, and the streak is safe.'
    : s.outOfReach
      ? (s.current > 0 ? 'This week is out of reach now. A new team streak starts Monday.' : `${s.needed} more between you would have started a streak.`)
      : s.atRisk
        ? `${s.needed} more between you today keeps the team streak alive.`
        : `${s.needed} more between you by Sunday${s.current > 0 ? ' keeps the streak going' : ' starts a squad streak'}.`;
  return (
    <div className={`streak-hero streak-hero--${s.current > 0 ? 'flame' : 'out'}${s.atRisk ? ' streak-hero--risk' : ''}`}
      style={{ flexDirection: 'column', alignItems: 'stretch' }} aria-label="Your team's streak">
      <div className="flex items-center" style={{ gap: 14 }}>
        <StreakOrb weeks={s.current} days={s.daysThisWeek} target={s.target} live={live} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
            <span className="streak-count tabular-nums">
              <Flame size={16} weight={s.current > 0 ? 'fill' : 'regular'} aria-hidden />{s.current}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {s.current > 0 ? 'week team streak' : 'No team streak yet'}
            </span>
            {s.atRisk && (
              <span className="streak-chip streak-chip--risk">
                <HourglassMedium size={12} weight="fill" aria-hidden /> Ends tonight
              </span>
            )}
          </div>
          <p className="tabular-nums" style={{ marginTop: 6, fontSize: 22, fontWeight: 800, lineHeight: 1, color: 'var(--color-text-primary)' }}>
            {s.daysThisWeek}<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}> / {s.target} days this week</span>
          </p>
          <p style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45,
            color: s.needed === 0 ? 'var(--color-primary-300)' : live ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
            {line}
          </p>
        </div>
      </div>
      {s.history.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className="eyebrow">The squad's last 12 weeks{s.best > 0 ? ` · best ${s.best}` : ''}</p>
          <StreakWeeks weeks={s.history} words={WORDS} unit="squad" />
        </div>
      )}
    </div>
  );
}
