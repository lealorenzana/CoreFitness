import { useEffect, useState } from 'react';
import { memberStreak, type StreakCard } from '../../lib/api/streak';

/**
 * A trainee's gym streak (0151), for their coach: the run, their own weekly
 * target, and whether this week is about to break it — the moment a coach's
 * word helps most. Nothing when not visible (member_streak() refuses anyone
 * who does not train them) or before 0151.
 */
export default function TraineeStreak({ memberId, firstName }: { memberId: string; firstName: string }) {
  const [card, setCard] = useState<StreakCard | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const s = await memberStreak(memberId);
      if (alive) setCard(s);
    })();
    return () => { alive = false; };
  }, [memberId]);

  if (!card) return null;
  const week = card.frozen ? 'frozen this week'
    : card.needed === 0 ? 'this week reached'
    : card.atRisk ? `needs ${card.needed} more — every day left`
    : card.outOfReach ? 'this week is out of reach'
    : `${card.daysThisWeek} of ${card.target} days this week`;
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Gym streak</p>
      <p style={{ fontSize: 13.5, marginTop: 4, color: 'var(--color-text-primary)' }}>
        {card.current > 0 ? `${card.current} ${card.current === 1 ? 'week' : 'weeks'} running` : 'No streak right now'}
        {' · '}
        <span style={{ color: card.atRisk ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}>{week}</span>
      </p>
      <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
        {firstName} aims for {card.target} days a week · best {card.best} {card.best === 1 ? 'week' : 'weeks'}
      </p>
    </div>
  );
}
