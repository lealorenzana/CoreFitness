import { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { progressService, type AttendanceRecord } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';

export default function AttendanceTab() {
  const memberId = useMemberId();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const load = async () => {
    setLoading(true); setError(false);
    try { setRecords(await progressService.getAttendance(memberId)); }
    catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart  = new Date(now.getTime() - now.getDay() * 86400000);

    const thisMonth = records.filter(r => new Date(r.date) >= monthStart).length;
    const thisWeek  = records.filter(r => new Date(r.date) >= weekStart).length;
    const allTime   = records.length;
    const lastVisit = records[0]?.date;
    const isActive  = lastVisit ? (now.getTime() - new Date(lastVisit).getTime()) < 14 * 86400000 : false;

    const monthlyTarget = 20;
    const consistencyScore = Math.min(100, Math.round((thisMonth / monthlyTarget) * 100));

    return { thisMonth, thisWeek, allTime, isActive, consistencyScore, lastVisit };
  }, [records]);

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  const weekStartDate = new Date(today.getTime() - today.getDay() * 86400000);
  const weekDayPresence = weekDays.map((day, i) => {
    const d = new Date(weekStartDate.getTime() + i * 86400000).toISOString().split('T')[0];
    return { day, present: records.some(r => r.date === d) };
  });

  if (loading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-48" /></div>;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'All Time Visits',    value: stats.allTime,   color: 'var(--color-primary)' },
          { label: 'This Month',         value: stats.thisMonth, color: 'var(--color-secondary)' },
          { label: 'This Week',          value: stats.thisWeek,  color: 'var(--color-primary)' },
          { label: 'Consistency Score',  value: `${stats.consistencyScore}%`, color: 'var(--color-primary)' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Active status */}
      <div className="rounded-2xl p-4 flex items-center justify-between"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div>
          <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Status</p>
          <p className="text-base font-bold" style={{ color: stats.isActive ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
            {stats.isActive ? '✓ Active Member' : '○ Inactive'}
          </p>
        </div>
        <p className="text-xs text-right" style={{ color: 'var(--color-text-muted)' }}>
          Last visit<br />
          <span className="text-white font-semibold">
            {stats.lastVisit ? new Date(stats.lastVisit).toLocaleDateString() : '—'}
          </span>
        </p>
      </div>

      {/* Weekly summary */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-white font-semibold text-sm mb-3">This Week</h3>
        <div className="grid grid-cols-7 gap-1.5">
          {weekDayPresence.map(d => (
            <div key={d.day} className="text-center">
              <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>{d.day}</p>
              <div className="h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: d.present ? 'var(--color-secondary)' : 'var(--color-bg)',
                  border: `1px solid ${d.present ? 'var(--color-secondary)' : 'var(--color-border)'}`,
                  color: d.present ? '#000' : 'var(--color-text-muted)',
                }}>
                {d.present ? '✓' : '·'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Check-in log */}
      <div>
        <h3 className="text-white font-semibold mb-2 px-1">Check-In Log</h3>
        {records.length === 0 ? (
          <EmptyState icon={Calendar} title="No check-ins yet" message="Your gym visits will appear here." />
        ) : (
          <div className="space-y-2">
            {records.slice(0, 12).map(r => (
              <div key={r.id} className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div>
                  <p className="text-sm font-semibold text-white">{new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{r.time}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background: r.method === 'QR' ? 'var(--color-secondary-light)' : 'var(--color-primary-light)',
                    color: r.method === 'QR' ? 'var(--color-secondary)' : 'var(--color-primary)',
                  }}>
                  {r.method}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
