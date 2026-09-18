import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CaretRight, ChatCircleText, Check, CheckCircle, Circle, ListChecks, Star } from '@phosphor-icons/react';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import Avatar from '../../../components/ui/Avatar';
import GlassSheet from '../../../components/ui/GlassSheet';
import Disclosure from '../../../components/ui/Disclosure';
import { Chip, Eyebrow, NocButton, Panel, SectionHead, StatusPill } from '../../../components/ui/noc';
import { toast } from '../../../components/ui/Toast';
import { errorMessage } from '../../../utils/errorMessage';
import {
  loadCoachFeed, markNoteSeen, setStepDone, type CoachFeed, type CoachNote,
} from '../../../services/coachService';

/**
 * Coach — what your coaches have told you, and what to do about it
 * (reworked 2026-09-18, with migration 0088).
 *
 *   Your coaches   who has written to you; each opens their profile, and asks
 *                  for this month's evaluation when it is yours to give
 *   Next steps     every recommendation not yet done, as a list you tick — the
 *                  coach sees the tick (0088), so advice becomes a step
 *   Notes          newest first, grouped by month, filterable by coach; a note
 *                  opens in full with the coach's profile and a booking
 *
 * Notes are read from `trainer_feedback`, the record — see coachService for
 * why the old notifications-only read missed every note the current trainer
 * app writes. This is still not a chat: replies happen at the desk or in the
 * next session, and the screen says so.
 */

const monthOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function TrainerFeedbackTab() {
  const memberId = useMemberId();
  const navigate = useNavigate();
  const [feed, setFeed] = useState<CoachFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [coachFilter, setCoachFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<CoachNote | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      setFeed(await loadCoachFeed(memberId));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your coach notes'));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const patch = (id: string, p: Partial<CoachNote>) =>
    setFeed((f) => (f ? { ...f, notes: f.notes.map((n) => (n.id === id ? { ...n, ...p } : n)) } : f));

  const openNote = (n: CoachNote) => {
    setOpen(n);
    if (!n.seen && memberId) {
      patch(n.id, { seen: true });
      void markNoteSeen(memberId, n).catch(() => { /* the next load shows the truth */ });
    }
  };

  const toggleDone = async (n: CoachNote) => {
    if (busy) return;
    setBusy(n.id);
    const next = !n.done;
    patch(n.id, { done: next, seen: true });
    if (open?.id === n.id) setOpen({ ...n, done: next, seen: true });
    try {
      await setStepDone(n, next);
      if (next) toast.success(`Done — ${n.coachName.split(' ')[0]} will see it.`);
    } catch (err) {
      patch(n.id, { done: !next });
      if (open?.id === n.id) setOpen({ ...n, done: !next });
      toast.error(errorMessage(err, 'Could not save that'));
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(
    () => (feed?.notes ?? []).filter((n) => !coachFilter || n.trainerId === coachFilter),
    [feed, coachFilter],
  );

  if (loading || !feed) return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;

  if (feed.notes.length === 0) {
    return (
      <Panel glow="structure">
        <Eyebrow>From your coaches</Eyebrow>
        <p style={{ fontSize: 17, fontWeight: 700, marginTop: 8, color: 'var(--color-text-primary)' }}>No notes yet</p>
        <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          After a session, a coach can leave you a note and a next step. They land here — the steps as a checklist you
          tick off, which your coach can see.
        </p>
        <NocButton variant="action" className="w-full" style={{ marginTop: 14 }} icon={<ArrowRight size={15} />}
          onClick={() => navigate('/member/book-class')}>
          Book a session with a coach
        </NocButton>
      </Panel>
    );
  }

  const steps = feed.notes.filter((n) => n.recommendation);
  const openSteps = steps.filter((n) => !n.done);
  const doneSteps = steps.filter((n) => n.done);
  const unread = feed.notes.filter((n) => !n.seen).length;

  // Month groups, in order.
  const groups: [string, CoachNote[]][] = [];
  for (const n of shown) {
    const label = monthOf(n.sentAt);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(n);
    else groups.push([label, [n]]);
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stack)' }}>
      {/* ── Your coaches ── */}
      <section>
        <SectionHead title="Your coaches" meta={unread > 0 ? `${unread} unread` : undefined} />
        <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 10, marginTop: 12, margin: '12px calc(var(--gutter) * -1) 0', padding: '2px var(--gutter)' }}>
          {feed.coaches.map((c) => (
            <button key={c.id} onClick={() => navigate(`/member/trainer/${c.id}`)}
              className="flex-none orb-cell noc-press text-left" style={{ width: 176, borderRadius: 16, padding: 12 }}>
              <span className="flex items-center" style={{ gap: 10 }}>
                <Avatar name={c.name} photoUrl={c.photoUrl} size={38} />
                <span className="min-w-0">
                  <span className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.name}</span>
                  <span className="block truncate" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {c.noteCount} {c.noteCount === 1 ? 'note' : 'notes'}{c.lastNoteAt ? ` · ${shortDay(c.lastNoteAt)}` : ''}
                  </span>
                </span>
              </span>
              {c.evaluatePrompt ? (
                <span className="flex items-center" style={{ gap: 5, marginTop: 10, fontSize: 12, color: 'var(--color-secondary)' }}>
                  <Star size={13} weight="fill" /> {c.evaluatePrompt}
                </span>
              ) : (
                <span className="flex items-center" style={{ gap: 5, marginTop: 10, fontSize: 12, color: 'var(--color-primary-300)' }}>
                  View profile <CaretRight size={11} />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── Next steps ── */}
      {steps.length > 0 && (
        <Panel glow={openSteps.length > 0 ? 'action' : 'structure'}>
          <div className="flex items-center justify-between" style={{ gap: 12 }}>
            <Eyebrow tone={openSteps.length > 0 ? 'action' : undefined}>Next steps</Eyebrow>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{doneSteps.length} of {steps.length} done</span>
          </div>
          {openSteps.length === 0 ? (
            <p className="flex items-center" style={{ gap: 8, fontSize: 14, marginTop: 10, color: 'var(--color-text-primary)' }}>
              <CheckCircle size={18} weight="fill" style={{ color: 'var(--color-primary-300)' }} /> All caught up — every step done.
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 4, marginTop: 8 }}>
              {openSteps.map((n) => (
                <div key={n.id} className="flex items-start" style={{ gap: 12, padding: '8px 0' }}>
                  <button onClick={() => toggleDone(n)} disabled={busy === n.id} aria-label={`Mark done: ${n.recommendation}`}
                    className="flex-none grid place-items-center noc-press disabled:opacity-50"
                    style={{ width: 28, height: 28, marginTop: 1, color: 'var(--color-secondary)' }}>
                    <Circle size={22} />
                  </button>
                  <button onClick={() => openNote(n)} className="flex-1 min-w-0 text-left">
                    <span className="block" style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>{n.recommendation}</span>
                    <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
                      {n.coachName} · {shortDay(n.sentAt)}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
          {doneSteps.length > 0 && openSteps.length > 0 && (
            <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>
              Done steps are ticked in the notes below.
            </p>
          )}
        </Panel>
      )}

      {/* ── Notes ── */}
      <section className="flex flex-col" style={{ gap: 12 }}>
        <SectionHead title="Notes" meta={`${shown.length}`} />
        {feed.coaches.length > 1 && (
          <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, margin: '0 calc(var(--gutter) * -1)', padding: '2px var(--gutter)' }}>
            <Chip label="All coaches" on={coachFilter === null} onClick={() => setCoachFilter(null)} />
            {feed.coaches.map((c) => (
              <Chip key={c.id} label={c.name.split(' ')[0]} on={coachFilter === c.id} onClick={() => setCoachFilter(c.id)} />
            ))}
          </div>
        )}

        {groups.map(([label, list], gi) => (
          <Disclosure key={label} title={label} meta={`${list.length}`} icon={<ChatCircleText size={17} weight="duotone" />} defaultOpen={gi === 0}>
            <div className="flex flex-col">
              {list.map((n, i) => (
                <div key={n.id}>
                  <button onClick={() => openNote(n)} className="w-full flex items-start text-left noc-row" style={{ gap: 12, padding: '12px 0' }}>
                    <Avatar name={n.coachName} photoUrl={n.photoUrl} size={34} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center" style={{ gap: 8 }}>
                        <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{n.coachName}</span>
                        {!n.seen && <StatusPill label="New" tone="action" />}
                        <span className="flex-none ml-auto" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{shortDay(n.sentAt)}</span>
                      </span>
                      <span className="block line-clamp-2" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{n.note}</span>
                      {n.recommendation && (
                        <span className="flex items-start" style={{ gap: 6, marginTop: 6, fontSize: 12.5, lineHeight: 1.45,
                          color: n.done ? 'var(--color-text-muted)' : 'var(--color-secondary)' }}>
                          {n.done ? <Check size={13} weight="bold" style={{ marginTop: 2, flex: 'none' }} /> : <ListChecks size={13} style={{ marginTop: 2, flex: 'none' }} />}
                          <span className="line-clamp-2" style={{ textDecoration: n.done ? 'line-through' : 'none' }}>{n.recommendation}</span>
                        </span>
                      )}
                    </span>
                  </button>
                  {i < list.length - 1 && <div className="hair" />}
                </div>
              ))}
            </div>
          </Disclosure>
        ))}

        <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          This is not a chat — reply to your coach at the desk or in your next session.
        </p>
      </section>

      {/* ── A note, in full ── */}
      <GlassSheet
        open={open !== null}
        onClose={() => setOpen(null)}
        leading={open && <Avatar name={open.coachName} photoUrl={open.photoUrl} size={42} />}
        title={open?.coachName ?? ''}
        subtitle={open ? `${new Date(open.sentAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${new Date(open.sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : undefined}
        footer={open && (
          <div className="flex" style={{ gap: 9 }}>
            {open.trainerId && (
              <NocButton variant="ghost" className="flex-1" onClick={() => { const id = open.trainerId; setOpen(null); navigate(`/member/trainer/${id}`); }}>
                Profile
              </NocButton>
            )}
            <NocButton variant="action" className="flex-1" onClick={() => {
              const id = open.trainerId; setOpen(null);
              navigate('/member/book-class', id ? { state: { trainerId: id } } : undefined);
            }}>
              Book a session
            </NocButton>
          </div>
        )}
      >
        {open && (
          <div className="flex flex-col" style={{ gap: 16 }}>
            {/* The whole note — `pre-wrap` keeps the coach's own line breaks. */}
            <p className="whitespace-pre-wrap" style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{open.note}</p>
            {open.recommendation && (
              <div className="orb-cell" style={{ borderRadius: 14, padding: 14 }}>
                <p className="eyebrow" style={{ color: 'var(--color-secondary)' }}>Next step</p>
                <p className="whitespace-pre-wrap" style={{ fontSize: 14.5, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-primary)' }}>{open.recommendation}</p>
                <NocButton variant={open.done ? 'ghost' : 'fill'} className="w-full" style={{ marginTop: 12 }}
                  icon={open.done ? undefined : <Check size={15} weight="bold" />}
                  disabled={busy === open.id} onClick={() => toggleDone(open)}>
                  {open.done ? 'Done — tap to undo' : 'Mark done'}
                </NocButton>
              </div>
            )}
          </div>
        )}
      </GlassSheet>
    </div>
  );
}
