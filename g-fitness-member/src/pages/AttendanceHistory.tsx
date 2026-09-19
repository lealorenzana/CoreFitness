import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, CaretLeft, CaretRight, Check, Lightning } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { getCurrentUser } from '../utils/auth';
import { listMemberAttendance } from '../lib/api/attendance';
import type { AttendanceRow } from '../types/db';
import { dateKey, localDateKey } from '../utils/dates';
import { Page, PageTitle } from '../components/ui/page';
import WeekMarks from '../components/ui/WeekMarks';
import { Eyebrow, InlineStat, LineRow, SectionHead, SeeAll } from '../components/ui/noc';
import GymTrafficCard from '../components/ui/GymTrafficCard';
import DayWorkoutsSheet from '../components/ui/DayWorkoutsSheet';
import { listWorkoutDays } from '../lib/api/routines';

const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 'YYYY-MM-DD' as local parts — `new Date('YYYY-MM-DD')` reads it as UTC. */
function localDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Longest run of consecutive calendar days, and the run ending today. */
function computeStreaks(dateStrings: string[]): { current: number; longest: number } {
  const days = new Set(dateStrings);
  let longest = 0;
  let run = 0;
  const sorted = [...days].sort();
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const diffDays = Math.round((localDay(sorted[i]).getTime() - localDay(sorted[i - 1]).getTime()) / 86_400_000);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
  }
  let current = 0;
  const cursor = new Date();
  // Today is not over: a member who trained yesterday and has not come in yet
  // still has a run, and reading "0" at 6am says it broke when it has not.
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  // `dateKey`, not `toISOString()`: the set is keyed on local dates, and before
  // 8am Manila the UTC key is yesterday — every streak read as 0.
  while (days.has(dateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

/**
 * Every visit, the week, and the month (Nocturne redesign).
 *
 * **"Attendance Rate" is gone, and on purpose.** It divided the last thirty
 * days' visits by thirty — seven visits read as "23%" — which is a daily target
 * nobody set, dressed as a measurement. The same shape of invented denominator
 * as the hardcoded 20-visits "Consistency Score" removed from Progress. The count
 * of visits in the last thirty days says the true thing without grading it.
 *
 * The month grid now pages back through any month with a check-in, rather than a
 * select that only offered the current year.
 *
 * Reworked 2026-09-19: the month says how it compares with the one before;
 * "Your habits" states the usual time and weekday from real check-ins; "When the
 * gym is busy" reads `gym_traffic()` (0091), the function the admin Dashboard's
 * heatmap now uses too; and Recent visits is a preview of five with "See all"
 * to its own page — a list never grows in place.
 */
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AttendanceHistory() {
  const navigate = useNavigate();
  const now = new Date();
  // Read once — Date.now() inside a memo is impure (react-hooks/purity).
  const [openedAt] = useState(() => Date.now());
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  // Lazy, so a signed-out render starts not-loading instead of flipping state
  // synchronously inside the effect.
  const [loading, setLoading] = useState(() => getCurrentUser() != null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) return;
    listMemberAttendance(user.id)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  /** Days in the shown month with a finished workout (0086), for the barbell mark. */
  const [workoutDays, setWorkoutDays] = useState<Set<string>>(new Set());
  /** The day tapped open in the calendar. */
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) return;
    const from = dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const to = dateKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
    let alive = true;
    listWorkoutDays(user.id, from, to)
      .then((days) => { if (alive) setWorkoutDays(days); })
      .catch(() => { /* the calendar still works without the marks */ });
    return () => { alive = false; };
  }, [cursor]);

  const openDaySheet = (key: string) => setOpenDay(key);

  // `localDateKey`, not `.slice(0, 10)`: the column is UTC, so a 7am visit was
  // filed to the previous day while the grid plotted it on the right one.
  const checkInDates = useMemo(() => records.map((r) => localDateKey(r.check_in_time)), [records]);
  const visited = useMemo(() => new Set(checkInDates), [checkInDates]);

  /** This week, Sunday to Saturday — derived from the same rows, so it cannot disagree. */
  const week = useMemo(() => {
    const t = new Date();
    const sunday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay());
    const days: boolean[] = [];
    const dayNumbers: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
      days.push(visited.has(dateKey(d)));
      dayNumbers.push(d.getDate());
    }
    return { days, dayNumbers, todayIndex: t.getDay() };
  }, [visited]);

  const { current: currentStreak, longest: longestStreak } = useMemo(() => computeStreaks(checkInDates), [checkInDates]);
  const last30 = useMemo(() => {
    const t = new Date();
    const cutoff = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 29).getTime();
    return [...visited].filter((d) => localDay(d).getTime() >= cutoff).length;
  }, [visited]);

  const recent = useMemo(
    () => [...records].sort((a, b) => b.check_in_time.localeCompare(a.check_in_time)).slice(0, 5),
    [records],
  );

  /** The usual time (median of the last 60 days) and the most-visited weekday. */
  const habits = useMemo(() => {
    const since = openedAt - 60 * 86_400_000;
    const lately = records.filter((r) => new Date(r.check_in_time).getTime() >= since);
    if (lately.length < 4) return null;
    const mins = lately.map((r) => { const d = new Date(r.check_in_time); return d.getHours() * 60 + d.getMinutes(); })
      .sort((a, b) => a - b);
    const mid = mins[Math.floor(mins.length / 2)];
    const at = new Date(2000, 0, 1, Math.floor(mid / 60), mid % 60);
    const perDay = new Array(7).fill(0);
    for (const k of new Set(lately.map((r) => localDateKey(r.check_in_time)))) perDay[localDay(k).getDay()] += 1;
    const top = perDay.indexOf(Math.max(...perDay));
    return {
      time: at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      weekday: WEEKDAY[top],
      weekdayCount: perDay[top],
      visits: lately.length,
    };
  }, [records, openedAt]);

  const earliest = checkInDates.length ? localDay([...checkInDates].sort()[0]) : now;
  const canGoBack = cursor.getTime() > new Date(earliest.getFullYear(), earliest.getMonth(), 1).getTime();
  const canGoForward = cursor.getFullYear() < now.getFullYear()
    || (cursor.getFullYear() === now.getFullYear() && cursor.getMonth() < now.getMonth());

  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const firstDay = cursor.getDay();
  // Visit *days*, as the calendar draws them — two check-ins on one day are one orb.
  const daysIn = (y: number, m: number) => [...visited].filter((d) => {
    const x = localDay(d);
    return x.getFullYear() === y && x.getMonth() === m;
  }).length;
  const monthVisits = daysIn(cursor.getFullYear(), cursor.getMonth());
  const prevMonth = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  const prevVisits = daysIn(prevMonth.getFullYear(), prevMonth.getMonth());
  const delta = monthVisits - prevVisits;

  return (
    <Page>
      <PageTitle back fallback="/member/membership" title="Attendance"
        subtitle={loading ? undefined : `${last30} ${last30 === 1 ? 'visit' : 'visits'} in the last 30 days · ${records.length} in all`} />

      {loading ? <SkeletonList count={3} /> : (
        <>
          <section>
            <Eyebrow>This week</Eyebrow>
            <div style={{ marginTop: 10 }}>
              <WeekMarks days={week.days} dayNumbers={week.dayNumbers} todayIndex={week.todayIndex} />
            </div>
          </section>

          <div className="flex flex-wrap" style={{ gap: 24 }}>
            <InlineStat value={records.length} label="check-ins in all" />
            <InlineStat value={currentStreak} label={currentStreak === 1 ? 'day in a row, now' : 'days in a row, now'} />
            <InlineStat value={longestStreak} label="longest run of days" />
          </div>

          {/* ── The month ── */}
          <section>
            <div className="flex items-center justify-between" style={{ gap: 12 }}>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                disabled={!canGoBack} aria-label="Previous month" className="grid place-items-center disabled:opacity-30"
                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}>
                <CaretLeft size={15} />
              </button>
              <div className="text-center">
                <p style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{MONTH_FMT.format(cursor)}</p>
                <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
                  {monthVisits} visit {monthVisits === 1 ? 'day' : 'days'}
                  {(monthVisits > 0 || prevVisits > 0) && (
                    <span style={{ color: delta > 0 ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>
                      {' · '}{delta === 0 ? 'same as' : delta > 0 ? `${delta} more than` : `${-delta} fewer than`}{' '}
                      {prevMonth.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                  )}
                </p>
              </div>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                disabled={!canGoForward} aria-label="Next month" className="grid place-items-center disabled:opacity-30"
                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}>
                <CaretRight size={15} />
              </button>
            </div>

            {/* Keyed on the month, so paging replays the ripple. The cells are the
                week strip's orb language: a visited day is the violet orb with a
                tick, today (not yet visited) the turning ring with a bolt, the
                rest frosted glass. */}
            <div key={`${cursor.getFullYear()}-${cursor.getMonth()}`} className="grid"
              style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 14 }}>
              {DAY_HEADERS.map((d, i) => (
                <div key={i} className="text-center" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{d}</div>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = new Date(cursor.getFullYear(), cursor.getMonth(), i + 1);
                const attended = visited.has(dateKey(day));
                const isToday = dateKey(day) === dateKey(now);
                const future = day.getTime() > now.getTime();
                const cls = [
                  'orb-cell cal-cell relative flex flex-col items-center justify-center',
                  attended ? 'orb-cell--on cal-cell--visited' : isToday ? 'orb-cell--ring orb-spin' : '',
                ].join(' ');
                const trained = workoutDays.has(dateKey(day));
                return (
                  <button key={i} type="button" disabled={future}
                    onClick={() => openDaySheet(dateKey(day))}
                    aria-label={`${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${attended ? ', visited' : isToday ? ', today' : ''}${trained ? ', workout done' : ''}. Show the day`}
                    className={cls}
                    style={{
                      height: 42, borderRadius: 10, gap: 1,
                      // A diagonal ripple: row plus column, so the month fills in
                      // from its top-left corner.
                      animationDelay: `${(Math.floor((i + firstDay) / 7) + ((i + firstDay) % 7)) * 28}ms`,
                      color: attended ? '#fff' : isToday ? 'var(--color-secondary)' : 'var(--color-text-muted)',
                      opacity: future ? 0.32 : 1,
                    }}>
                    {attended ? (
                      <Check aria-hidden size={13} weight="bold"
                        style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.7))' }} />
                    ) : isToday ? (
                      <Lightning aria-hidden size={12} weight="fill"
                        style={{ color: '#fbbf24', filter: 'drop-shadow(0 0 5px rgba(245,158,11,0.7))' }} />
                    ) : null}
                    <span style={{
                      fontSize: attended || isToday ? 11 : 12.5, lineHeight: 1,
                      fontWeight: attended || isToday ? 700 : 500,
                    }}>
                      {i + 1}
                    </span>
                    {/* A finished workout that day: a small barbell in the corner. */}
                    {trained && (
                      <Barbell aria-hidden size={10} weight="fill" className="absolute"
                        style={{ top: 3, right: 4, color: attended ? '#fde68a' : 'var(--color-secondary)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <p style={{ fontSize: 12, marginTop: -8, color: 'var(--color-text-muted)' }}>
            Tap a day to see your check-in and the workout you finished.
          </p>

          {/* ── Your habits ── */}
          {habits && (
            <section>
              <SectionHead title="Your habits" meta="last 60 days" />
              <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>
                <InlineStat value={habits.time} label="your usual check-in time" />
                <InlineStat value={habits.weekday.slice(0, 3)} label={`your most regular day · ${habits.weekdayCount} ${habits.weekdayCount === 1 ? 'visit' : 'visits'}`} />
              </div>
            </section>
          )}

          {/* ── The gym, not just you (0091) ── */}
          <GymTrafficCard />

          {/* ── Visits ── */}
          <section>
            <SectionHead title="Recent visits" />
            {recent.length === 0 ? (
              <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>No check-ins yet.</p>
            ) : (
              <div style={{ marginTop: 4 }}>
                {recent.map((r, i) => {
                  const at = new Date(r.check_in_time);
                  return (
                    <LineRow
                      key={r.id}
                      gutterWidth={56}
                      gutter={at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      // The activity only when it was recorded (0018); older rows
                      // have none and get no placeholder.
                      title={r.activity ?? 'Gym floor'}
                      meta={`${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${r.method === 'qr' ? 'QR code' : 'Recorded by the desk'}`}
                      last={i === recent.length - 1}
                    />
                  );
                })}
              </div>
            )}
            {records.length > recent.length && (
              <SeeAll label="See all visits" count={records.length} onClick={() => navigate('/member/visits')} />
            )}
          </section>
        </>
      )}
      {/* ── A day, opened: its check-ins, then what was done ── */}
      <DayWorkoutsSheet
        memberId={getCurrentUser()?.id ?? null}
        day={openDay}
        onClose={() => setOpenDay(null)}
        subtitle={openDay ? (visited.has(openDay) ? 'You were at the gym' : 'No check-in this day') : undefined}
        before={openDay ? records.filter((r) => localDateKey(r.check_in_time) === openDay).map((r) => (
          <p key={r.id} className="flex items-center" style={{ gap: 8, fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
            <Check size={15} weight="bold" style={{ color: 'var(--color-primary-300)' }} />
            Checked in at {new Date(r.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        )) : null}
      />
    </Page>
  );
}
