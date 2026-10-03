import { useCallback, useEffect, useState } from 'react';
import { Flame } from '@phosphor-icons/react';
import { Chip, NocButton, Panel, ProgressBar } from './noc';
import GlassSheet from './GlassSheet';
import { toast } from './Toast';
import { myStreak, setStreakTarget, settleMyStreak, streakLine, type StreakCard } from '../../lib/api/streak';

/**
 * The gym streak on Today (0151): how many weeks running the member has hit
 * their own weekly target, what this week still needs, and their target.
 *
 * It sits under the week marks rather than drawing a second row of dots: the
 * marks are the days, this is what the days add up to. A training day is a
 * check-in or a logged workout (0124), so the count here can be higher than the
 * marks above, which show visits only — the sheet says so.
 *
 * Renders nothing when there is no streak here (Progress switched off at the
 * gym, 0141, or 0151 not live yet).
 */
export default function StreakStrip() {
  const [card, setCard] = useState<StreakCard | null>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(2);
  const [nudges, setNudges] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await myStreak();
    setCard(s);
    if (s) { setTarget(s.target); setNudges(s.nudges); }
  }, []);

  useEffect(() => {
    void (async () => {
      // Pays any milestone newly reached, then reads the card it changed.
      const reached = await settleMyStreak();
      await load();
      if (reached.length) toast.success(`Milestone reached: ${reached[reached.length - 1]} weeks in a row.`);
    })();
  }, [load]);

  if (!card) return null;

  const line = streakLine(card);
  const lineColor = line.tone === 'action' ? 'var(--color-secondary)'
    : line.tone === 'state' ? 'var(--color-primary-300)' : 'var(--color-text-muted)';

  const save = async () => {
    setSaving(true);
    try {
      await setStreakTarget(target, nudges);
      await load();
      setOpen(false);
      toast.success(`Your target is ${target} days a week.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Panel ariaLabel="Your gym streak">
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <p className="flex items-center" style={{ gap: 8 }}>
            <Flame size={18} weight={card.current > 0 ? 'fill' : 'regular'} aria-hidden
              style={{ color: card.current > 0 ? 'var(--color-secondary)' : 'var(--color-text-muted)' }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {card.current > 0 ? `${card.current}-week streak` : 'No streak yet'}
            </span>
          </p>
          <button onClick={() => setOpen(true)} style={{ fontSize: 12, color: 'var(--color-primary-300)' }}>
            {card.target} days a week · Change
          </button>
        </div>
        <ProgressBar style={{ marginTop: 10 }} fraction={Math.min(1, card.daysThisWeek / card.target)} />
        <p className="flex justify-between tabular-nums" style={{ marginTop: 7, gap: 12, fontSize: 12 }}>
          <span style={{ color: lineColor }}>{line.text}</span>
          {/* The streak's week is Monday–Sunday (squads, quests and seasons too); the
              marks above run Sunday–Saturday, so the label says which week this is. */}
          <span className="flex-none" style={{ color: 'var(--color-text-muted)' }}>{card.daysThisWeek} of {card.target} · Mon–Sun</span>
        </p>
        {card.best > 0 && (
          <p style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
            Best {card.best} {card.best === 1 ? 'week' : 'weeks'}
            {card.nextMilestone ? ` · next milestone at ${card.nextMilestone} weeks` : ''}
          </p>
        )}
      </Panel>

      <GlassSheet open={open} onClose={() => setOpen(false)} title="Your weekly target"
        subtitle="Training days you aim for each week"
        footer={<NocButton className="w-full" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</NocButton>}>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          A training day is a day you check in or log a workout. Reach your target every week — Monday to
          Sunday — to keep your streak going. The week in progress never breaks it, and neither does a week your membership is frozen.
        </p>
        <div className="flex flex-wrap" style={{ gap: 8, marginTop: 14 }} role="group" aria-label="Days a week">
          {[2, 3, 4, 5].map((n) => (
            <Chip key={n} label={`${n} days`} on={target === n} onClick={() => setTarget(n)} />
          ))}
        </div>
        <label className="flex items-start" style={{ gap: 10, marginTop: 18, fontSize: 13.5, color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={nudges} onChange={(e) => setNudges(e.target.checked)}
            style={{ marginTop: 3, accentColor: 'var(--color-primary)' }} />
          <span>
            Remind me before it breaks
            <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
              One message in a week, on the day you need every day left to keep it.
            </span>
          </span>
        </label>
      </GlassSheet>
    </>
  );
}
