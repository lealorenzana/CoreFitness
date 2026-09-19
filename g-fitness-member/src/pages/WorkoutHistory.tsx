import { useEffect, useMemo, useState } from 'react';
import { Page, PageTitle } from '../components/ui/page';
import { SkeletonList } from '../components/ui/Skeleton';
import DayWorkoutsSheet from '../components/ui/DayWorkoutsSheet';
import WorkoutLogRow from '../components/ui/WorkoutLogRow';
import { getCurrentMemberId } from '../services/bookingService';
import { progressService, type WorkoutLog } from '../services/progressService';
import { errorMessage } from '../utils/errorMessage';

/**
 * Every workout you have logged, by month (2026-09-19). Progress → Overview
 * shows the five most recent and "See all"; this is "all". A row opens that
 * day's workout set by set, the same sheet Attendance opens.
 */
export default function WorkoutHistory() {
  const [memberId, setMemberId] = useState('');
  const [logs, setLogs] = useState<WorkoutLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Your session could not be verified.');
        const rows = await progressService.getWorkoutLogs(id);
        if (!alive) return;
        setMemberId(id);
        setLogs(rows);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your workouts.'));
      }
    })();
    return () => { alive = false; };
  }, []);

  const months = useMemo(() => {
    const out: [string, WorkoutLog[]][] = [];
    for (const l of logs ?? []) {
      const label = new Date(`${l.date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last[0] === label) last[1].push(l);
      else out.push([label, [l]]);
    }
    return out;
  }, [logs]);

  return (
    <Page>
      <PageTitle back fallback="/member/progress" title="Workout history"
        subtitle={logs ? `${logs.length} ${logs.length === 1 ? 'workout' : 'workouts'} logged` : 'Everything you have logged'} />
      {error ? (
        <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>
      ) : logs == null ? (
        <SkeletonList />
      ) : logs.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Nothing yet. Start one of your routines and every set you tick is kept here, day by day.
        </p>
      ) : (
        months.map(([label, list]) => (
          <section key={label}>
            <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {label}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}> · {list.length}</span>
            </h2>
            <div className="noc-rows" style={{ marginTop: 4 }}>
              {list.map((l, i) => (
                <WorkoutLogRow key={l.id} l={l} last={i === list.length - 1} onOpen={() => setOpenDay(l.date)} />
              ))}
            </div>
          </section>
        ))
      )}
      <DayWorkoutsSheet memberId={memberId} day={openDay} onClose={() => setOpenDay(null)} />
    </Page>
  );
}
