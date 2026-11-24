import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { getCurrentUser } from '../utils/auth';
import { listMemberAttendance } from '../lib/api/attendance';
import type { AttendanceRow } from '../types/db';
import { dateKey, localDateKey } from '../utils/dates';
import { Page, PageTitle } from '../components/ui/page';
import { PageHero } from '../components/ui/PageHero';
import WeekMarks from '../components/ui/WeekMarks';
import ArtCalendar from '../components/ui/ArtCalendar';
import { Eyebrow, InlineStat, LineRow, SectionHead, SeeAll } from '../components/ui/noc';
import GymTrafficCard from '../components/ui/GymTrafficCard';
import DayWorkoutsSheet from '../components/ui/DayWorkoutsSheet';
import { listWorkoutDays } from '../lib/api/routines';
import { useGymApp } from '../hooks/useGymApp';
import { moduleOn } from '../lib/gymApp';


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
  const streaksOn = moduleOn(useGymApp(), 'streaks');
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


  return (
    <Page className="has-page-hero cf-panels">
      <PageTitle back fallback="/member/membership" title="Attendance" />
      <PageHero label="Attendance" kicker="Your visits" lead="Show up," accent="it counts."
        text={loading ? 'Every check-in, day by day.' : `${last30} ${last30 === 1 ? 'visit' : 'visits'} in the last 30 days · ${records.length} in all.`}
        art="/images/attendance-hero.png" />

      {loading ? <SkeletonList count={3} /> : (
        <>
          <section>
            <Eyebrow>This week</Eyebrow>
            <div style={{ marginTop: 10 }}>
              <WeekMarks days={week.days} dayNumbers={week.dayNumbers} todayIndex={week.todayIndex} />
            </div>
            <div className="att-stats">
              <InlineStat value={records.length} label="check-ins in all" />
              {streaksOn && <InlineStat value={currentStreak} label={currentStreak === 1 ? 'day in a row, now' : 'days in a row, now'} />}
              {streaksOn && <InlineStat value={longestStreak} label="longest run of days" />}
            </div>
          </section>

          <ArtCalendar appearance="gym" month={cursor} onMonthChange={setCursor} label="Attendance calendar"
            canPrevious={canGoBack} canNext={canGoForward} selected={openDay ?? undefined}
            onSelect={(day) => openDaySheet(dateKey(day))}
            dayState={(day) => ({
              marked: visited.has(dateKey(day)), disabled: day.getTime() > now.getTime(),
              description: [visited.has(dateKey(day)) ? 'Visited' : 'No check-in', workoutDays.has(dateKey(day)) ? 'Workout completed' : ''].filter(Boolean).join(', '),
            })} />
          <p className="calendar-explainer">A dot marks a visit. Tap a date to see your check-in and workout.</p>

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
