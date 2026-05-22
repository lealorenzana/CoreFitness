import { useEffect, useMemo, useState } from 'react';
import { progressService, type WorkoutLog, type BodyProgressEntry, type AttendanceRecord } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import ErrorState from '../../../components/ui/ErrorState';
import { LineMini, BarMini, AreaMini, type ChartPoint } from '../../../components/ui/MiniCharts';

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

  // Weight trend (chronological)
  const weightChart: ChartPoint[] = useMemo(
    () => body.map(b => ({ label: new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: b.weight })),
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

  // Calories burned (last 30 days, summed per 5-day bucket)
  const caloriesChart: ChartPoint[] = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }).map((_, idx) => {
      const i = 5 - idx;
      const start = new Date(now.getTime() - (i + 1) * 5 * 86400000);
      const end   = new Date(now.getTime() - i * 5 * 86400000);
      const total = logs.filter(l => {
        const d = new Date(l.date);
        return d >= start && d < end;
      }).reduce((s, l) => s + l.calories, 0);
      return { label: `${(i + 1) * 5}d`, value: total };
    });
  }, [logs]);

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
    </div>
  );
  if (error) return <ErrorState onRetry={load} />;

  const startWeight   = body[0]?.weight ?? 0;
  const currentWeight = body[body.length - 1]?.weight ?? startWeight;
  const goalWeight    = Math.max(60, currentWeight - 4);

  return (
    <div className="space-y-4">
      {/* Weight Trend */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Weight Trend</h3>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>last {body.length} entries</span>
        </div>
        <LineMini data={weightChart} color="var(--color-secondary)" height={160} />
      </div>

      {/* Workouts per week */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Workouts per Week</h3>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>last 6 weeks</span>
        </div>
        <BarMini data={workoutsChart} color="var(--color-primary)" height={160} />
      </div>

      {/* Attendance heatmap (bar form) */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Visit Days</h3>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>by weekday</span>
        </div>
        <BarMini data={attendanceChart} color="var(--color-secondary)" height={140} />
      </div>

      {/* Calories burned area */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold text-sm">Calories Burned</h3>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>last 30 days</span>
        </div>
        <AreaMini data={caloriesChart} color="var(--color-primary)" height={140} />
      </div>

      {/* Weight start → current → goal */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold text-sm mb-3">Weight Journey</h3>
        <div className="flex items-center justify-between text-center">
          <div>
            <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Start</p>
            <p className="text-lg font-bold text-white">{startWeight} kg</p>
          </div>
          <div className="flex-1 mx-2 h-1.5 rounded-full" style={{ background: 'var(--color-border)' }}>
            <div className="h-full rounded-full" style={{
              background: 'var(--color-secondary)',
              width: `${Math.min(100, Math.max(0, ((startWeight - currentWeight) / Math.max(1, startWeight - goalWeight)) * 100))}%`,
            }} />
          </div>
          <div>
            <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Current</p>
            <p className="text-lg font-bold" style={{ color: 'var(--color-secondary)' }}>{currentWeight} kg</p>
          </div>
          <div className="flex-1 mx-2 h-1.5 rounded-full" style={{ background: 'var(--color-border)' }} />
          <div>
            <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Goal</p>
            <p className="text-lg font-bold text-white">{goalWeight} kg</p>
          </div>
        </div>
      </div>
    </div>
  );
}
