import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../ui/Avatar';
import { SkeletonList } from '../ui/Skeleton';
import { toast } from '../ui/Toast';
import { Field, TextInput } from '../ui/Field';
import DateField from '../ui/DateField';
import GlassSheet from '../ui/GlassSheet';
import { LineRow, NocButton, Panel, ProgressBar, SectionHead, StatusPill } from '../ui/noc';
import { myConversations } from '../../lib/api/chat';
import PayChooser from '../payments/PayChooser';
import { listGymPayMethods, type GymPayMethod } from '../../lib/api/renewalRequests';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';
import { gymOnlinePay, reconcilePending, waitForPayment } from '../../lib/api/paymongo';
import { errorMessage } from '../../utils/errorMessage';
import { addDays, todayKey } from '../../utils/dates';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../../lib/api/directory';
import {
  coachingSweep, endCoaching, getCoachingSettings, monthsLabel, myCoachings, OPEN_STATUSES, peso,
  respondCoaching, setCoachingStandin, STATUS_WORDS, submitCoachingPayment, trainerPaymentMethods,
  type Coaching, type CoachingSettings, type TrainerPaymentMethod,
} from '../../lib/api/coaching';

const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/**
 * Your package (0181; on Train → Coach since the simplify, 2026-10-28 — it was
 * the Your coach page): the one package you have, in whatever state it is —
 * offered to you, waiting for the coach, waiting for your payment, running
 * until a date — and what you can do next. Running: its chat (the package's
 * room), how far through it you are, a stand-in when your coach is away,
 * switch or end. No package: where to find a coach.
 */
