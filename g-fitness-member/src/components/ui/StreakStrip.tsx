import { useCallback, useEffect, useState } from 'react';
import { CaretRight, Flame, HourglassMedium, Snowflake } from '@phosphor-icons/react';
import { ProgressBar } from './noc';
import { toast } from './Toast';
import StreakOrb from '../streak/StreakOrb';
import StreakSheet from '../streak/StreakSheet';
import {
  MILESTONES, TIER_LABEL, flameTier, myStreak, setStreakTarget, settleMyStreak, streakLine, type StreakCard,
} from '../../lib/api/streak';

/** Weeks already celebrated in this app session — memory only, never storage (CLAUDE.md). */
const celebrated = new Set<string>();

/**
 * The gym streak on Today (0151/0152), as a thing to tap rather than a card to
 * read: the orb fills one segment per training day toward the member's own
 * target, the flame at its centre grows with the run, an hourglass appears when
 * the streak needs every day left, and securing the week ignites it once.
 *
 * Tapping opens the streak's story (StreakSheet): the last twelve weeks, the
 * road to the milestones, and the target. Renders nothing when there is no
 * streak here (Progress switched off, 0141, or 0151 not live).
 */
export default function StreakStrip() {
  const [card, setCard] = useState<StreakCard | null>(null);
  const [open, setOpen] = useState(false);
  const [ignite, setIgnite] = useState(false);

  const load = useCallback(async () => {
    const s = await myStreak();
    setCard(s);
    return s;
  }, []);

  useEffect(() => {
    void (async () => {
      // Pays any milestone newly reached, then reads the card it changed.
      const reached = await settleMyStreak();
      const s = await load();
      const weekKey = s?.history.at(-1)?.week ?? 'this-week';
      const secured = !!s && s.needed === 0 && s.daysThisWeek > 0 && !celebrated.has(weekKey);
      if (reached.length || secured) {
        celebrated.add(weekKey);
        setIgnite(true);
        window.setTimeout(() => setIgnite(false), 1600);
      }
      if (reached.length) toast.success(`Milestone reached: ${reached[reached.length - 1]} weeks in a row.`);
    })();
  }, [load]);

  if (!card) return null;

  const tier = flameTier(card.current);
  const line = streakLine(card);
  const lineColor = line.tone === 'action' ? 'var(--color-secondary)'
    : line.tone === 'state' ? 'var(--color-primary-300)' : 'var(--color-text-muted)';
  const live = !card.frozen && !card.outOfReach && card.needed > 0;
  const next = MILESTONES.find((m) => m > card.current) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= card.current) ?? 0;

  const save = async (target: number, nudges: boolean) => {
    try {
      await setStreakTarget(target, nudges);
      await load();
      setOpen(false);
      toast.success(`Your target is ${target} days a week.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that.');
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Your gym streak: ${card.current} weeks. Open your streak`}
        className={`streak-hero streak-hero--${tier}${card.atRisk ? ' streak-hero--risk' : ''} w-full text-left noc-press-soft`}>
        <StreakOrb weeks={card.current} days={card.daysThisWeek} target={card.target} live={live} ignite={ignite} />

        <span className="flex-1 min-w-0 block">
          <span className="flex items-center flex-wrap" style={{ gap: 8 }}>
            {/* The number is the streak — TikTok's lesson: say it big, with the flame. */}
            <span className="streak-count tabular-nums">
              <Flame size={16} weight={card.current > 0 ? 'fill' : 'regular'} aria-hidden />
              {card.current}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {card.current > 0 ? 'week streak' : 'No streak yet'}
            </span>
            {card.atRisk && (
              <span className="streak-chip streak-chip--risk">
                <HourglassMedium size={12} weight="fill" aria-hidden />
                {card.daysLeft === 1 ? 'Ends tonight' : `${card.daysLeft} days left`}
              </span>
            )}
            {card.frozen && (
              <span className="streak-chip">
                <Snowflake size={12} weight="bold" aria-hidden /> Paused
              </span>
            )}
            {!card.atRisk && !card.frozen && card.current > 0 && (
              <span className={`streak-chip streak-tier--${tier}`}>{TIER_LABEL[tier]}</span>
            )}
          </span>

          <span className="block" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45, color: lineColor }}>{line.text}</span>

          <span className="block" style={{ marginTop: 9 }}>
            {next && <ProgressBar fraction={Math.min(1, (card.current - prev) / (next - prev))} />}
            <span className="flex justify-between tabular-nums" style={{ marginTop: 5, fontSize: 12, color: 'var(--color-text-muted)' }}>
              <span>{card.daysThisWeek} of {card.target} this week</span>
              {next && <span>{next - card.current} to {next}w</span>}
            </span>
          </span>
        </span>

        <CaretRight size={16} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none', alignSelf: 'center' }} />
      </button>

      <StreakSheet open={open} onClose={() => setOpen(false)} card={card} onSave={save} />
    </>
  );
}
