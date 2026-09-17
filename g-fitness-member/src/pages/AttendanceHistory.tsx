import { useEffect, useMemo, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { getCurrentUser } from '../utils/auth';
import { listMemberAttendance } from '../lib/api/attendance';
import type { AttendanceRow } from '../types/db';
import { dateKey, localDateKey } from '../utils/dates';
import { Page, PageTitle } from '../components/ui/page';
import WeekMarks from '../components/ui/WeekMarks';
import { Eyebrow, InlineStat, LineRow, SectionHead } from '../components/ui/noc';

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
 */
export default function AttendanceHistory() {
  const now = new Date();
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
    () => [...records].sort((a, b) => b.check_in_time.localeCompare(a.check_in_time)).slice(0, 10),
    [records],
  );

  const earliest = checkInDates.length ? localDay([...checkInDates].sort()[0]) : now;
  const canGoBack = cursor.getTime() > new Date(earliest.getFullYear(), earliest.getMonth(), 1).getTime();
  const canGoForward = cursor.getFullYear() < now.getFullYear()
    || (cursor.getFullYear() === now.getFullYear() && cursor.getMonth() < now.getMonth());

  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const firstDay = cursor.getDay();
  const monthVisits = checkInDates.filter((d) => {
    const x = localDay(d);
    return x.getFullYear() === cursor.getFullYear() && x.getMonth() === cursor.getMonth();
  }).length;

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
                <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>{monthVisits} {monthVisits === 1 ? 'visit' : 'visits'}</p>
              </div>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                disabled={!canGoForward} aria-label="Next month" className="grid place-items-center disabled:opacity-30"
                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}>
                <CaretRight size={15} />
              </button>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 14 }}>
              {DAY_HEADERS.map((d, i) => (
                <div key={i} className="text-center" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{d}</div>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = new Date(cursor.getFullYear(), cursor.getMonth(), i + 1);
                const attended = visited.has(dateKey(day));
                const isToday = dateKey(day) === dateKey(now);
                const future = day.getTime() > now.getTime();
                return (
                  <div key={i}
                    aria-label={`${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${attended ? ', visited' : ''}`}
                    className="grid place-items-center"
                    style={{
                      height: 34, borderRadius: 6, fontSize: 12,
                      background: attended ? 'var(--color-primary)' : 'var(--color-surface-high)',
                      border: `1px solid ${isToday ? 'var(--color-secondary)' : 'transparent'}`,
                      boxShadow: attended ? '0 0 10px -4px var(--color-primary)' : 'none',
                      color: attended ? '#fff' : isToday ? 'var(--color-secondary)' : 'var(--color-text-muted)',
                      opacity: future ? 0.35 : 1,
                    }}>
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Visits ── */}
          <section>
            <SectionHead title="Recent visits" meta={records.length > recent.length ? `latest ${recent.length}` : undefined} />
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
          </section>
        </>
      )}
    </Page>
  );
}
