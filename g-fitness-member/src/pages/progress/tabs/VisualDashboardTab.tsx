import { useEffect, useMemo, useState } from 'react';
import { progressService, type WorkoutLog, type BodyProgressEntry, type AttendanceRecord } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import ErrorState from '../../../components/ui/ErrorState';
import { LineMini, BarMini, AreaMini, type ChartPoint } from '../../../components/ui/MiniCharts';
import ProgressRail from '../../../components/ui/ProgressRail';

export default function VisualDashboardTab() {
  const memberId = useMemberId();
  const [body, setBody]             = useState<BodyProgressEntry[]>([]);
  const [logs, setLogs]             = useState<WorkoutLog[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const [b, w, a] = await Promise.all([
        progressService.getBodyProgress(memberId),
        progressService.getWorkoutLogs(memberId),
        progressService.getAttendance(memberId),
      ]);
      setBody(b); setLogs(w); setAttendance(a);
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  // Weight trend (chronological). Entries with no weight recorded are skipped
  // rather than plotted as zero — a missing measurement is not a 0 kg member,
  // and one such point would flatten the whole chart.
  const weightChart: ChartPoint[] = useMemo(
    () => body
      .filter((b): b is typeof b & { weight: number } => b.weight != null)
      .map(b => ({
        label: new Date(`${b.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: b.weight,
      })),
    [body],
  );

  // Workouts per week (last 6 weeks)
  const workoutsChart: ChartPoint[] = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }).map((_, idx) => {
      const i = 5 - idx;
      const start = new Date(now.getTime() - (i + 1) * 7 * 86400000);
      const end   = new Date(now.getTime() - i * 7 * 86400000);
      const count = logs.filter(l => {
        const d = new Date(l.date);
        return d >= start && d < end;
      }).length;
      return { label: `W-${i}`, value: count };
    });
  }, [logs]);

  // Attendance per weekday (Mon..Sun)
  const attendanceChart: ChartPoint[] = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((d, idx) => {
      // JS getDay: Sun=0..Sat=6 — remap so Mon=0
      const target = (idx + 1) % 7;
      const count  = attendance.filter(a => new Date(a.date).getDay() === target).length;
      return { label: d, value: count };
    });
  }, [attendance]);

  // Minutes trained per 5-day bucket. This replaced a calories chart: calories
  // need body mass and heart rate, neither of which anything here measures, so
  // the old figures were invented. Minutes are recorded by the member.
  const minutesChart: ChartPoint[] = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }).map((_, idx) => {
      const i = 5 - idx;
      const start = new Date(now.getTime() - (i + 1) * 5 * 86400000);
      const end   = new Date(now.getTime() - i * 5 * 86400000);
      const total = logs.filter(l => {
        const d = new Date(`${l.date}T00:00:00`);
        return d >= start && d < end;
      }).reduce((s, l) => s + (l.duration ?? 0), 0);
      return { label: `${(i + 1) * 5}d`, value: total };
    });
  }, [logs]);

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
    </div>
  );
  if (error) return <ErrorState onRetry={load} />;

  // First and last readings that actually exist. `?? 0` would put a real 0 kg
  // on the card for a member who has only ever logged measurements.
  const weighed      = body.filter((b) => b.weight != null);
  const startWeight  = weighed.length ? weighed[0].weight : null;
  const currentWeight = weighed.length ? weighed[weighed.length - 1].weight : null;
  const weightDelta  = startWeight != null && currentWeight != null
    ? Number((currentWeight - startWeight).toFixed(1))
    : null;

  return (
    <div className="space-y-4">
      {/* The streak and the counters, above the charts: the charts show shape,
          these show where the member actually stands. */}
      <ProgressRail />

      {/* Weight Trend */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Weight Trend</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>last {body.length} entries</span>
        </div>
        <LineMini data={weightChart} color="var(--color-secondary)" height={160} />
      </div>

      {/* Workouts per week */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Workouts per Week</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>last 6 weeks</span>
        </div>
        <BarMini data={workoutsChart} color="var(--color-primary)" height={160} />
      </div>

      {/* Attendance heatmap (bar form) */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Visit Days</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>by weekday</span>
        </div>
        <BarMini data={attendanceChart} color="var(--color-secondary)" height={140} />
      </div>

      {/* Minutes trained */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Minutes Trained</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>last 30 days</span>
        </div>
        <AreaMini data={minutesChart} color="var(--color-primary)" height={140} />
      </div>

      {/* Weight start → current.
          There used to be a third column here labelled "Goal", holding
          `Math.max(60, currentWeight - 4)` — a number nobody set. It told every
          member, whatever their build or reason for training, that they ought
          to be four kilos lighter, and it moved down every time they weighed
          in, so it could never be reached. Real targets live in `fitness_goals`
          and have their own tab; this card states what was measured and
          nothing else. */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold text-sm mb-3">Weight journey</h3>
        {startWeight == null || currentWeight == null ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Log your weight twice to see the change between readings.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-center">
              <div>
                <p className="text-xs uppercase" style={{ color: 'var(--color-text-muted)' }}>First</p>
                <p className="text-lg font-bold text-white">{startWeight} kg</p>
              </div>
              <div className="flex-1 mx-3 h-1.5 rounded-full" style={{ background: 'var(--color-border)' }} />
              <div>
                <p className="text-xs uppercase" style={{ color: 'var(--color-text-muted)' }}>Latest</p>
                <p className="text-lg font-bold" style={{ color: 'var(--color-secondary)' }}>{currentWeight} kg</p>
              </div>
            </div>
            <p className="text-xs mt-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
              {weightDelta === 0
                ? 'No change across your logged readings.'
                : `${weightDelta! > 0 ? '+' : ''}${weightDelta} kg across ${weighed.length} readings.`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
