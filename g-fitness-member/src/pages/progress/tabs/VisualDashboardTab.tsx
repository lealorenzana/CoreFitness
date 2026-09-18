import { useCallback, useEffect, useMemo, useState } from 'react';
import { progressService, type WorkoutLog, type BodyProgressEntry, type AttendanceRecord } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import ErrorState from '../../../components/ui/ErrorState';
import { Chip, SectionHead } from '../../../components/ui/noc';

type Metric = 'weight' | 'workouts' | 'visits' | 'minutes';

interface Bar { label: string; value: number }

interface Series {
  bars: Bar[];
  unit: string;
  /** Where the bars start. Zero for counts; below the lowest reading for weight. */
  floor: number;
  /** A sentence naming what actually happened, computed from the bars. */
  note: string;
  /** What the unit and the baseline are — stated, so a cropped axis is never a trick. */
  basis: string;
}

const METRICS: { id: Metric; label: string }[] = [
  { id: 'weight', label: 'Body weight' },
  { id: 'workouts', label: 'Workouts a week' },
  { id: 'visits', label: 'Visits a month' },
  { id: 'minutes', label: 'Minutes a week' },
];

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short' });

/** Local week buckets ending today: [start, end) for each of the last six. */
function lastSixWeeks(): { start: number; end: number; label: string }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    const end = today - i * 7 * 86_400_000;
    const start = end - 7 * 86_400_000;
    // The week's first day: shorter than "2 wk ago" and it fits a 45px column.
    return { start, end, label: new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  });
}

/** 'YYYY-MM-DD' as a local instant — never `new Date(key)`, which is UTC. */
const localTime = (key: string) => new Date(`${key}T00:00:00`).getTime();

function busiest(bars: Bar[]): Bar | null {
  return bars.reduce<Bar | null>((best, b) => (b.value > (best?.value ?? -1) ? b : best), null);
}

/**
 * Charts — one metric at a time, as six bars (Nocturne redesign).
 *
 * Four chart cards in a column became one chart and a set of chips: the cards
 * all said "here is a shape" and none said what the shape meant. Each series now
 * ends with a sentence computed from its own bars.
 *
 * **Honesty rules carried over and made explicit:**
 * - A reading with no weight is skipped, never plotted as 0 kg.
 * - Weight bars start below the lowest reading, not at zero — otherwise every
 *   bar is the same height and a 3 kg change is invisible. The line under the
 *   chart says so, so a cropped axis is never a trick.
 * - Counts start at zero.
 * - Calories are still absent: they need body mass and heart rate, which
 *   nothing here measures.
 *
 * The old axis labels were 10px, below the app's 12px floor. These are 12px.
 */
