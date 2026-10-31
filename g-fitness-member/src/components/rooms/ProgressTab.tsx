import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clock, ExclamationMark, WarningCircle, type Icon } from '@phosphor-icons/react';
import Avatar from '../ui/Avatar';
import { StatusPill } from '../ui/noc';
import { SkeletonList } from '../ui/Skeleton';
import { FLAG_LABEL, roomProgress, type ProgressRow, type Room } from '../../lib/api/rooms';

type CellStatus = ProgressRow['cells'][number]['status'];
/** Marks with words (wave 2, 2026-10-27): "✓ L ! –" asked the coach to learn a code. */
const CELL: Record<Exclude<CellStatus, 'none'>, { icon: Icon | null; cls: string; label: string }> = {
  on_time: { icon: Check, cls: 'pg-on', label: 'On time' },
  late: { icon: Clock, cls: 'pg-late', label: 'Late' },
  missing: { icon: ExclamationMark, cls: 'pg-miss', label: 'Missing' },
  assigned: { icon: null, cls: 'pg-due', label: 'Not due yet' },
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
 * People who need attention come first, and the first of them is named in
 * words at the top. Each mark opens that piece of classwork.
 */
export default function ProgressTab({ room }: { room: Room }) {
  const navigate = useNavigate();
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
  const flagged = sorted.filter((r) => r.flags.length > 0);
  const first = flagged[0];

  return (
    <div className="flex flex-col" style={{ gap: 12 }} data-progress>
      {first ? (
        <div className="flex items-start" data-needs-look style={{ gap: 10, padding: '10px 12px', borderRadius: 14, fontSize: 13, lineHeight: 1.45,
          background: 'var(--color-secondary-light)', border: '1px solid color-mix(in srgb, var(--color-secondary) 35%, transparent)', color: 'var(--color-text-secondary)' }}>
          <WarningCircle size={18} weight="fill" style={{ color: 'var(--color-secondary)', flex: 'none', marginTop: 1 }} />
          <span>
            <b style={{ color: 'var(--color-text-primary)' }}>{first.name.split(' ')[0]} needs a look:</b>{' '}
            {first.flags.map((f) => FLAG_LABEL[f].toLowerCase()).join(', ')}.
            {flagged.length > 1 && ` ${flagged.length - 1} more ${flagged.length === 2 ? 'person needs' : 'people need'} one too.`}
          </span>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody needs a look right now.</p>
      )}

      <div className="flex flex-wrap" style={{ gap: 6 }} aria-label="What the marks mean" data-legend>
        {Object.values(CELL).map((c) => {
          const MarkIcon = c.icon;
          return <span key={c.label} className={`pg-mk ${c.cls}`}>{MarkIcon && <MarkIcon size={13} weight="bold" />}{c.label}</span>;
        })}
      </div>

      <div className="td-card">
        {sorted.map((r, i) => {
          const done = r.onTime + r.late;
          const rate = r.assigned > 0 ? Math.round((r.onTime / r.assigned) * 100) : null;
          const cells = r.cells.filter((c) => c.status !== 'none');
          return (
            <div key={r.memberId} className="flex items-start" style={{ gap: 10, padding: '12px 0', borderTop: i === 0 ? 0 : '1px solid var(--color-separator)' }}>
              <Avatar name={r.name} photoUrl={r.photoUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center flex-wrap" style={{ gap: 6, fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {r.name}{r.flags.length > 0 && <StatusPill label="Needs a look" tone="action" />}
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {ago(r.lastWorkoutAt)}
                  {r.classesBooked ? ` · ${r.classesAttended} of last ${r.classesBooked} classes` : ''}
                  {r.latestWeight != null ? ` · ${r.latestWeight} kg` : ''}
                </p>
                {cells.length > 0 && (
                  <div className="flex flex-wrap" style={{ gap: 4, marginTop: 8 }} aria-label={`${done} of ${r.assigned} turned in`}>
                    {cells.map((c, n) => {
                      const cell = CELL[c.status as Exclude<CellStatus, 'none'>];
                      const MarkIcon = cell.icon;
                      return (
                        <button key={c.assignment} type="button" className={`pg-mk noc-press ${cell.cls}`} data-mark={c.status}
                          aria-label={`Classwork ${n + 1}: ${cell.label.toLowerCase()}`} title={cell.label}
                          onClick={() => navigate(`/trainer/rooms/${room.id}/work/${c.assignment}`)}>
                          {MarkIcon ? <MarkIcon size={13} weight="bold" /> : 'due'}
                        </button>
                      );
                    })}
                  </div>
                )}
                {r.flags.length > 0 && (
                  <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-secondary-300)' }}>{r.flags.map((f) => FLAG_LABEL[f]).join(' · ')}</p>
                )}
              </div>
              {rate !== null && (
                <p className="tabular-nums" style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}
                  aria-label={`${rate} percent on time`}>{rate}%</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
