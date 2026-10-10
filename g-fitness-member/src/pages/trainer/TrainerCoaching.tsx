import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, NocButton, Panel, SectionHead, StatusPill } from '../../components/ui/noc';
import { errorMessage } from '../../utils/errorMessage';
import { listMembers } from '../../lib/api/members';
import {
  addPaymentMethod, coachingSweep, confirmCoachingPayment, endCoaching, getCoachingSettings, inviteCoaching, monthsLabel,
  myCoachings, peso, removePaymentMethod, respondCoaching, trainerPaymentMethods,
  type Coaching, type CoachingSettings, type TrainerPaymentMethod,
} from '../../lib/api/coaching';
import { getCurrentTrainerId } from '../../services/trainerService';

const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '');

/**
 * The coach's coaching (0181): who asked, who paid them (tap Received), who
 * trains with them and until when, who they stand in for — and, at a gym where
 * members pay the coach directly, how members pay them.
 */
export default function TrainerCoaching() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<CoachingSettings | null | undefined>(undefined);
  const [list, setList] = useState<Coaching[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [methods, setMethods] = useState<TrainerPaymentMethod[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ member: '', months: '', price: '' });
  const [method, setMethod] = useState({ kind: 'gcash' as TrainerPaymentMethod['kind'], label: 'GCash', accountName: '', accountNumber: '' });

  const load = useCallback(async () => {
    await coachingSweep();
    const [s, l, id] = await Promise.all([getCoachingSettings(), myCoachings(), getCurrentTrainerId()]);
    setSettings(s);
    setList(l);
    setMe(id);
    if (id) setMethods(await trainerPaymentMethods(id));
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  useEffect(() => {
    if (!settings?.modes.includes('coach_invites')) return;
    void listMembers().then((rows) => setMembers(rows.map((m) => ({ id: m.profile.id, name: `${m.profile.first_name} ${m.profile.last_name}` }))))
      .catch(() => setMembers([]));
  }, [settings]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); await load(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  if (settings === undefined) return <Page><PageTitle back fallback="/trainer/home" title="Coaching" /><SkeletonList count={4} /></Page>;
  if (settings === null) {
    return <Page><PageTitle back fallback="/trainer/home" title="Coaching" /><Panel><p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Your gym has not set up coaching terms yet.</p></Panel></Page>;
  }

  const mine = (list ?? []).filter((c) => c.iAm === 'coach');
  const requests = mine.filter((c) => c.status === 'requested');
  const toConfirm = mine.filter((c) => c.status === 'payment_sent' && c.feeMode === 'trainer_direct');
  const unpaid = mine.filter((c) => c.status === 'awaiting_payment' || (c.status === 'payment_sent' && c.feeMode !== 'trainer_direct'));
  const invited = mine.filter((c) => c.status === 'invited');
  const active = mine.filter((c) => c.status === 'active');
  const standing = (list ?? []).filter((c) => c.iAm === 'standin' && c.status === 'active');
  const direct = settings.feeMode === 'trainer_direct';
  const person = (c: Coaching) => <Avatar name={c.memberName} photoUrl={c.memberPhoto} size={36} />;

  return (
    <Page>
      <PageTitle back fallback="/trainer/home" title="Coaching" subtitle="Requests, trainees and payments" />
      {list === null && <Panel><p style={{ fontSize: 13.5, color: 'var(--color-secondary)' }}>Coaching could not be loaded.</p></Panel>}

      <div data-requests>
        <SectionHead title="Asking you" meta={requests.length ? String(requests.length) : undefined} />
        {requests.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No requests.</p> : requests.map((c) => (
          <div key={c.id} style={{ paddingBottom: 12, borderBottom: '1px solid var(--color-separator)', marginBottom: 12 }}>
            <LineRow gutter={person(c)} gutterWidth={48} title={c.memberName} last
              meta={`${c.kind === 'group' ? 'Your group' : '1-on-1'} · ${monthsLabel(c.months)}${c.price != null && !direct ? ` · ${peso(c.price)} to the gym` : ''}`} />
            {direct && (
              <Field label={`What you charge for ${monthsLabel(c.months)} (₱)`}>
                <TextInput inputMode="decimal" aria-label={`Price for ${c.memberName}`} value={prices[c.id] ?? ''}
                  onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="0" />
              </Field>
            )}
            <div className="flex" style={{ gap: 8, marginTop: 8 }}>
              <NocButton className="flex-1" disabled={busy || (direct && (prices[c.id] ?? '') === '')}
                onClick={() => void run(() => respondCoaching(c.id, true, direct ? Number(prices[c.id]) : null), 'Accepted')}>Accept</NocButton>
              <NocButton className="flex-1" variant="ghost" disabled={busy}
                onClick={() => void run(() => respondCoaching(c.id, false), 'Declined — they have been told')}>Decline</NocButton>
            </div>
          </div>
        ))}
      </div>

      {toConfirm.length > 0 && (
        <div data-to-confirm>
          <SectionHead title="Paid you — check it arrived" />
          {toConfirm.map((c) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <LineRow gutter={person(c)} gutterWidth={48} title={c.memberName} last
                meta={`${c.price != null ? peso(c.price) : ''} · ref ${c.payReference}`} />
              <div className="flex" style={{ gap: 8, marginTop: 6 }}>
                <NocButton className="flex-1" disabled={busy} onClick={() => void run(() => confirmCoachingPayment(c.id, true), 'Received — the coaching has started')}>Received</NocButton>
                <NocButton className="flex-1" variant="ghost" disabled={busy} onClick={() => void run(() => confirmCoachingPayment(c.id, false), 'They have been asked to check it')}>Not found</NocButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {(unpaid.length > 0 || invited.length > 0) && (
        <div>
          <SectionHead title="Waiting" />
          {[...invited, ...unpaid].map((c, i, all) => (
            <LineRow key={c.id} gutter={person(c)} gutterWidth={48} title={c.memberName} last={i === all.length - 1}
              meta={c.status === 'invited' ? 'You offered — waiting for them' : c.status === 'payment_sent' ? 'Paid the gym — the desk confirms' : 'Waiting for their payment'}
              action={c.status === 'invited' ? 'Cancel' : undefined}
              onClick={c.status === 'invited' ? () => void run(() => endCoaching(c.id), 'Offer withdrawn') : undefined} />
          ))}
        </div>
      )}

      <div data-trainees>
        <SectionHead title="Training with you" meta={active.length ? String(active.length) : undefined} />
        {active.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody yet.</p> : active.map((c, i) => (
          <LineRow key={c.id} gutter={person(c)} gutterWidth={48} title={c.memberName} last={i === active.length - 1}
            meta={`Until ${fmt(c.endsOn)}${c.standin ? ` · ${c.standin.name} stands in to ${fmt(c.standin.to)}` : ''}`}
            action={c.roomId ? 'Room' : undefined}
            onClick={c.roomId ? () => navigate(`/trainer/rooms/${c.roomId}`) : undefined} />
        ))}
      </div>

      {standing.length > 0 && (
        <div data-standing>
          <SectionHead title="Standing in" />
          {standing.map((c, i) => (
            <LineRow key={c.id} gutter={person(c)} gutterWidth={48} title={c.memberName} last={i === standing.length - 1}
              meta={`For ${c.trainerName}, ${fmt(c.standin?.from ?? null)} – ${fmt(c.standin?.to ?? null)}`} />
          ))}
        </div>
      )}

      {settings.modes.includes('coach_invites') && (
        <div data-invite>
          <SectionHead title="Offer to coach someone" />
          <Field label="Member">
            <Select aria-label="Member to invite" value={invite.member} onChange={(e) => setInvite({ ...invite, member: e.target.value })}>
              <option value="">Choose a member</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2" style={{ gap: 8, marginTop: 8 }}>
            <Field label="Length">
              <Select aria-label="Length" value={invite.months} onChange={(e) => setInvite({ ...invite, months: e.target.value })}>
                <option value="">Choose</option>
                {settings.lengths.map((m) => <option key={m} value={m}>{monthsLabel(m)}</option>)}
              </Select>
            </Field>
            {direct && (
              <Field label="Your price (₱)">
                <TextInput inputMode="decimal" value={invite.price} onChange={(e) => setInvite({ ...invite, price: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="0" />
              </Field>
            )}
          </div>
          <NocButton className="w-full" style={{ marginTop: 10 }} disabled={busy || !invite.member || !invite.months || (direct && invite.price === '')}
            onClick={() => void run(async () => { await inviteCoaching(invite.member, Number(invite.months), direct ? Number(invite.price) : null); setInvite({ member: '', months: '', price: '' }); }, 'Offer sent')}>
            Send the offer
          </NocButton>
        </div>
      )}

      {direct && me && (
        <div data-pay-methods>
          <SectionHead title="How members pay you" />
          <p style={{ fontSize: 12.5, marginBottom: 6, color: 'var(--color-text-muted)' }}>
            At this gym members pay you directly. The gym never sees this money — only that they have a coach.
          </p>
          {methods.map((m, i) => (
            <LineRow key={m.id} title={m.label} meta={[m.accountName, m.accountNumber].filter(Boolean).join(' · ') || undefined}
              action={<StatusPill label="Remove" tone="action" />} last={i === methods.length - 1}
              onClick={() => void run(() => removePaymentMethod(m.id), 'Removed')} />
          ))}
          <div className="grid grid-cols-2" style={{ gap: 8, marginTop: 8 }}>
            <Field label="Kind">
              <Select value={method.kind} onChange={(e) => { const k = e.target.value as TrainerPaymentMethod['kind']; setMethod({ ...method, kind: k, label: k === 'gcash' ? 'GCash' : k === 'maya' ? 'Maya' : k === 'bank' ? 'Bank transfer' : '' }); }}>
                <option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank">Bank</option><option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Label"><TextInput value={method.label} maxLength={60} onChange={(e) => setMethod({ ...method, label: e.target.value })} /></Field>
            <Field label="Account name"><TextInput value={method.accountName} maxLength={80} onChange={(e) => setMethod({ ...method, accountName: e.target.value })} /></Field>
            <Field label="Number"><TextInput value={method.accountNumber} maxLength={60} onChange={(e) => setMethod({ ...method, accountNumber: e.target.value })} /></Field>
          </div>
          <NocButton className="w-full" style={{ marginTop: 10 }} disabled={busy || !method.label.trim() || !method.accountNumber.trim()}
            onClick={() => void run(async () => {
              await addPaymentMethod({ kind: method.kind, label: method.label.trim(), accountName: method.accountName.trim() || null, accountNumber: method.accountNumber.trim(), qrUrl: null });
              setMethod({ kind: 'gcash', label: 'GCash', accountName: '', accountNumber: '' });
            }, 'Added')}>Add</NocButton>
        </div>
      )}
    </Page>
  );
}
