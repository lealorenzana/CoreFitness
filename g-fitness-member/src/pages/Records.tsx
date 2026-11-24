import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, SectionHead, SeeAll } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { getCurrentMemberId } from '../services/bookingService';
import {
  getShowOnBoards, personalRecords, prWall, recordValue, setShowOnBoards, type Record_, type WallRow,
} from '../lib/api/records';

/**
 * Records (0123): this week's record wall and your own records. This was the
 * Season page; the monthly season itself went with 0275, and what stayed is
 * what a member set themselves.
 *
 * The wall shows only members who chose to be on it; the switch here is how.
 * Your own records are shown to you either way.
 */
export default function Records() {
  const navigate = useNavigate();
  const [wall, setWall] = useState<WallRow[] | undefined>(undefined);
  const [records, setRecords] = useState<Record_[] | null>(null);
  const [onWall, setOnWall] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const me = await getCurrentMemberId();
    const [w, r, o] = await Promise.all([
      prWall(), me ? personalRecords(me) : Promise.resolve(null), me ? getShowOnBoards(me) : Promise.resolve(null),
    ]);
    setWall(w); setRecords(r); setOnWall(o);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const toggleWall = async () => {
    if (onWall === null) return;
    setBusy(true);
    try {
      await setShowOnBoards(!onWall);
      toast.success(!onWall ? 'You are on the record wall now.' : 'You are off the record wall. Your own records still show here.');
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be changed'));
    } finally {
      setBusy(false);
    }
  };

  if (wall === undefined) return <Page><PageTitle back title="Records" /><SkeletonList /></Page>;

  return (
    <Page>
      <PageTitle back fallback="/member/rewards" title="Records" subtitle="This week's wall, and every best you have beaten" />

      <section>
        <SectionHead title="Records this week" meta="Opted-in members" />
        {wall.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No records on the wall yet this week.</p>
        ) : wall.map((w, i) => (
          <LineRow key={i} title={`${w.firstName} ${w.lastInitial}. · ${w.exerciseName}`}
            meta={new Date(w.achievedAt).toLocaleDateString('en-US', { weekday: 'short' })}
            action={<span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary-300)' }}>{recordValue(w.kind, w.value)}</span>}
            last={i === wall.length - 1} />
        ))}
        {onWall !== null && (
          <label className="flex items-center" style={{ gap: 10, marginTop: 12, fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={onWall} disabled={busy} onChange={() => void toggleWall()} aria-label="Show me on the record wall" />
            Show me on the record wall (first name and initial only)
          </label>
        )}
      </section>

      <section>
        <SectionHead title="Your records" />
        {records === null ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Your records could not be loaded just now.</p>
        ) : records.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            None yet. Beat your best on any exercise in the tracker and it lands here. Your first time on an exercise sets the bar.
          </p>
        ) : records.slice(0, 5).map((r, i, shown) => (
          <LineRow key={r.id} title={r.exerciseName}
            meta={`up from ${recordValue(r.kind, r.previous)} · ${new Date(r.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            action={<span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary-300)' }}>{recordValue(r.kind, r.value)}</span>}
            last={i === shown.length - 1} />
        ))}
        {records && records.length > 5 && <SeeAll label="See all your records" count={records.length} onClick={() => navigate('/member/records/all')} />}
      </section>
    </Page>
  );
}
