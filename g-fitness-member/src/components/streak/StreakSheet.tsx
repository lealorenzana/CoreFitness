import { useState } from 'react';
import { ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import GlassSheet from '../ui/GlassSheet';
import { Chip, NocButton, Panel } from '../ui/noc';
import './streak-story.css';
import StreakWeeks from './StreakWeeks';
import StreakCalendar from './StreakCalendar';
import { MILESTONES, TIER_LABEL, closedDaysLabel, flameTier, streakLine, type StreakCard, type StreakWeek } from '../../lib/api/streak';

const STATE_WORDS: Record<StreakWeek['state'], string> = {
  hit: 'Target reached', frozen: 'Frozen, it did not break the streak', miss: 'Target missed',
  restored: 'Restored', paused: 'Paused, it did not break the streak',
  before: 'Before you joined', current: 'This week, still going', future: '',
};
const REASON: Record<string, string> = { sick: 'sick', injury: 'injury', gym_closed: 'gym closed', other: 'other' };
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/**
 * The streak, opened (0151/0152): the flame large, the last twelve weeks as
 * tokens to tap, the road to the next milestone, and the member's own target.
 */
export default function StreakSheet({
  open, onClose, card, onSave, onRestore,
}: {
  open: boolean;
  onClose: () => void;
  card: StreakCard;
  onSave: (target: number, nudges: boolean) => Promise<void>;
  onRestore: () => Promise<void>;
}) {
  const [target, setTarget] = useState(card.target);
  const [nudges, setNudges] = useState(card.nudges);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [reaction, setReaction] = useState(0);
  // A sheet reopened for a changed card starts from the card, not stale edits.
  const [shownFor, setShownFor] = useState(card);
  if (shownFor !== card) { setShownFor(card); setTarget(card.target); setNudges(card.nudges); }

  const tier = flameTier(card.current);
  const best = Math.max(card.best, card.current);
  const next = MILESTONES.find((m) => m > best) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= best) ?? 0;
  // The member's own plan (0030), offered — never applied — as a target (2–5).
  const planTarget = card.planDays >= 2 ? Math.min(5, card.planDays) : null;

  const save = async () => {
    setSaving(true);
    try { await onSave(target, nudges); } finally { setSaving(false); }
  };

  const restore = async () => {
    setRestoring(true);
    try { await onRestore(); } finally { setRestoring(false); }
  };
  const line = streakLine(card);
  const offer = card.restore;

  return (
    <GlassSheet open={open} onClose={onClose} title="Your gym streak" subtitle="Weeks in a row at your target"
      footer={<NocButton className="w-full" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save target'}</NocButton>}>
      <div className="streak-story">
      {/* The flame, large. */}
      <div className="streak-story-hero flex flex-col items-center text-center" style={{ paddingTop: 4 }}>
        <button type="button" className="streak-story-art" data-state={card.frozen ? 'frozen' : card.current > 0 || card.daysThisWeek >= card.target ? 'lit' : 'resting'}
          aria-label="Play the streak mascot animation" onClick={event => {
            setReaction(value => value + 1);
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) event.currentTarget.animate([
              { transform: 'scale(1)' }, { transform: 'scale(1.12,.88)', offset: .18 },
              { transform: 'translateY(-14px) scale(.94,1.08)', offset: .48 },
              { transform: 'translateY(0) scale(1.04,.96)', offset: .8 }, { transform: 'scale(1)' },
            ], { duration: 650, easing: 'ease-in-out' });
          }}>
          <span className="streak-story-aura" /><span className="streak-story-shadow" />
          <picture key={reaction}><source media="(prefers-reduced-motion: reduce)" srcSet="/images/streak-flame-companion.png" /><img src="/images/streak-flame-idle.gif" alt="" /></picture>
          <i className="streak-story-spark is-one" /><i className="streak-story-spark is-two" /><i className="streak-story-spark is-three" />
        </button>
        <p className="tabular-nums" style={{ marginTop: 10, fontSize: 40, fontWeight: 700, lineHeight: 1, color: 'var(--color-text-primary)' }}>
          {card.current}
        </p>
        <p style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {card.current === 1 ? 'week in a row' : 'weeks in a row'} · <span className={`streak-tier streak-tier--${tier}`}>{TIER_LABEL[tier]}</span>
        </p>
        <p style={{ marginTop: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>
          Best {best} {best === 1 ? 'week' : 'weeks'} · {card.daysThisWeek} of {card.target} days this week
        </p>
        {!offer && (
          <p style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600,
            color: line.tone === 'action' ? 'var(--color-secondary)' : line.tone === 'state' ? 'var(--color-primary-300)' : 'var(--color-text-secondary)' }}>
            {line.text}
          </p>
        )}
      </div>
      <div className="streak-story-week">
        <div><strong>This week</strong><span>{card.daysThisWeek} / {card.target} training days</span></div>
        <div className="streak-story-days" aria-label={`${card.daysThisWeek} of ${card.target} training days completed`}>
          {Array.from({ length: card.target }, (_, i) => <span key={i} data-done={i < card.daysThisWeek} aria-hidden="true">{i < card.daysThisWeek ? <Check size={15} weight="bold" /> : i + 1}</span>)}
        </div>
        <p>{card.frozen ? 'Your streak is protected while membership is frozen.' : card.needed === 0 ? 'Weekly target reached. Keep your rhythm.' : `${card.needed} more training ${card.needed === 1 ? 'day' : 'days'} to reach this week’s target.`}</p>
      </div>

      {/* A missed week, today only (0272). */}
      {offer && (
        <Panel glow="action" style={{ marginTop: 16 }} ariaLabel="Restore your streak">
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Your {offer.lost}-week streak broke
          </p>
          <p style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {offer.left > 0
              ? `Restore it today or it resets tonight. ${offer.left} of ${offer.allowance} left this month.`
              : `No restores left this month. It resets tonight.`}
          </p>
          {offer.left > 0 && (
            <NocButton className="w-full" icon={<ArrowCounterClockwise size={16} weight="bold" />}
              onClick={() => void restore()} disabled={restoring} style={{ marginTop: 12 }}>
              {restoring ? 'Restoring…' : `Restore ${offer.restoredTo} ${offer.restoredTo === 1 ? 'week' : 'weeks'}`}
            </NocButton>
          )}
        </Panel>
      )}

      {/* The calendar: every training day, and how each week ended. */}
      <section style={{ marginTop: 22 }} aria-label="Your training calendar">
        <p className="eyebrow">Your training</p>
        <StreakCalendar key={`${card.current}:${card.daysThisWeek}:${card.restores.length}`} />
      </section>

      {/* The last twelve weeks, tap one to read it. */}
      {card.history.length > 0 && (
        <section style={{ marginTop: 22 }} aria-label="Your last twelve weeks">
          <p className="eyebrow">Last 12 weeks</p>
          <StreakWeeks weeks={card.history} words={STATE_WORDS} />
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
        <ul className="streak-rules">
          <li>Check in or log a workout on {card.target} days, Monday to Sunday.</li>
          <li>Rest days never break it. Frozen weeks pause it.</li>
          <li>Missed a week? Restore it the next day.</li>
        </ul>
        {planTarget && planTarget !== target && (
          <button onClick={() => setTarget(planTarget)} className="streak-plan-hint">
            Your training plan has {card.planDays} days a week — <b>use {planTarget}</b>
          </button>
        )}
        {card.closedDays.length > 0 && (
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
            The gym is closed on {closedDaysLabel(card.closedDays)}, so those days never count as days left.
          </p>
        )}
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
      {card.restores.length > 0 && (
        <section style={{ marginTop: 22 }} aria-label="Restores">
          <p className="eyebrow">Restores</p>
          {card.restores.map((r) => (
            <p key={r.week} style={{ marginTop: 6, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              Week of {shortDate(r.week)} · {r.kind === 'member' ? 'by you' : `by the desk${r.reason ? ` (${REASON[r.reason]})` : ''}`}
            </p>
          ))}
        </section>
      )}
      </div>
    </GlassSheet>
  );
}
