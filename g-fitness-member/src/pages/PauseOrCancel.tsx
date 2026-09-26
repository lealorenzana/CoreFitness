import { useCallback, useEffect, useState } from 'react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead, StatusPill } from '../components/ui/noc';
import { Field, TextInput } from '../components/ui/Field';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { supabase } from '../lib/supabaseClient';
import {
  myMembershipRequest, refundQuote, requestMembershipChange, withdrawMembershipRequest,
  type MembershipRequest, type RefundQuote,
} from '../lib/api/membershipRequests';

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Asking the desk to pause or stop a membership (0118).
 *
 * ## This screen does not pause anything
 *
 * Freezing and cancelling are front-desk actions and stay that way, for the
 * reason 0057 gave: a member who could freeze themselves would freeze on the
 * day they were about to expire and hold the membership indefinitely. What this
 * screen does is turn the asking into a row with a reason and a date, instead
 * of a Messenger message that lands in the system as nothing.
 *
 * So every sentence here is about a *request*. Nothing on it says "paused".
 *
 * ## The refund number comes first, not after
 *
 * 0073 works out what a cancelling member is owed — pro-rata for the unused
 * term, floored at the gym's tier, minus a documented fee, because RA 7394
 * expects pro-rata. `refund_quote()` has been callable by members since 0070
 * and **no member-facing screen had ever called it**. A refund rule somebody
 * only learns after cancelling is one they cannot act on.
 *
 * It is shown before the button, and it is the database's own number: the
 * screen does no arithmetic of its own, so what they read is what the desk
 * will pay.
 *
 * A quote that cannot be read renders **nothing** rather than zero. "We could
 * not work it out" and "you get nothing back" are different sentences, and only
 * one of them is true.
 */
