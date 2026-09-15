import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Shield, CreditCard, Calendar, Gift, Snowflake, AlertTriangle,
  ArrowRight, Infinity as InfinityIcon,
} from 'lucide-react';
import { Page, PageTitle, Bento, BentoCell, RingStat } from '../components/ui/page';
import { SkeletonList } from '../components/ui/Skeleton';
import { getCurrentMemberId } from '../services/bookingService';
import { getMembershipHub, type MembershipHub as Hub } from '../services/membershipHubService';
import { membershipTerm } from '../utils/membershipTerm';
import { errorMessage } from '../utils/errorMessage';

/**
 * The money-and-access half of the app, as a dock tab.
 *
 * Takes over `/member/membership`, which used to redirect to the plan screen.
 * Nothing links to that path expecting the redirect — the expiry notifications
 * point at `/member/renew`, which still resolves.
 *
 * ## It was four tiles and no answer
 *
 * The screen named its four destinations — My plan, Payments, Attendance, CORE
 * Points — and stated nothing at all: not the plan, not the expiry, not the
 * balance, not whether the membership was frozen. A member opening the
 * Membership tab is asking *what is the state of my membership*, and the tab
 * answered by offering four more taps.
 *
 * Every cell now carries a real number **and** is the route to the screen that
 * number belongs to, which is the same treatment Book a Session got: a tile
 * that only labels a destination is a tap you have to spend before you learn
 * anything. Four destinations, four facts, no bare navigation tiles.
 *
 * ## What it deliberately does not repeat
 *
 * Home's violet card is the member's *identity* — their name, their QR, today.
 * This is the *account*. The plan state appears in both because it is the
 * answer to two different questions, but the card is not duplicated: no QR, no
 * name, no photo. Nothing here is invented and nothing is summed on the phone.
 */
function peso(n: number): string {
  return `₱${n.toLocaleString('en-PH')}`;
}

