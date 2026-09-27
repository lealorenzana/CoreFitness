import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { Page, PageTitle } from '../../components/ui/page';
import { NocButton, Panel, SectionHead, StatusPill } from '../../components/ui/noc';
import { TextArea } from '../../components/ui/Field';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import {
  WORK_STATUS, assignmentDetail, deleteAssignment, dueLabel, returnSubmission, roomClasswork,
  type Classwork, type HandIn,
} from '../../lib/api/rooms';

/**
 * One piece of classwork, member by member (0129): who turned it in, late or
 * on time, what they did — the sets of the logged workout, or the answer they
 * gave — and "Return with comment". Waiting-for-you comes first.
 */
export default function AssignmentDetail() {
  const { roomId = '', assignmentId = '' } = useParams();
  const navigate = useNavigate();
  const [work, setWork] = useState<Classwork | null | undefined>(undefined);
  const [rows, setRows] = useState<HandIn[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [all, detail] = await Promise.all([roomClasswork(roomId), assignmentDetail(assignmentId).catch(() => [])]);
    setWork(all?.find((w) => w.id === assignmentId) ?? null);
    setRows(detail);
  }, [roomId, assignmentId]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const back = `/trainer/rooms/${roomId}?tab=classwork`;
  if (work === undefined || rows === null) return <Page><PageTitle back fallback={back} title="Classwork" /><SkeletonList /></Page>;
  if (work === null) {
    return (
      <Page>
        <PageTitle back fallback={back} title="Classwork" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>This classwork was removed.</p>
      </Page>
    );
  }

  const give = async (h: HandIn) => {
    if (!h.submissionId) return;
    setBusy(true);
    try {
      await returnSubmission(h.submissionId, drafts[h.memberId] ?? '');
      toast.success(`Returned to ${h.name}.`);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be returned'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${work.title}"? Anything turned in for it goes too.`)) return;
    setBusy(true);
    try { await deleteAssignment(work.id); toast.success('Removed.'); navigate(back, { replace: true }); }
    catch (e) { toast.error(errorMessage(e, 'That could not be removed')); setBusy(false); }
  };

  const waiting = rows.filter((r) => r.submissionId && !r.returnedAt);
  const others = rows.filter((r) => !(r.submissionId && !r.returnedAt));

  const card = (h: HandIn) => {
    // "To do" is the member's word; to the coach it is simply not in yet.
    const st = h.status === 'assigned' ? { label: 'Not in yet', tone: 'muted' as const } : WORK_STATUS[h.status];
    return (
      <Panel key={h.memberId}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <Avatar name={h.name} photoUrl={h.photoUrl} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{h.name}</p>
            {h.turnedInAt && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {new Date(h.turnedInAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
          <StatusPill label={st.label} tone={st.tone} />
        </div>
        {h.answerNumber != null && <p style={{ fontSize: 14, marginTop: 8, color: 'var(--color-text-primary)' }}>{h.answerNumber} kg</p>}
        {h.answerText && <p style={{ fontSize: 14, marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>{h.answerText}</p>}
        {h.workout && h.workout.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {h.workout.map((s, i) => (
              <p key={i} className="tabular-nums" style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                {s.exercise} · set {s.set}: {s.seconds ? `${s.seconds}s` : `${s.reps ?? '–'} × ${s.kg ?? 0} kg`}
              </p>
            ))}
          </div>
        )}
        {h.returnComment && <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-primary-300)' }}>You: {h.returnComment}</p>}
        {h.submissionId && !h.returnedAt && (
          <>
            <TextArea rows={2} style={{ marginTop: 10 }} value={drafts[h.memberId] ?? ''} aria-label={`Comment for ${h.name}`}
              placeholder="Your comment — what went well, what to change"
              onChange={(e) => setDrafts({ ...drafts, [h.memberId]: e.target.value.slice(0, 2000) })} />
            <NocButton variant="action" className="w-full" style={{ marginTop: 8 }}
              disabled={busy || !(drafts[h.memberId] ?? '').trim()} onClick={() => void give(h)}>
              Return with comment
            </NocButton>
          </>
        )}
      </Panel>
    );
  };

  return (
    <Page>
      <PageTitle back fallback={back} title={work.title}
        subtitle={`${work.kind === 'workout' ? work.workoutName ?? 'Workout' : 'Check-in'} · due ${dueLabel(work.dueOn)} · ${work.turnedIn} of ${work.targets} turned in`} />
      {work.instructions && <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{work.instructions}</p>}

      {waiting.length > 0 && (
        <section className="flex flex-col" style={{ gap: 10 }}>
          <SectionHead title="To review" meta={`${waiting.length}`} />
          {waiting.map(card)}
        </section>
      )}
      <section className="flex flex-col" style={{ gap: 10 }}>
        <SectionHead title="Everyone" meta={`${others.length}`} />
        {others.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Everyone's work is waiting above.</p>}
        {others.map(card)}
      </section>

      <NocButton variant="ghost" disabled={busy} onClick={() => void remove()}>Remove this classwork</NocButton>
    </Page>
  );
}
