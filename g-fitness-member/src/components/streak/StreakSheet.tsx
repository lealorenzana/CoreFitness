import { useState } from 'react';
import { Check, Flame, Snowflake } from '@phosphor-icons/react';
import GlassSheet from '../ui/GlassSheet';
import { Chip, NocButton } from '../ui/noc';
import StreakOrb from './StreakOrb';
import { MILESTONES, TIER_LABEL, flameTier, type StreakCard, type StreakWeek } from '../../lib/api/streak';

const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

const STATE_WORDS: Record<StreakWeek['state'], string> = {
  hit: 'Target reached', frozen: 'Frozen — it did not break the streak', miss: 'Target missed',
  before: 'Before you joined', current: 'This week — still going',
};

/**
 * The streak, opened (0151/0152): the flame large, the last twelve weeks as
 * tokens to tap, the road to the next milestone, and the member's own target.
 */
export default function StreakSheet({
  open, onClose, card, onSave,
}: {
  open: boolean;
  onClose: () => void;
  card: StreakCard;
  onSave: (target: number, nudges: boolean) => Promise<void>;
}) {
  const [target, setTarget] = useState(card.target);
  const [nudges, setNudges] = useState(card.nudges);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  // A sheet reopened for a changed card starts from the card, not stale edits.
  const [shownFor, setShownFor] = useState(card);
  if (shownFor !== card) { setShownFor(card); setTarget(card.target); setNudges(card.nudges); }

  const tier = flameTier(card.current);
  const best = Math.max(card.best, card.current);
  const next = MILESTONES.find((m) => m > best) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= best) ?? 0;
  const pickedWeek = picked !== null ? card.history[picked] : null;

  const save = async () => {
    setSaving(true);
    try { await onSave(target, nudges); } finally { setSaving(false); }
  };

  return (
    <GlassSheet open={open} onClose={onClose} title="Your gym streak" subtitle="Weeks in a row at your target"
      footer={<NocButton className="w-full" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</NocButton>}>
      {/* The flame, large. */}
      <div className="flex flex-col items-center text-center" style={{ paddingTop: 4 }}>
        <StreakOrb weeks={card.current} days={card.daysThisWeek} target={card.target}
          live={!card.frozen && !card.outOfReach && card.needed > 0} size={132} />
        <p className="tabular-nums" style={{ marginTop: 10, fontSize: 40, fontWeight: 700, lineHeight: 1, color: 'var(--color-text-primary)' }}>
          {card.current}
        </p>
        <p style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {card.current === 1 ? 'week in a row' : 'weeks in a row'} · <span className={`streak-tier streak-tier--${tier}`}>{TIER_LABEL[tier]}</span>
        </p>
        <p style={{ marginTop: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>
          Best {best} {best === 1 ? 'week' : 'weeks'} · {card.daysThisWeek} of {card.target} days this week (Mon–Sun)
        </p>
      </div>

      {/* The last twelve weeks, tap one to read it. */}
      {card.history.length > 0 && (
        <section style={{ marginTop: 22 }} aria-label="Your last twelve weeks">
          <p className="eyebrow">Last 12 weeks</p>
          <div className="streak-weeks" role="list">
            {card.history.map((w, i) => (
              <button key={w.week} role="listitem" onClick={() => setPicked(picked === i ? null : i)}
                className={`streak-week streak-week--${w.state}${picked === i ? ' is-picked' : ''}`}
                aria-label={`Week of ${weekLabel(w.week)}: ${STATE_WORDS[w.state]}, ${w.days} training ${w.days === 1 ? 'day' : 'days'}`}
                style={{ ['--i' as string]: i }}>
                {w.state === 'hit' ? <Flame size={15} weight="fill" />
                  : w.state === 'frozen' ? <Snowflake size={14} weight="bold" />
                  : w.state === 'current' ? <span className="streak-week__dot" />
                  : null}
              </button>
            ))}
          </div>
          <p style={{ minHeight: 18, marginTop: 8, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            {pickedWeek
              ? `Week of ${weekLabel(pickedWeek.week)} · ${pickedWeek.days} training ${pickedWeek.days === 1 ? 'day' : 'days'} · ${STATE_WORDS[pickedWeek.state]}`
              : 'Tap a week to see it.'}
          </p>
        </section>
      )}

      {/* The road to the milestones. */}
      <section style={{ marginTop: 18 }} aria-label="Milestones">
        <p className="eyebrow">Milestones</p>
        <div className="streak-road">
          <span className="streak-road__line" />
          <span className="streak-road__fill" style={{ width: `${(Math.min(best, 52) / 52) * 100}%` }} />
          {MILESTONES.map((m) => {
            const done = best >= m;
            const isNext = m === next;
            return (
              <span key={m} className={`streak-road__stop${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`}
                style={{ left: `${(m / 52) * 100}%` }}>
                <span className="streak-road__dot">{done ? <Check size={11} weight="bold" /> : null}</span>
                <span className="streak-road__label">{m}w</span>
              </span>
            );
          })}
        </div>
        <p style={{ marginTop: 26, fontSize: 12.5, color: next ? 'var(--color-secondary)' : 'var(--color-primary-300)' }}>
          {next
            ? `${next - best} more ${next - best === 1 ? 'week' : 'weeks'} to ${next} weeks${prev ? ` — ${prev} already reached` : ''}.`
            : 'Every milestone reached. A whole year of showing up.'}
        </p>
      </section>

      {/* The member's own target. */}
      <section style={{ marginTop: 22 }} aria-label="Your weekly target">
        <p className="eyebrow">Your weekly target</p>
        <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          A training day is a day you check in or log a workout. Reach your target every week — Monday to
          Sunday — to keep your streak going. The week in progress never breaks it, and neither does a
          week your membership is frozen.
        </p>
        <div className="flex flex-wrap" style={{ gap: 8, marginTop: 12 }} role="group" aria-label="Days a week">
          {[2, 3, 4, 5].map((n) => (
            <Chip key={n} label={`${n} days`} on={target === n} onClick={() => setTarget(n)} />
          ))}
        </div>
        <label className="flex items-start" style={{ gap: 10, marginTop: 16, fontSize: 13.5, color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={nudges} onChange={(e) => setNudges(e.target.checked)}
            style={{ marginTop: 3, accentColor: 'var(--color-primary)' }} />
          <span>
            Remind me before it breaks
            <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
              One message in a week, on the day you need every day left to keep it.
            </span>
          </span>
        </label>
      </section>
    </GlassSheet>
  );
}