export default function VisualDashboardTab() {
  const memberId = useMemberId();
  const [metric, setMetric] = useState<Metric>('weight');
  const [body, setBody] = useState<BodyProgressEntry[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
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
  }, [memberId]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const series: Series = useMemo(() => {
    if (metric === 'weight') {
      const weighed = body
        .filter((b): b is typeof b & { weight: number } => b.weight != null)
        .slice(-6);
      const bars = weighed.map((b) => ({
        label: new Date(`${b.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: b.weight,
      }));
      const min = bars.length ? Math.min(...bars.map((x) => x.value)) : 0;
      const first = bars[0]?.value;
      const last = bars[bars.length - 1]?.value;
      const change = first != null && last != null ? Number((last - first).toFixed(1)) : null;
      return {
        bars, unit: 'kg',
        floor: Math.max(0, Math.floor(min - 3)),
        note: bars.length < 2
          ? 'Log your weight twice to see how it moves.'
          : change === 0
            ? `No change across your last ${bars.length} readings.`
            : `${change! > 0 ? 'Up' : 'Down'} ${Math.abs(change!)} kg across your last ${bars.length} readings.`,
        basis: bars.length ? `Kilograms. Bars start at ${Math.max(0, Math.floor(min - 3))} kg, not zero, so the change is visible.` : 'Kilograms.',
      };
    }

    if (metric === 'workouts' || metric === 'minutes') {
      const weeks = lastSixWeeks();
      const bars = weeks.map((w) => {
        const inWeek = logs.filter((l) => { const t = localTime(l.date); return t >= w.start && t < w.end; });
        return {
          label: w.label,
          value: metric === 'workouts' ? inWeek.length : inWeek.reduce((s, l) => s + (l.duration ?? 0), 0),
        };
      });
      const total = bars.reduce((s, b) => s + b.value, 0);
      const top = busiest(bars);
      return {
        bars, unit: metric === 'workouts' ? '' : 'min', floor: 0,
        note: total === 0
          ? 'Nothing logged in the last six weeks.'
          : metric === 'workouts'
            ? `${total} ${total === 1 ? 'workout' : 'workouts'} in six weeks. The busiest week had ${top!.value}.`
            : `${total} minutes in six weeks. The longest week was ${top!.value} minutes.`,
        basis: metric === 'workouts' ? 'Workouts you logged, per week.' : 'Minutes you logged, per week. A session with no length adds nothing.',
      };
    }

    // Visits a month: the last six calendar months, from check-ins the gym recorded.
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, idx) => new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1));
    const bars = months.map((m) => {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime();
      return {
        label: MONTH.format(m),
        value: attendance.filter((a) => { const t = localTime(a.date); return t >= m.getTime() && t < next; }).length,
      };
    });
    const top = busiest(bars);
    return {
      bars, unit: '', floor: 0,
      note: bars.every((b) => b.value === 0)
        ? 'No check-ins recorded in the last six months.'
        : `${top!.label} was your busiest month, with ${top!.value} ${top!.value === 1 ? 'visit' : 'visits'}.`,
      basis: 'Check-ins the front desk recorded.',
    };
  }, [metric, body, logs, attendance]);

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
    </div>
  );
  if (error) return <ErrorState onRetry={load} />;

  const top = Math.max(...series.bars.map((b) => b.value), series.floor + 1);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stack)' }}>
      <section>
        <SectionHead title="Trends" meta="last six" />
        <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, margin: '12px calc(var(--gutter) * -1) 0', padding: '2px var(--gutter)' }}>
          {METRICS.map((m) => (
            <Chip key={m.id} label={m.label} on={metric === m.id} onClick={() => setMetric(m.id)} />
          ))}
        </div>

        {series.bars.length === 0 ? (
          <p style={{ marginTop: 18, fontSize: 13, color: 'var(--color-text-muted)' }}>{series.note}</p>
        ) : (
          <>
            <div role="img" aria-label={`${METRICS.find((m) => m.id === metric)!.label}: ${series.note}`}
              className="flex items-end" style={{ gap: 10, marginTop: 22 }}>
              {series.bars.map((b, i) => {
                const latest = i === series.bars.length - 1;
                const h = 30 + ((b.value - series.floor) / Math.max(1, top - series.floor)) * 140;
                return (
                  <div key={`${b.label}:${i}`} className="flex-1 flex flex-col items-center min-w-0" style={{ gap: 8 }}>
                    <span style={{ fontSize: 12, color: latest ? 'var(--color-primary-300)' : 'var(--color-text-secondary)' }}>
                      {b.value}
                    </span>
                    {/* Capped: with two readings each column is half the
                        screen, and a bar that wide stops reading as a bar. */}
                    <div style={{
                      width: '100%', maxWidth: 44, height: b.value === 0 && series.floor === 0 ? 4 : h, borderRadius: 4,
                      background: latest ? 'var(--color-primary)' : 'var(--color-surface-high)',
                      boxShadow: latest ? '0 0 14px -4px var(--color-primary)' : 'none',
                    }} />
                    <span className="truncate w-full text-center" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <p style={{ marginTop: 20, fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{series.note}</p>
            <p style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>{series.basis}</p>
          </>
        )}
      </section>
    </div>
  );
}
