import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, Lock } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { useFeatures } from '../hooks/useFeatures';
import { findFeature, isEnabled } from '../lib/api/planFeatures';
import { getCurrentMemberId } from '../services/bookingService';
import { getOpenRoutineSession } from '../lib/api/routines';
import {
  getProgram, leaveProgram, programProgress, startProgram, startProgramDay,
  type ProgramDayRow, type ProgramSummary, type ProgressDay,
} from '../lib/api/programs';

const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * One of the gym's programs (0122): what it is, its weeks, and today's workout.
 *
 * Three states, each said plainly:
 *   - **Locked** (Premium, not on the member's plan): the name and description,
 *     a lock, and what unlocks it. Never hidden (0049). No Start — the database
 *     would refuse it anyway, and a button that fails is worse than none.
 *   - **Not following**: the weeks, and Start.
 *   - **Following**: each day ticked when a finished workout points at it, and
 *     the next undone day has the Start button. A day runs in the ordinary
 *     workout player, so it earns what any workout earns.
 */
export default function Program() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { features } = useFeatures();
  const [program, setProgram] = useState<ProgramSummary | null | undefined>(undefined);
  const [days, setDays] = useState<ProgramDayRow[]>([]);
  const [progress, setProgress] = useState<ProgressDay[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!programId) return;
    try {
      const me = await getCurrentMemberId();
      const [p, g] = await Promise.all([getProgram(programId), me ? programProgress(me) : Promise.resolve([])]);
      setProgram(p?.program ?? null);
      setDays(p?.days ?? []);
      setProgress(g.length && g[0].programId === programId ? g : []);
    } catch (e) {
      toast.error(errorMessage(e, 'That program could not be loaded'));
      setProgram(null);
    }
  }, [programId]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (program === undefined) return <Page><SkeletonList /></Page>;
  if (program === null) {
    return (
      <Page>
        <PageTitle back fallback="/member/workouts" title="Program" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>This program is not available any more.</p>
      </Page>
    );
  }

  const locked = program.premium && !isEnabled(features, 'premium_programs');
  const following = progress.length > 0;
  const doneIds = new Set(progress.filter((d) => d.done).map((d) => d.dayId));
  const next = following ? progress.find((d) => !d.done) ?? null : null;
  const weeks = Array.from({ length: program.weeks }, (_, i) => i + 1);
  const feature = findFeature(features, 'premium_programs');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(errorMessage(e, 'That did not work')); } finally { setBusy(false); }
  };

  const begin = () => run(async () => {
    await startProgram(program.id);
    toast.success(`You are on ${program.name}. Week 1 is below.`);
    await load();
  });

  const startDay = (dayId: string) => run(async () => {
    // One workout at a time: finish the one under way first.
    const me = await getCurrentMemberId();
    const open = me ? await getOpenRoutineSession(me) : null;
    if (open) { navigate(`/member/track/session/${open.logId}`); return; }
    navigate(`/member/track/session/${await startProgramDay(dayId)}`);
  });

  const leave = () => run(async () => {
    await leaveProgram(program.id);
    toast.success('You have left this program. Your finished workouts stay in your history.');
    await load();
  });

  return (
    <Page>
      <PageTitle back fallback="/member/workouts" title={program.name}
        subtitle={`${program.weeks} week${program.weeks === 1 ? '' : 's'} · ${program.level === 'all_levels' ? 'all levels' : program.level}${program.premium ? ' · Premium' : ''}`} />

      {program.coverUrl && (
        <img src={program.coverUrl} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 16 }} />
      )}
      {program.description && (
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{program.description}</p>
      )}

      {locked ? (
        <Panel>
          <p className="flex items-center" style={{ gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            <Lock size={17} aria-hidden /> Part of Premium
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6, color: 'var(--color-text-secondary)' }}>
            {feature ? `${feature.description} ` : ''}Your plan does not include it yet — ask the desk
            about upgrading. The exercises and their guides stay free for everyone.
          </p>
          <NocButton variant="structure" className="w-full" style={{ marginTop: 12 }}
            onClick={() => navigate('/member/membership')}>
            See membership options
          </NocButton>
        </Panel>
      ) : (
        <>
          {!following && (
            <NocButton variant="action" className="w-full" disabled={busy || days.length === 0} onClick={() => void begin()}>
              Start this program
            </NocButton>
          )}
          {following && next && (
            <Panel glow="action" onClick={() => void startDay(next.dayId)} ariaLabel={`Start ${next.workoutName}`}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-secondary)' }}>Up next · week {next.week}, {DAY[next.day]}</p>
              <p style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{next.workoutName}</p>
            </Panel>
          )}
          {following && !next && (
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-primary-300)' }}>
              Every day done. Well trained.
            </p>
          )}

          {weeks.map((wk) => {
            const inWeek = days.filter((d) => d.week === wk);
            if (inWeek.length === 0) return null;
            return (
              <section key={wk}>
                <SectionHead title={`Week ${wk}`}
                  meta={following ? `${inWeek.filter((d) => doneIds.has(d.id)).length} of ${inWeek.length}` : undefined} />
                {inWeek.map((d, i) => {
                  const done = doneIds.has(d.id);
                  return (
                    <LineRow key={d.id} gutter={DAY[d.day]} gutterWidth={44} title={d.workoutName}
                      last={i === inWeek.length - 1}
                      onClick={following && !done ? () => void startDay(d.id) : undefined}
                      action={done
                        ? <CheckCircle size={20} weight="fill" aria-label="Done" style={{ color: 'var(--color-primary-300)' }} />
                        : following ? <StatusPill label="Start" tone="action" /> : undefined} />
                  );
                })}
              </section>
            );
          })}

          {following && (
            <NocButton variant="ghost" className="w-full" disabled={busy} onClick={() => void leave()}>
              Leave this program
            </NocButton>
          )}
        </>
      )}
    </Page>
  );
}