export default function PauseOrCancel() {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<MembershipRequest | null>(null);
  const [membership, setMembership] = useState<{ id: string; status: string } | null>(null);
  const [quote, setQuote] = useState<RefundQuote | null>(null);
  /** Which ask is open on screen. Null = neither, which is where it starts. */
  const [kind, setKind] = useState<'freeze' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('14');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mine = await myMembershipRequest();
      setRequest(mine);

      // The membership itself, for the quote. Read here rather than threaded
      // through MemberHome: this is the only screen that needs its id, and
      // widening that type would touch every screen that uses it.
      const { data } = await supabase
        .from('memberships')
        .select('id, status')
        .in('status', ['active', 'frozen'])
        .order('expiry_date', { ascending: false, nullsFirst: false })
        .limit(1);
      const m = (data ?? [])[0] as { id: string; status: string } | undefined;
      setMembership(m ?? null);
      setQuote(m ? await refundQuote(m.id) : null);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load your membership'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      await requestMembershipChange(kind, reason.trim(), Number(days));
      setKind(null);
      setReason('');
      await load();
      toast.success('Sent. The desk will get back to you.');
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be sent'));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await withdrawMembershipRequest();
      await load();
      toast.success('Withdrawn.');
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be withdrawn'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Page><SkeletonList /></Page>;

  const open = request?.status === 'open' ? request : null;
  const word = (k: 'freeze' | 'cancel') => (k === 'freeze' ? 'pause' : 'cancellation');

  return (
    <Page>
      <PageTitle
        back
        fallback="/member/membership"
        title="Pause or cancel"
        subtitle="Ask the desk — they make the change"
      />

      {/* Nothing to ask about. Said plainly rather than showing a form that
          would be refused by the database a second later. */}
      {!membership && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          You have no membership to pause or cancel right now. Renew first, or ask at the desk.
        </p>
      )}

      {/* An ask already in flight. The member can take it back; they cannot
          grant it, and neither can this screen. */}
      {open && (
        <section>
          <SectionHead title="You asked" />
          <LineRow
            title={open.kind === 'freeze'
              ? `Pause for ${open.requestedDays} days`
              : 'Cancel my membership'}
            meta={`${open.reason} · sent ${stamp(open.createdAt)}`}
            action={<StatusPill label="With the desk" tone="action" />}
            last
          />
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
            The desk has been told. Nothing has changed on your membership yet — it changes when
            they make the change, not when you ask.
          </p>
          <NocButton variant="ghost" className="w-full" style={{ marginTop: 10 }}
            onClick={() => void withdraw()} disabled={busy}>
            Withdraw this
          </NocButton>
        </section>
      )}

      {/* The desk's answer, kept: the reason they gave is the whole point of
          having recorded the ask at all. */}
      {request && request.status === 'declined' && (
        <section>
          <SectionHead title="The desk replied" />
          <LineRow
            title={`Your ${word(request.kind)} request was not granted`}
            meta={request.closeNote ?? 'No reason given.'}
            action={<StatusPill label="Closed" tone="muted" />}
            last
          />
        </section>
      )}

      {request && request.status === 'granted' && (
        <section>
          <SectionHead title="Done" />
          <LineRow
            title={request.kind === 'freeze' ? 'Your membership was paused' : 'Your membership was cancelled'}
            meta={request.closedAt ? stamp(request.closedAt) : ''}
            action={<StatusPill label="Granted" tone="structure" />}
            last
          />
        </section>
      )}

      {/* The two asks. Hidden while one is open: a second ask would replace the
          first (0118 does that deliberately), but offering it here would read
          as "ask twice, get answered twice". */}
      {membership && !open && (
        <section>
          <SectionHead title="What do you need?" />

          {kind === null && (
            <>
              <LineRow
                title="Pause for a while"
                meta={membership.status === 'frozen'
                  ? 'Already paused — ask the desk to restart it'
                  : 'Away, injured, or short of money for a month'}
                dim={membership.status === 'frozen'}
                onClick={membership.status === 'frozen' ? undefined : () => { setKind('freeze'); setReason(''); }}
              />
              <LineRow
                title="Cancel my membership"
                meta="Stop it for good. You may be owed part of this term back."
                onClick={() => { setKind('cancel'); setReason(''); }}
                last
              />
            </>
          )}

          {kind === 'freeze' && (
            <div style={{ marginTop: 8 }}>
              <Field label="How many days?" hint="The desk sets the actual dates.">
                <TextInput
                  value={days}
                  inputMode="numeric"
                  onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                  aria-label="Days to pause"
                />
              </Field>
              <Field label="Why?" hint="The desk reads this. Keep it short.">
                <TextInput
                  value={reason}
                  maxLength={280}
                  placeholder="Away for work until the 20th"
                  onChange={(e) => setReason(e.target.value)}
                  aria-label="Reason"
                />
              </Field>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                While paused you cannot book or check in, and the days are added back to your
                expiry date.
              </p>
            </div>
          )}

          {kind === 'cancel' && (
            <div style={{ marginTop: 8 }}>
              {/* The database's own arithmetic, before the button. */}
              {quote ? (
                <>
                  <LineRow
                    title={`You would get ${peso(quote.amount)} back`}
                    meta={quote.ruleLabel}
                    last
                  />
                  {quote.feeDeducted > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                      After a {peso(quote.feeDeducted)} processing fee.
                    </p>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  The desk will work out what you are owed for the rest of this term.
                </p>
              )}

              <Field label="Why are you leaving?" hint="The desk reads this.">
                <TextInput
                  value={reason}
                  maxLength={280}
                  placeholder="Moving to another city"
                  onChange={(e) => setReason(e.target.value)}
                  aria-label="Reason"
                />
              </Field>
            </div>
          )}

          {kind !== null && (
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <NocButton
                variant="action"
                className="flex-1"
                onClick={() => void send()}
                disabled={busy || reason.trim().length === 0
                  || (kind === 'freeze' && !(Number(days) >= 1 && Number(days) <= 90))}
              >
                {busy ? 'Sending…' : 'Send to the desk'}
              </NocButton>
              <NocButton variant="ghost" className="flex-1" onClick={() => setKind(null)} disabled={busy}>
                Back
              </NocButton>
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
