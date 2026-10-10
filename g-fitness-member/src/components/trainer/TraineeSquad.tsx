import { useEffect, useState } from 'react';
import { memberSquad, type MemberSquad } from '../../lib/api/squads';
import { memberSquadStreak } from '../../lib/api/streak';

/**
 * A trainee's squad this week (0124), for their coach: the squad's name, how
 * close it is to its target, and this member's own days. Never its code or its
 * other members (member_squad() returns neither). Nothing when not in one.
 */
export default function TraineeSquad({ memberId, firstName }: { memberId: string; firstName: string }) {
  const [squad, setSquad] = useState<MemberSquad | null>(null);
  const [streak, setStreak] = useState<{ current: number; atRisk: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, st] = await Promise.all([memberSquad(memberId), memberSquadStreak(memberId)]);
      if (alive) { setSquad(s); setStreak(st); }
    })();
    return () => { alive = false; };
  }, [memberId]);

  if (!squad) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Team</p>
      <p style={{ fontSize: 13.5, marginTop: 4, color: 'var(--color-text-primary)' }}>
        {squad.name} · {squad.days} of {squad.target} days this week
      </p>
      {streak && streak.current > 0 && (
        <p style={{ fontSize: 12, marginTop: 2, color: streak.atRisk ? 'var(--color-secondary)' : 'var(--color-primary-300)' }}>
          {streak.current}-week team streak{streak.atRisk ? ' — ends tonight' : ''}
        </p>
      )}
      <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
        {firstName} has trained {squad.memberDays} day{squad.memberDays === 1 ? '' : 's'} of it · {squad.members} in the team
      </p>
    </div>
  );
}