export default function MyPackage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<CoachingSettings | null | undefined>(undefined);
  const [list, setList] = useState<Coaching[] | null | undefined>(undefined);
  const [coaches, setCoaches] = useState<PublicTrainer[]>([]);
  const [methods, setMethods] = useState<TrainerPaymentMethod[]>([]);
  /** The gym's own accounts (0167), for a package the gym prices. */
  const gymApp = useGymApp();
  const gymTransfer = moduleOn(gymApp, 'online_pay');
  const [gymMethods, setGymMethods] = useState<GymPayMethod[]>([]);
  useEffect(() => { if (gymTransfer) void listGymPayMethods().then(setGymMethods); }, [gymTransfer]);
  /** Who takes coaching payments online (0192): the gym, and which coaches. */
  const [onlinePay, setOnlinePay] = useState<{ gym: boolean; trainers: string[] } | null>(null);
  useEffect(() => { void gymOnlinePay().then(setOnlinePay); }, []);
  const [confirming, setConfirming] = useState<'waiting' | 'slow' | null>(null);
  const [busy, setBusy] = useState(false);
  const [standinOpen, setStandinOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endReason, setEndReason] = useState('');
  /** Unread messages from the package's coach, for the chat row. */
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    await coachingSweep();
    const [s, l, c] = await Promise.all([getCoachingSettings(), myCoachings(), listPublicTrainers().catch(() => [] as PublicTrainer[])]);
    setSettings(s);
    setList(l);
    setCoaches(c);
    const open = (l ?? []).find((x) => x.iAm === 'member' && x.status === 'active');
    const conv = open ? (await myConversations().catch(() => null))?.find((x) => x.otherId === open.trainerId) : undefined;
    setUnread(conv?.unread ?? 0);
  }, []);
  // Back from PayMongo (?paid=…): the coaching starts here the moment it is confirmed (0192).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('paid')) return;
    void reconcilePending('coaching').then((paid) => { if (paid.length) { toast.success('Payment received — your coaching has started'); void load(); } });
  }, [load]);
  useEffect(() => waitForPayment((state, row) => {
    if (row && row.purpose !== 'coaching') return;
    if (state === 'paid') { setConfirming(null); toast.success('Payment received — your coaching has started'); void load(); }
    else setConfirming(state);
  }), [load]);
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

  if (settings === undefined || list === undefined) return <SkeletonList count={2} />;

  if (settings === null) {
    return (
      <section aria-label="Your package" data-my-package>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Your gym has not set up packages yet. You can still book single sessions with any coach.</p>
      </section>
    );
  }

  const sameSpecialty = coaches.filter((t) => current && t.id !== current.trainerId
    && (!coach?.specialization || t.specialization === coach.specialization));
  const others = sameSpecialty.length > 0 ? sameSpecialty : coaches.filter((t) => current && t.id !== current.trainerId);

  return (
    <section aria-label="Your package" className="flex flex-col" style={{ gap: 12 }} data-my-package>
      {list === null && <Panel><p style={{ fontSize: 13.5, color: 'var(--color-secondary)' }}>Your coaching could not be loaded. Pull to try again.</p></Panel>}

      {current && (
        <div data-coaching={current.status} className="flex flex-col" style={{ gap: 10 }}>
          <LineRow
            gutter={<Avatar name={current.trainerName} photoUrl={current.trainerPhoto} size={44} />}
            gutterWidth={58}
            title={current.trainerName}
            meta={`Package · ${monthsLabel(current.months)}${current.price ? ` · ${peso(current.price)}` : ''}`}
            action={current.status === 'active' && unread > 0
              ? <span data-package-unread className="grid place-items-center" style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11, fontSize: 12, fontWeight: 700, background: 'var(--color-secondary)', color: 'var(--color-bg)' }}>{unread > 99 ? '99+' : unread}</span>
              : <StatusPill label={STATUS_WORDS[current.status]} tone={current.status === 'active' ? 'structure' : 'action'} />}
            onClick={current.status === 'active' && current.roomId ? () => navigate(`/member/rooms/${current.roomId}`) : undefined}
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
              {current.status === 'awaiting_payment' && (() => {
                const direct = current.feeMode === 'trainer_direct';
                const first = current.trainerName.split(' ')[0];
                // Online (0192): to the gym's own PayMongo, or the coach's when they are paid directly.
                const onlineOk = current.price != null && Number(current.price) > 0 && !!onlinePay
                  && (direct ? onlinePay.trainers.includes(current.trainerId) : current.feeMode === 'gym_priced' && onlinePay.gym);
                const accounts: GymPayMethod[] = direct
                  ? methods.map((m) => ({ id: m.id, kind: m.kind, label: m.label, account_name: m.accountName, account_number: m.accountNumber, qr_image: m.qrUrl, instructions: null }))
                  : gymMethods;
                if (direct && !onlineOk && accounts.length === 0) {
                  return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{first} has not added how to pay them yet. Ask them in your chat.</p>;
                }
                return (
                  <PayChooser amount={current.price != null ? peso(current.price) : ''}
                    online={onlineOk ? { purpose: 'coaching', details: { coaching_id: current.id }, returnPath: '/member/book-class?tab=coach', to: direct ? first : 'the gym' } : null}
                    transfer={accounts.length > 0 ? {
                      methods: accounts, whose: direct ? `${first}’s` : 'the gym’s', approver: direct ? first : 'the desk', allowProof: false,
                      send: async (_method, reference) => { await submitCoachingPayment(current.id, reference); toast.success('Sent — they will confirm it'); await load(); },
                    } : null}
                    desk={direct ? null : { next: 'Pay at the counter — your coaching starts when the desk records it.' }} />
                );
              })()}
              {confirming && (
                <p style={{ fontSize: 13, marginTop: 10, color: 'var(--color-text-secondary)' }} data-coaching-confirming>
                  {confirming === 'waiting' ? 'Confirming your payment with PayMongo…' : 'PayMongo has not confirmed it yet — it updates here once it does.'}
                </p>
              )}
              {current.status === 'payment_sent' && (
                <p style={{ fontSize: 13, marginTop: 10, color: 'var(--color-text-secondary)' }}>
                  Sent (ref {current.payReference}). Waiting for {current.feeMode === 'trainer_direct' ? current.trainerName.split(' ')[0] : 'the desk'} to approve it.
                </p>
              )}
            </div>
          )}

          {current.status === 'active' && (
            <>
              <Panel>
                <p style={{ fontSize: 13.5, color: 'var(--color-text-primary)' }}>Until {fmt(current.endsOn)}{current.roomId ? ' · Chat · Classwork' : ''}</p>
                {/* How far through the package: only with both dates, never a guessed bar. */}
                {current.startsOn && current.endsOn && (
                  <ProgressBar style={{ marginTop: 8 }} fraction={(Date.now() - new Date(`${current.startsOn}T00:00:00`).getTime())
                    / (new Date(`${current.endsOn}T00:00:00`).getTime() - new Date(`${current.startsOn}T00:00:00`).getTime())} />
                )}
                {current.roomId && (
                  <NocButton className="w-full" style={{ marginTop: 10 }} onClick={() => navigate(`/member/rooms/${current.roomId}`)}>Open chat</NocButton>
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
                <NocButton variant="ghost" className="flex-1" onClick={() => setEndOpen(true)}>End package</NocButton>
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
                ? 'You have no package yet. Open a coach’s profile and tap Train with them.'
                : 'Your gym assigns coaches at the front desk. Ask there.'}
            </p>
          </Panel>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <SectionHead title="Past packages" />
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

      <GlassSheet open={endOpen} onClose={() => setEndOpen(false)} title="End your package"
        subtitle={current ? `With ${current.trainerName}. Your chat and its history stay.` : undefined}
        footer={<NocButton className="w-full" disabled={busy || !current}
          onClick={() => current && void run(async () => { await endCoaching(current.id, endReason); setEndOpen(false); setEndReason(''); }, 'Package ended')}>End package</NocButton>}>
        <Field label="Why (optional)">
          <TextInput value={endReason} maxLength={200} onChange={(e) => setEndReason(e.target.value)} placeholder="Moving away, a different goal…" />
        </Field>
      </GlassSheet>
    </section>
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
