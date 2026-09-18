import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barbell, CaretRight, Lightning, PencilSimple, Play, Plus } from '@phosphor-icons/react';
import { SkeletonList } from '../components/ui/Skeleton';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, NocButton, Panel, SectionHead } from '../components/ui/noc';
import FeatureLock from '../components/ui/FeatureLock';
import { toast } from '../components/ui/Toast';
import { getCurrentMemberId } from '../services/bookingService';
import {
  getOpenRoutineSession, listRoutines, routineSummary, startRoutineSession, type Routine,
} from '../lib/api/routines';
import { errorMessage } from '../utils/errorMessage';

/**
 * My routines — the tracker's front door (0086).
 *
 * The blank "add a set" form this replaced made a member retype the same leg
 * day every week. Now a routine is built once and run as a guided workout; the
 * old free-form log stays one tap away for a session that follows no routine.
 */
export default function Routines() {
  const navigate = useNavigate();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [open, setOpen] = useState<Awaited<ReturnType<typeof getOpenRoutineSession>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Could not identify your account.');
        const [list, session] = await Promise.all([listRoutines(id), getOpenRoutineSession(id)]);
        if (!alive) return;
        setMemberId(id);
        setRoutines(list);
        setOpen(session);
      } catch (err) {
        if (alive) setError(errorMessage(err, 'Could not load your routines'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const start = async (r: Routine) => {
    if (!memberId || starting) return;
    if (open) {
      // One workout at a time — the same rule the tracker has always kept.
      toast.error('Finish or discard the workout you already started first.');
      return;
    }
    setStarting(r.id);
    try {
      const logId = await startRoutineSession(memberId, r);
      navigate(`/member/track/session/${logId}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start that workout'));
      setStarting(null);
    }
  };

  const title = (
    <PageTitle back fallback="/member/home" title="My routines"
      subtitle="Build a workout once, then let the app walk you through it" />
  );

  return (
    <FeatureLock feature="workout_tracker" context={<Page>{title}</Page>}>
      <Page>
        {title}

        {error && <p role="alert" style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>}

        {loading ? <SkeletonList count={3} /> : (
          <>
            {/* A workout already under way comes first — it is the one thing
                the member most likely came back for. */}
            {open && (
              <Panel glow="action" onClick={() => navigate(open.routineId
                ? `/member/track/session/${open.logId}` : '/member/track/log')}>
                <Eyebrow tone="action">In progress</Eyebrow>
                <p className="flex items-center" style={{ gap: 8, marginTop: 6, fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  <Lightning size={18} weight="fill" style={{ color: 'var(--color-secondary)' }} />
                  {open.activity ?? 'Workout'}
                </p>
                <span className="inline-block" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-secondary)' }}>
                  Resume workout
                </span>
              </Panel>
            )}

            <section>
              <SectionHead title="Your routines" meta={routines.length > 0 ? `${routines.length}` : undefined} />
              {routines.length === 0 ? (
                <div style={{ padding: '14px 0 4px' }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>No routines yet</p>
                  <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
                    Make one for each kind of day you train — leg day, push day, back and arms — with the
                    sets, reps and weight you aim for. Starting it later takes one tap.
                  </p>
                </div>
              ) : (
                <div className="noc-rows" style={{ marginTop: 6 }}>
                  {routines.map((r, i) => (
                    <div key={r.id}>
                      <div className="flex items-center" style={{ gap: 12, padding: '13px 0' }}>
                        <button onClick={() => navigate(`/member/track/routine/${r.id}`)}
                          className="flex-1 min-w-0 flex items-center text-left noc-row" style={{ gap: 12 }}>
                          <span className="flex-none grid place-items-center orb-cell orb-cell--busy"
                            style={{ width: 42, height: 42, borderRadius: 12 }}>
                            <Barbell size={19} weight="duotone" style={{ color: 'var(--color-primary-300)' }} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.name}</span>
                            <span className="block truncate" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                              {r.exercises.length === 0 ? 'No exercises yet — tap to add' : routineSummary(r)}
                            </span>
                          </span>
                        </button>
                        {r.exercises.length > 0 ? (
                          <button onClick={() => start(r)} disabled={starting !== null}
                            aria-label={`Start ${r.name}`}
                            className="flex-none inline-flex items-center noc-press disabled:opacity-50"
                            style={{
                              gap: 6, height: 38, padding: '0 14px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600,
                              color: 'var(--color-secondary)', border: '1px solid var(--color-secondary)',
                              background: 'color-mix(in srgb, var(--color-secondary) 10%, transparent)',
                            }}>
                            <Play size={13} weight="fill" /> {starting === r.id ? '…' : 'Start'}
                          </button>
                        ) : (
                          <PencilSimple size={16} className="flex-none" style={{ color: 'var(--color-text-muted)' }} />
                        )}
                      </div>
                      {i < routines.length - 1 && <div className="hair" />}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <NocButton variant="action" className="w-full" icon={<Plus size={16} weight="bold" />}
              onClick={() => navigate('/member/track/routine/new')}>
              New routine
            </NocButton>

            {/* The free-form log, kept for a session that follows no routine. */}
            <button onClick={() => navigate('/member/track/log')}
              className="w-full flex items-center justify-between text-left noc-row"
              style={{ padding: '12px 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span>Log a workout without a routine</span>
              <CaretRight size={14} />
            </button>
          </>
        )}
      </Page>
    </FeatureLock>
  );
}
