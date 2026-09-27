import { useEffect, useState } from 'react';
import Avatar from '../ui/Avatar';
import { Panel, StatusPill } from '../ui/noc';
import { SkeletonList } from '../ui/Skeleton';
import { FLAG_LABEL, roomProgress, type ProgressRow, type Room } from '../../lib/api/rooms';

const CELL: Record<ProgressRow['cells'][number]['status'], { mark: string; color: string; label: string }> = {
  on_time: { mark: '✓', color: 'var(--color-primary-300)', label: 'on time' },
  late: { mark: 'L', color: 'var(--color-text-secondary)', label: 'late' },
  missing: { mark: '!', color: 'var(--color-secondary)', label: 'missing' },
  assigned: { mark: '–', color: 'var(--color-text-muted)', label: 'not due yet' },
  none: { mark: '', color: 'transparent', label: 'not set for them' },
};

function ago(iso: string | null): string {
  if (!iso) return 'No workout logged';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'Trained today' : d === 1 ? 'Trained yesterday' : `Trained ${d} days ago`;
}

/**
 * The grade book (0129): each member, their classwork as a strip of marks
 * (oldest first), on-time rate, last workout, class attendance, and the latest
 * weight they handed in. Flags are computed in SQL every time, never stored:
 * 2+ missing, no workout in 10 days, missed their last 3 booked classes.
 * People who need attention come first.
 */
export default function ProgressTab({ room }: { room: Room }) {
  const [rows, setRows] = useState<ProgressRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try { const r = await roomProgress(room.id); if (alive) setRows(r); }
      catch { if (alive) { setFailed(true); setRows([]); } }
    })();
    return () => { alive = false; };
  }, [room.id]);

  if (rows === null) return <SkeletonList />;
  if (failed) return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Progress could not load. Try again.</p>;
  if (rows.length === 0) return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No one is in this room yet.</p>;

  const sorted = [...rows].sort((a, b) => b.flags.length - a.flags.length);
  const flagged = sorted.filter((r) => r.flags.length > 0).length;

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
        {flagged > 0 ? `${flagged} ${flagged === 1 ? 'person needs' : 'people need'} a look.` : 'Nobody is flagged. '}
        {' '}✓ on time · L late · ! missing · – not due yet
      </p>
      {sorted.map((r) => {
        const done = r.onTime + r.late;
        const rate = r.assigned > 0 ? Math.round((r.onTime / r.assigned) * 100) : null;
        return (
          <Panel key={r.memberId}>
            <div className="flex items-center" style={{ gap: 10 }}>
              <Avatar name={r.name} photoUrl={r.photoUrl} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{r.name}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {ago(r.lastWorkoutAt)}
                  {r.classesBooked ? ` · ${r.classesAttended} of last ${r.classesBooked} classes` : ''}
                  {r.latestWeight != null ? ` · ${r.latestWeight} kg` : ''}
                </p>
              </div>
              {rate !== null && (
                <p className="tabular-nums" style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }}
                  aria-label={`${rate} percent on time`}>{rate}%</p>
              )}
            </div>
            {r.cells.some((c) => c.status !== 'none') && (
              <div className="flex flex-wrap" style={{ gap: 4, marginTop: 10 }} aria-label={`${done} of ${r.assigned} turned in`}>
                {r.cells.filter((c) => c.status !== 'none').map((c) => (
                  <span key={c.assignment} title={CELL[c.status].label}
                    style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800,
                      color: CELL[c.status].color, border: '1px solid var(--color-border)' }}>
                    {CELL[c.status].mark}
                  </span>
                ))}
              </div>
            )}
            {r.flags.length > 0 && (
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 10 }}>
                {r.flags.map((f) => <StatusPill key={f} label={FLAG_LABEL[f]} tone="action" />)}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