function dayLabel(key: string): string {
  // Parsed as local parts, never `new Date('YYYY-MM-DD')` — that is read as UTC
  // and renders the day before for the first eight hours of a Manila day.
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function MembershipHub() {
  const navigate = useNavigate();
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Your session could not be verified. Please sign in again.');
        const data = await getMembershipHub(id);
        if (!cancelled) setHub(data);
      } catch (err) {
        // Named, never degraded to zeros. "You have no membership" and "this
        // did not load" are different sentences and only one of them is true.
        if (!cancelled) setError(errorMessage(err, 'Could not load your membership.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const home = hub?.home ?? null;
  const term = membershipTerm(home?.daysLeft ?? null, home?.neverExpires ?? false);

  return (
    <Page>
      <PageTitle title="Membership" subtitle="Your plan, what you have paid, what you have earned" />

      {error && (
        <div className="px-3 py-2.5 rounded-xl flex items-start gap-2 leading-relaxed"
          style={{ fontSize: 'var(--text-meta)', background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <SkeletonList />
      ) : home == null ? null : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Bento>
            {/* ── The plan itself, and its state ──────────────────────────
                Wide, and the route to the plan screen: this cell *is* "My
                plan", so a tile repeating the words underneath would be one
                more tap that teaches nothing. */}
            <BentoCell wide onClick={() => navigate('/member/renew-membership')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold uppercase"
                    style={{ fontSize: 'var(--text-meta)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    <Shield size={11} /> {home.planName ?? 'No plan'}
                  </span>
                </div>
                <ArrowRight size={16} className="flex-shrink-0 mt-1" style={{ color: 'var(--color-text-muted)' }} />
              </div>

              {/* Frozen replaces the countdown rather than sitting beside it.
                  0057 credits those days back to the expiry, so they are not
                  running down — "18 days remaining" here would not merely be
                  unhelpful, it would be untrue. Same rule as Home. */}
              {home.frozen ? (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <p className="flex items-center gap-2 font-bold text-white" style={{ fontSize: 'var(--text-body)' }}>
                    <Snowflake size={15} className="flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
                    Membership frozen
                  </p>
                  <p className="mt-1.5 leading-relaxed"
                    style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-secondary)' }}>
                    You cannot check in or book while it is frozen, and the days you have left are
                    being kept for you. Ask the front desk to start it again.
                  </p>
                </div>
              ) : term.kind === 'unlimited' ? (
                <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <InfinityIcon size={17} className="flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
                  <p className="font-bold text-white" style={{ fontSize: 'var(--text-body)' }}>{term.caption}</p>
                </div>
              ) : (
                <div className="mt-3 pt-3 flex items-end justify-between gap-3"
                  style={{ borderTop: '1px solid var(--color-border)' }}>
                  <div className="min-w-0">
                    <p className="uppercase tracking-wide"
                      style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
                      {/* Cancelled stays usable until the date — that is
                          deliberate, and everything else about the card looks
                          like a live membership right up to the day it stops. */}
                      {home.cancelled ? 'Cancelled · access until' : 'Valid until'}
                    </p>
                    <p className="font-bold text-white mt-0.5" style={{ fontSize: 'var(--text-body)' }}>
                      {home.expiryDate ? dayLabel(home.expiryDate) : '—'}
                    </p>
                  </div>
                  <p className="flex items-baseline gap-1 flex-shrink-0">
                    <span className="display leading-none"
                      style={{
                        fontSize: 'var(--text-display)',
                        color: term.kind === 'expired' ? 'var(--color-secondary)' : '#fff',
                      }}>
                      {term.value}
                    </span>
                    {term.unit && (
                      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
                        {term.unit}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </BentoCell>

            {/* ── CORE Points ─────────────────────────────────────────────
                No `fraction`: a balance has no ceiling to be a fraction of, so
                the ring stays a bare track rather than drawing a gauge that
                measures nothing. Listed on every tier — a plan without points
                gets the locked screen explaining what they are, which is the
                whole point of locking rather than hiding (0049). */}
            <RingStat
              icon={<Gift size={16} />}
              value={hub!.pointsFailed ? '—' : hub!.points}
              label={hub!.pointsFailed ? 'CORE points · not available' : 'CORE points to spend'}
              tone="secondary"
              onClick={() => navigate('/member/rewards')}
            />

            {/* ── Visits this month ───────────────────────────────────────
                Real check-in rows, counted in the service Home already uses.
                The route it leads to is the full record. */}
            <RingStat
              icon={<Calendar size={16} />}
              value={home.checkInsThisMonth}
              label="visits this month"
              onClick={() => navigate('/member/attendance-history')}
            />

            {/* ── The last payment ────────────────────────────────────────
                `paid_on`, never `created_at` — the desk records Monday's cash
                on Tuesday often enough that the two disagree. "No payments
                recorded" is the honest empty state on a cash-only free tier,
                not a zero. */}
            <BentoCell wide onClick={() => navigate('/member/payments')}>
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                  <CreditCard size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  {hub!.paymentsFailed ? (
                    <p className="font-bold text-white" style={{ fontSize: 'var(--text-body)' }}>
                      Payments could not be loaded
                    </p>
                  ) : hub!.lastPayment ? (
                    <>
                      <p className="font-bold text-white" style={{ fontSize: 'var(--text-body)' }}>
                        {peso(hub!.lastPayment.amount)}
                      </p>
                      <p className="mt-0.5" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
                        Last payment · {dayLabel(hub!.lastPayment.paidOn)} · {hub!.lastPayment.method}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-white" style={{ fontSize: 'var(--text-body)' }}>
                        No payments recorded
                      </p>
                      <p className="mt-0.5" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
                        The gym takes cash at the front desk
                      </p>
                    </>
                  )}
                </div>
                <ArrowRight size={16} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
              </div>
            </BentoCell>
          </Bento>
        </motion.div>
      )}
    </Page>
  );
}
