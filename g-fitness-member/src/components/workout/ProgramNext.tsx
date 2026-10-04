import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck } from '@phosphor-icons/react';
import { Eyebrow, NocButton, ProgressBar } from '../ui/noc';
import { toast } from '../ui/Toast';
import { programProgress, startProgramDay, type ProgressDay } from '../../lib/api/programs';
import { getOpenRoutineSession } from '../../lib/api/routines';
import { errorMessage } from '../../utils/errorMessage';
import { getCurrentMemberId } from '../../services/bookingService';

/**
 * Today's card for the gym program a member follows (0122): the next day not
 * done yet, how far through they are, and one button to start it — the same
 * start the program screen has. Renders nothing when they follow none.
 */
export default function ProgramNext() {
  const navigate = useNavigate();
  const [days, setDays] = useState<ProgressDay[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const me = await getCurrentMemberId();
      if (!me || !alive) return;
      setMemberId(me);
      try { const d = await programProgress(me); if (alive) setDays(d); } catch { if (alive) setDays([]); }
    })();
    return () => { alive = false; };
  }, []);

  if (!memberId || !days || days.length === 0) return null;
  const done = days.filter((d) => d.done).length;
  const next = days.find((d) => !d.done) ?? null;

  const start = async () => {
    if (!next) return;
    setBusy(true);
    try {
      // One workout at a time: an open one is finished first.
      const open = await getOpenRoutineSession(memberId);
      navigate(`/member/track/session/${open ? open.logId : await startProgramDay(next.dayId)}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start that day'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Your program" style={{ padding: 14, borderRadius: 18, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
      <div className="flex items-center justify-between" style={{ gap: 10 }}>
        <Eyebrow mark>Your program</Eyebrow>
        <button onClick={() => navigate(`/member/program/${days[0].programId}`)} style={{ fontSize: 12.5, color: 'var(--color-primary-300)' }}>See all days</button>
      </div>
      <p style={{ marginTop: 6, fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>{days[0].programName}</p>
      <div style={{ marginTop: 10 }}>
        <ProgressBar fraction={done / days.length} />
        <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--color-text-muted)' }}>{done} of {days.length} days done</p>
      </div>
      {next ? (
        <div className="flex items-center justify-between" style={{ gap: 12, marginTop: 12 }}>
          <span className="flex items-center min-w-0" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-primary)' }}>
            <CalendarCheck size={17} style={{ color: 'var(--color-primary-300)' }} />
            <span className="truncate">Week {next.week} · Day {next.day} — {next.workoutName}</span>
          </span>
          <NocButton onClick={() => void start()} disabled={busy}>{busy ? 'Starting…' : 'Start'}</NocButton>
        </div>
      ) : (
        <p style={{ marginTop: 12, fontSize: 13.5, color: 'var(--color-primary-300)' }}>Every day done — well finished. Pick your next one under Programs.</p>
      )}
    </section>
  );
}
