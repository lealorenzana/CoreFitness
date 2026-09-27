import { useEffect, useState } from 'react';
import { personalRecords, recordValue, type Record_ } from '../../lib/api/season';

/**
 * A trainee's latest personal records (0123), for their coach.
 *
 * The database decides who may read them: this trainee's own coach, and only
 * while the member shares their workouts (`trainer_may_see(member, 'workouts')`,
 * 0032). Anything else comes back as an error, and this renders nothing — a
 * member who keeps their workouts private has no records to show here, and the
 * sheet's sharing panel already says so.
 */
export default function TraineeRecords({ memberId }: { memberId: string }) {
  const [records, setRecords] = useState<Record_[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await personalRecords(memberId);
      if (alive) setRecords(r);
    })();
    return () => { alive = false; };
  }, [memberId]);

  if (!records || records.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Personal records</p>
      <div className="flex flex-col" style={{ marginTop: 6 }}>
        {records.slice(0, 4).map((r) => (
          <div key={r.id} className="flex items-baseline justify-between" style={{ gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-separator)' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{r.exerciseName}</span>
            <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-300)' }}>
              {recordValue(r.kind, r.value)}
              <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 6, color: 'var(--color-text-muted)' }}>
                {new Date(r.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
