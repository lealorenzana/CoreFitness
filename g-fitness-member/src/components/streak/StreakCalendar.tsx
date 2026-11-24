import { useEffect, useState } from 'react';
import { ArrowCounterClockwise, CaretLeft, CaretRight, Flame, Pause, Snowflake } from '@phosphor-icons/react';
import { myStreakMonth, type StreakMonth, type StreakWeek } from '../../lib/api/streak';
import { addDays, monthKey, todayKey } from '../../utils/dates';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEK_WORD: Record<StreakWeek['state'], string> = {
  hit: 'Reached', frozen: 'Frozen', restored: 'Restored', paused: 'Paused', miss: 'Missed',
  before: 'Before you joined', current: 'This week', future: '',
};

/**
 * The streak as a calendar (0272): every day you trained this month, and how each week ended.
 * A filled day is a check-in, a ring is a logged workout; both are training days. What each
 * week counted as is SQL's call (my_streak_month), never worked out here. Months load one at
 * a time and are never kept past the sheet.
 */
export default function StreakCalendar() {
  const [month, setMonth] = useState(() => monthKey());
  const [data, setData] = useState<StreakMonth | null | 'failed'>(null);
  const [loadedFor, setLoadedFor] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const m = await myStreakMonth(`${month}-01`);
      if (!alive) return;
      setData(m ?? 'failed');
      setLoadedFor(month);
    })();
    return () => { alive = false; };
  }, [month]);

  const today = todayKey();
  const [y, mo] = month.split('-').map(Number);
  const shift = (n: number) => { const d = new Date(y, mo - 1 + n, 1); setMonth(monthKey(d)); };
  const isThisMonth = month === monthKey();
  // Two years back is plenty to look at; older weeks still count in the streak itself.
  const canBack = month > monthKey(new Date(new Date().getFullYear() - 2, new Date().getMonth(), 1));
  const title = new Date(y, mo - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const ready = data && data !== 'failed' && loadedFor === month ? data : null;
  const byDay = new Map(ready?.days.map((d) => [d.d, d]) ?? []);

  return (
    <div className="streak-cal" data-streak-calendar>
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} disabled={!canBack} aria-label="Previous month"
          className="streak-cal__nav disabled:opacity-30"><CaretLeft size={16} /></button>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</p>
        <button onClick={() => shift(1)} disabled={isThisMonth} aria-label="Next month"
          className="streak-cal__nav disabled:opacity-30"><CaretRight size={16} /></button>
      </div>

      <div className="streak-cal__grid" role="grid" aria-label={`Training days, ${title}`} style={{ marginTop: 10 }}>
        {DOW.map((d, i) => <span key={i} className="streak-cal__dow" aria-hidden>{d}</span>)}
        <span className="streak-cal__dow" aria-hidden />
        {data === 'failed' && loadedFor === month ? (
          <p className="streak-cal__note">Could not load this month.</p>
        ) : !ready ? (
          <p className="streak-cal__note">Loading…</p>
        ) : ready.weeks.map((w) => (
          <div key={w.week} role="row" className="contents">
            {Array.from({ length: 7 }, (_, i) => {
              const key = addDays(w.week, i);
              const day = byDay.get(key);
              const inMonth = key.slice(0, 7) === month;
              const cls = !inMonth ? 'is-out'
                : day?.checkin ? 'is-checkin'
                : day?.logged ? 'is-logged'
                : key > today ? 'is-future' : '';
              return (
                <span key={key} role="gridcell" className={`streak-cal__day ${cls}${key === today ? ' is-today' : ''}`}
                  aria-label={`${key}${day?.checkin ? ', checked in' : day?.logged ? ', workout logged' : ''}`}>
                  {inMonth ? Number(key.slice(8)) : ''}
                </span>
              );
            })}
            <span role="gridcell" className={`streak-cal__week streak-cal__week--${w.state}`}
              aria-label={WEEK_WORD[w.state] || undefined} title={WEEK_WORD[w.state] || undefined}>
              {w.state === 'hit' ? <Flame size={14} weight="fill" />
                : w.state === 'restored' ? <ArrowCounterClockwise size={13} weight="bold" />
                : w.state === 'frozen' ? <Snowflake size={13} weight="bold" />
                : w.state === 'paused' ? <Pause size={12} weight="fill" />
                : w.state === 'current' ? <span className="streak-week__dot" />
                : w.state === 'miss' ? <span className="streak-cal__miss" /> : null}
            </span>
          </div>
        ))}
      </div>

      <p className="flex flex-wrap items-center streak-cal__legend">
        <span><i className="streak-cal__key is-checkin" /> Check-in</span>
        <span><i className="streak-cal__key is-logged" /> Workout</span>
        <span><Flame size={12} weight="fill" style={{ color: 'var(--color-primary-300)' }} /> Week reached</span>
      </p>
    </div>
  );
}
