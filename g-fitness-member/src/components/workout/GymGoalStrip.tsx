import { useEffect, useState } from 'react';
import { UsersThree } from '@phosphor-icons/react';
import { Panel, ProgressBar } from '../ui/noc';
import { currentGymGoal, GOAL_UNIT, settleSquadsAndGoals, type GymGoal } from '../../lib/api/squads';

/**
 * The gym-wide goal (0124), where members see it: one shared bar, and their own
 * part in it. Renders nothing when the gym has no goal running (or before 0124).
 *
 * "You added N" is the member's own contribution, because the reward goes to
 * everyone who added at least one — the sentence that tells them whether they
 * are in.
 */
export default function GymGoalStrip() {
  const [goal, setGoal] = useState<GymGoal | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await settleSquadsAndGoals();
      const g = await currentGymGoal();
      if (alive) setGoal(g);
    })();
    return () => { alive = false; };
  }, []);

  if (!goal) return null;
  const unit = GOAL_UNIT[goal.metric];
  return (
    <Panel>
      <p className="flex items-center" style={{ gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>
        <UsersThree size={15} aria-hidden /> The whole gym
      </p>
      <p style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{goal.title}</p>
      <ProgressBar style={{ marginTop: 10 }} fraction={Math.min(1, goal.progress / Math.max(1, goal.target))} />
      <p className="tabular-nums" style={{ fontSize: 12.5, marginTop: 8, color: 'var(--color-text-secondary)' }}>
        {goal.reached
          ? `Reached! ${goal.contributors} members made it happen${goal.mine > 0 && goal.rewardPoints > 0 ? ` — your ${goal.rewardPoints} points are in` : ''}.`
          : `${goal.progress.toLocaleString()} of ${goal.target.toLocaleString()} ${unit} · ${goal.contributors} members so far`}
      </p>
      {!goal.reached && (
        <p style={{ fontSize: 12, marginTop: 2, color: goal.mine > 0 ? 'var(--color-primary-300)' : 'var(--color-secondary)' }}>
          {goal.mine > 0
            ? `You added ${goal.mine}${goal.rewardPoints > 0 ? ` — you get ${goal.rewardPoints} points when it is reached` : ''}.`
            : `Add one ${unit.replace(/s$/, '')} to be part of it${goal.rewardPoints > 0 ? ` and get ${goal.rewardPoints} points` : ''}.`}
        </p>
      )}
    </Panel>
  );
}
