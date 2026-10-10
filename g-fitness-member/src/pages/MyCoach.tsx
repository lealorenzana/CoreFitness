import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { Field, TextInput } from '../components/ui/Field';
import DateField from '../components/ui/DateField';
import GlassSheet from '../components/ui/GlassSheet';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead, StatusPill } from '../components/ui/noc';
import { errorMessage } from '../utils/errorMessage';
import { addDays, todayKey } from '../utils/dates';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../lib/api/directory';
import {
  coachingSweep, endCoaching, getCoachingSettings, monthsLabel, myCoachings, OPEN_STATUSES, peso, requestCoaching,
  respondCoaching, setCoachingStandin, STATUS_WORDS, submitCoachingPayment, trainerPaymentMethods,
  type Coaching, type CoachingSettings, type TrainerPaymentMethod,
} from '../lib/api/coaching';

const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/**
 * Your coach (0181): the one coaching you have, in whatever state it is —
 * offered to you, waiting for the coach, waiting for your payment, running
 * until a date — and what you can do next. No coach yet: where to find one,
 * and a group code if the gym runs coaching groups. A coach away: pick a
 * stand-in with the same specialty; your coach stays yours.
 */
export default function MyCoach() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<CoachingSettings | null | undefined>(undefined);
  const [list, setList] = useState<Coaching[] | null | undefined>(undefined);
  const [coaches, setCoaches] = useState<PublicTrainer[]>([]);
  const [methods, setMethods] = useState<TrainerPaymentMethod[]>([]);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [standinOpen, setStandinOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endReason, setEndReason] = useState('');
  const [code, setCode] = useState('');
  const [codeMonths, setCodeMonths] = useState<number | null>(null);

  const load = useCallback(async () => {
    await coachingSweep();
    const [s, l, c] = await Promise.all([getCoachingSettings(), myCoachings(), listPublicTrainers().catch(() => [] as PublicTrainer[])]);
    setSettings(s);
    setList(l);
    setCoaches(c);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const mine = (list ?? []).filter((c) => c.iAm === 'member');
  const current = mine.find((c) => OPEN_STATUSES.includes(c.status)) ?? null;
  const past = mine.filter((c) => !OPEN_STATUSES.includes(c.status)).slice(0, 5);
  const coach = current ? coaches.find((t) => t.id === current.trainerId) ?? null : null;

  useEffect(() => {
    if (current?.status === 'awaiting_payment' && current.feeMode === 'trainer_direct') {
      void trainerPaymentMethods(current.trainerId).then(setMethods);
    }
  }, [current?.status, current?.feeMode, current?.trainerId]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); await load(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  if (settings === undefined || list === undefined) return <Page><PageTitle title="Your coach" back fallback="/member/trainers" /><SkeletonList count={3} /></Page>;

  if (settings === null) {
    return (
      <Page>
        <PageTitle title="Your coach" back fallback="/member/trainers" />
        <Panel><p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Your gym has not set up coaching terms yet. You can still book 1-on-1 sessions with any coach.</p></Panel>
        <NocButton onClick={() => navigate('/member/trainers')}>See the coaches</NocButton>
      </Page>
    );
  }

  const sameSpecialty = coaches.filter((t) => current && t.id !== current.trainerId
    && (!coach?.specialization || t.specialization === coach.specialization));
  const others = sameSpecialty.length > 0 ? sameSpecialty : coaches.filter((t) => current && t.id !== current.trainerId);

  return (
    <Page>
      <PageTitle title="Your coach" back fallback="/member/trainers" />
      {list === null && <Panel><p style={{ fontSize: 13.5, color: 'var(--color-secondary)' }}>Your coaching could not be loaded. Pull to try again.</p></Panel>}

      {current && (
        <div data-coaching={current.status}>
          <LineRow
            gutter={<Avatar name={current.trainerName} photoUrl={current.trainerPhoto} size={44} />}
            gutterWidth={58}
            title={current.trainerName}
            meta={`${current.kind === 'group' ? 'Coaching group' : '1-on-1'} · ${monthsLabel(current.months)}${current.price ? ` · ${peso(current.price)}` : ''}`}
            action={<StatusPill label={STATUS_WORDS[current.status]} tone={current.status === 'active' ? 'structure' : 'action'} />}
            last
          />

          {current.status === 'invited' && (
            <div className="flex" style={{ gap: 8, marginTop: 12 }}>
              <NocButton className="flex-1" disabled={busy} onClick={() => void run(() => respondCoaching(current.id, true), 'Accepted')}>Accept</NocButton>
              <NocButton className="flex-1" variant="ghost" disabled={busy} onClick={() => void run(() => respondCoaching(current.id, false), 'Declined')}>Decline</NocButton>
            </div>
          )}

          {current.status === 'requested' && (
            <Panel>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
                {current.trainerName.split(' ')[0]} has your request. You will be told the moment they answer.
              </p>
              <NocButton variant="ghost" className="w-full" disabled={busy} onClick={() => void run(() => endCoaching(current.id), 'Request cancelled')} style={{ marginTop: 10 }}>Cancel the request</NocButton>
            </Panel>
          )}

          {(current.status === 'awaiting_payment' || current.status === 'payment_sent') && (
            <div data-pay>
              <SectionHead title={current.feeMode === 'trainer_direct' ? `Pay ${current.trainerName.split(' ')[0]}` : 'Pay the gym'}
                meta={current.price != null ? peso(current.price) : undefined} />
              {current.feeMode === 'trainer_direct' ? (
                methods.length === 0
                  ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{current.trainerName.split(' ')[0]} has not added how to pay them yet. Ask them in your room.</p>
                  : methods.map((m, i) => (
                    <LineRow key={m.id} title={m.label} last={i === methods.length - 1}
                      meta={[m.accountName, m.accountNumber].filter(Boolean).join(' · ') || undefined}
                      action={m.qrUrl ? <a href={m.qrUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--color-secondary)' }}>QR</a> : undefined} />
                  ))
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Pay at the front desk, or pay the gym online and send the reference below.</p>
              )}
              {current.status === 'payment_sent' ? (
                <p style={{ fontSize: 13, marginTop: 10, color: 'var(--color-text-secondary)' }}>
                  Sent (ref {current.payReference}). Waiting for {current.feeMode === 'trainer_direct' ? current.trainerName.split(' ')[0] : 'the desk'} to confirm it arrived.
                </p>
              ) : (
                <form className="flex" style={{ gap: 8, marginTop: 10 }}
                  onSubmit={(e) => { e.preventDefault(); void run(() => submitCoachingPayment(current.id, reference), 'Sent — they will confirm it'); setReference(''); }}>
                  <TextInput aria-label="Payment reference" placeholder="Reference number" value={reference} onChange={(e) => setReference(e.target.value)} />
                  <NocButton type="submit" disabled={busy || reference.trim().length < 3} style={{ width: 96 }}>Send</NocButton>
                </form>
              )}
            </div>
          )}

          {current.status === 'active' && (
            <>
              <Panel>
                <p style={{ fontSize: 13.5, color: 'var(--color-text-primary)' }}>Until {fmt(current.endsOn)}</p>
                {current.groupCode && <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-secondary)' }}>Friends join your group with the code <strong style={{ letterSpacing: '0.12em' }}>{current.groupCode}</strong></p>}
                {current.roomId && (
                  <NocButton className="w-full" style={{ marginTop: 10 }} onClick={() => navigate(`/member/rooms/${current.roomId}`)}>Open your room</NocButton>
                )}
              </Panel>

              {current.standin ? (
                <p data-standin style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {current.standin.name} stands in from {fmt(current.standin.from)} to {fmt(current.standin.to)}.
                </p>
              ) : (
                <div>
                  {coach?.presence && coach.presence !== 'available' && (
                    <p data-coach-away style={{ fontSize: 13, marginBottom: 8, color: 'var(--color-secondary)' }}>
                      {current.trainerName.split(' ')[0]} is {coach.presence === 'on_leave' ? 'on leave' : 'away'} right now.
                    </p>
                  )}
                  <NocButton variant="ghost" className="w-full" onClick={() => setStandinOpen(true)}>Pick a stand-in coach</NocButton>
                </div>
              )}

              <div className="flex" style={{ gap: 8 }}>
                <NocButton variant="ghost" className="flex-1" onClick={() => navigate('/member/trainers')}>Switch coach</NocButton>
                <NocButton variant="ghost" className="flex-1" onClick={() => setEndOpen(true)}>End coaching</NocButton>
              </div>
            </>
          )}
        </div>
      )}

      {!current && (
        <div data-no-coach>
          <Panel>
            <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
              {settings.modes.includes('pick_pt')
                ? 'You have no coach yet. Open a coach’s profile and tap Train with them.'
                : 'Your gym assigns coaches at the front desk. Ask there.'}
            </p>
            {settings.modes.includes('pick_pt') && (
              <NocButton className="w-full" style={{ marginTop: 10 }} onClick={() => navigate('/member/trainers')}>Find a coach</NocButton>
            )}
          </Panel>
          {settings.modes.includes('pick_group') && (
            <div style={{ marginTop: 14 }}>
              <SectionHead title="Have a group code?" />
              <Field label="Group code">
                <TextInput aria-label="Group code" value={code} maxLength={6} placeholder="ABCDEF"
                  style={{ letterSpacing: '0.2em' }} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </Field>
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                {settings.lengths.map((m) => (
                  <NocButton key={m} variant={codeMonths === m ? 'structure' : 'ghost'} onClick={() => setCodeMonths(m)} style={{ height: 36 }}>{monthsLabel(m)}</NocButton>
                ))}
              </div>
              <NocButton className="w-full" style={{ marginTop: 10 }} disabled={busy || code.length !== 6 || codeMonths == null || coaches.length === 0}
                onClick={() => void run(() => requestCoaching(coaches[0]?.id ?? '', 'group', codeMonths ?? 1, code), 'Asked to join the group')}>
                Ask to join
              </NocButton>
            </div>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <SectionHead title="Before" />
          {past.map((c, i) => (
            <LineRow key={c.id} title={c.trainerName} last={i === past.length - 1}
              meta={`${STATUS_WORDS[c.status]}${c.startsOn ? ` · ${fmt(c.startsOn)} – ${fmt(c.endsOn)}` : ''}`} />
          ))}
        </div>
      )}

      {current && (
        <StandinSheet open={standinOpen} onClose={() => setStandinOpen(false)} coaches={others} busy={busy}
          onPick={(t, from, to) => void run(async () => { await setCoachingStandin(current.id, t, from, to); setStandinOpen(false); }, 'Your stand-in is set')} />
      )}

      <GlassSheet open={endOpen} onClose={() => setEndOpen(false)} title="End your coaching"
        subtitle={current ? `With ${current.trainerName}. Your room and its history stay.` : undefined}
        footer={<NocButton className="w-full" disabled={busy || !current}
          onClick={() => current && void run(async () => { await endCoaching(current.id, endReason); setEndOpen(false); setEndReason(''); }, 'Coaching ended')}>End coaching</NocButton>}>
        <Field label="Why (optional)">
          <TextInput value={endReason} maxLength={200} onChange={(e) => setEndReason(e.target.value)} placeholder="Moving away, a different goal…" />
        </Field>
      </GlassSheet>
    </Page>
  );
}

function StandinSheet({ open, onClose, coaches, busy, onPick }: {
  open: boolean; onClose: () => void; coaches: PublicTrainer[]; busy: boolean;
  onPick: (trainerId: string, from: string, to: string) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(addDays(todayKey(), 7));
  return (
    <GlassSheet open={open} onClose={onClose} title="Pick a stand-in" subtitle="For a stretch of days. Your coach stays yours and sees the history when back."
      footer={<NocButton className="w-full" disabled={busy || !pick || to < from} onClick={() => pick && onPick(pick, from, to)}>Set stand-in</NocButton>}>
      {coaches.length === 0
        ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No other coach is free at your gym right now.</p>
        : coaches.map((t, i) => (
          <LineRow key={t.id} last={i === coaches.length - 1}
            gutter={<Avatar name={trainerName(t)} photoUrl={t.photo_url} size={36} />} gutterWidth={48}
            title={trainerName(t)}
            meta={[t.specialization, t.presence && t.presence !== 'available' ? (t.presence === 'on_leave' ? 'on leave' : 'away') : null].filter(Boolean).join(' · ') || undefined}
            action={pick === t.id ? <StatusPill label="Chosen" /> : 'Choose'}
            onClick={() => setPick(t.id)} />
        ))}
      <div className="grid grid-cols-2" style={{ gap: 8, marginTop: 12 }}>
        <DateField mode="future" label="From" value={from} onChange={setFrom} />
        <DateField mode="future" label="To" value={to} min={from} max={addDays(from, 90)} onChange={setTo} />
      </div>
    </GlassSheet>
  );
}
