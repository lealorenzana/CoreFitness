import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, ArrowLeft, MapPin, Check, X, Lock, ArrowUpRight, RefreshCw, ArrowDownRight,
  Infinity as InfinityIcon,
} from 'lucide-react';
import { Pill } from '../components/ui/StatCard';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { membershipTerm } from '../utils/membershipTerm';
import { planAccess } from '../utils/planAccess';
import { getPlanFeatureMatrix } from '../lib/api/planFeatures';
import { getCurrentMemberId } from '../services/bookingService';
import { listPlans } from '../lib/api/membershipPlans';
import {
  getCurrentMembership, hasUsedFreemiumTrial, type MembershipWithPlan,
} from '../lib/api/memberships';
import type { MembershipPlanRow, PlanTier } from '../types/db';

/**
 * The membership screen: where a member sees what they have, what else exists,
 * and what it would take to move.
 *
 * ## Why this is not just "Renew"
 *
 * It was called Renew Membership and it only ever framed itself that way — one
 * flat list of plans, a button reading "Renew Premium — ₱1,500", and a success
 * screen with a large tick. Three things were wrong with that, and they
 * compounded:
 *
 *  1. **Most people arriving here are not renewing.** They are on Free Access
 *     and want to know what Premium buys. The screen answered a question they
 *     had not asked and buried the one they had.
 *  2. **The plan cards showed a price and a duration and nothing about access.**
 *     `can_book_classes` / `can_book_pt` and the two quotas have been enforced
 *     in SQL since 0017; the member could not read any of it. Choosing between
 *     ₱0 and ₱1,500 with no statement of what separates them is not a choice.
 *  3. **"Renew Free Access — ₱0"** was a real button. So was renewing a plan
 *     that never expires — a payment for nothing, on a tier with nothing to
 *     extend.
 *
 * So the screen now names the move it is actually offering — renew, upgrade, or
 * switch down — and every plan card states its access before its price.
 *
 * ## Still nothing is written here, and that is deliberate
 *
 * An earlier version wrote `SharedStorage.addPayment({ status: 'Pending' })` on
 * submit. That row went nowhere: the admin reads `payments` in Postgres, so the
 * "request" was invisible to the gym while telling the member it was submitted.
 * RLS blocks a member writing `payments` for good reason — a payment record is
 * the gym's evidence that cash changed hands, and only the person who took the
 * cash can assert it.
 *
 * The confirmation step is therefore worded as an instruction, not a receipt.
 * It used to say "Ready to renew" under a large tick in a circle, which is the
 * visual language of a completed transaction for something that had not started
 * one.
 *
 * Prices and rules come from `membership_plans`, the table the admin edits.
 * They were once hardcoded here — the fourth place in the codebase to define
 * plans, with its own prices matching none of the others.
 */

/** Cheapest commitment first, so the column reads as a ladder. */
const TIER_ORDER: Record<PlanTier, number> = { free: 0, freemium: 1, premium: 2 };

/** What moving from the current plan to this one actually is. */
type Move = 'current' | 'upgrade' | 'downgrade' | 'sidegrade';

function describeTerm(plan: MembershipPlanRow): string {
  if (plan.duration_days == null) return 'No expiry';
  if (plan.duration_days % 30 === 0) {
    const months = plan.duration_days / 30;
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  return `${plan.duration_days} days`;
}

export default function RenewMembership() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [current, setCurrent] = useState<MembershipWithPlan | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  // What each plan unlocks (0049), for every plan rather than just this
  // member's. Empty on failure, which degrades to the pre-0049 wording instead
  // of claiming a tier includes nothing.
  const [matrix, setMatrix] = useState<Record<string, { key: string; label: string; enabled: boolean }[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        const [available, membership, usedTrial, features] = await Promise.all([
          listPlans(),
          id ? getCurrentMembership(id).catch(() => null) : Promise.resolve(null),
          id ? hasUsedFreemiumTrial(id) : Promise.resolve(false),
          getPlanFeatureMatrix().catch(() => ({})),
        ]);
        if (cancelled) return;
        setMatrix(features);
        const active = available
          .filter((p) => p.is_active)
          .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
        setPlans(active);
        setCurrent(membership);
        setTrialUsed(usedTrial);
        // Nothing is pre-selected. The old screen defaulted to the plan the
        // member was already on, which meant the primary button read "Renew
        // Free Access — ₱0" before they had touched anything.
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load the plans'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const currentPlan = current?.membership_plans ?? null;
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  /**
   * A plan the member cannot choose, and the reason why.
   *
   * Only the Freemium trial locks, and only once it has been spent. The rule
   * itself lives in the trigger from 0041 — this is the explanation, so the
   * member reads it here rather than discovering it at the desk.
   */
  const lockedReason = useMemo(
    () => (plan: MembershipPlanRow): string | null => {
      if (plan.tier !== 'freemium') return null;
      if (plan.id === currentPlan?.id) return null;
      if (!trialUsed) return null;
      return 'Trial already used — one per member';
    },
    [trialUsed, currentPlan]
  );

  const moveFor = (plan: MembershipPlanRow): Move => {
    if (plan.id === currentPlan?.id) return 'current';
    if (!currentPlan) return 'sidegrade';
    const from = TIER_ORDER[currentPlan.tier];
    const to = TIER_ORDER[plan.tier];
    return to > from ? 'upgrade' : to < from ? 'downgrade' : 'sidegrade';
  };

  const move = selected ? moveFor(selected) : null;

  /**
   * The primary button's wording, and whether pressing it means anything.
   *
   * Renewing a plan that never expires is the case worth guarding: there is no
   * term to extend and no payment to take, so the button would be asking for
   * cash in exchange for nothing.
   */
  const action = (() => {
    if (!selected) return { label: 'Choose a plan', enabled: false };
    if (move === 'current') {
      if (selected.duration_days == null) {
        return {
          label: 'This plan never expires',
          enabled: false,
          note: 'There is nothing to renew — it keeps running until you change it.',
        };
      }
      return { label: `Renew ${selected.name}`, enabled: true };
    }
    if (Number(selected.price) === 0) {
      return { label: `Switch to ${selected.name}`, enabled: true };
    }
    return {
      label: `${move === 'downgrade' ? 'Switch to' : 'Upgrade to'} ${selected.name} — ₱${Number(selected.price).toLocaleString()}`,
      enabled: true,
    };
  })();

  if (confirmed && selected) {
    const free = Number(selected.price) === 0;
    return (
      <div className="space-y-5 pb-4">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3">
          <button onClick={() => setConfirmed(false)}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">At the front desk</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Nothing is charged in the app
            </p>
          </div>
        </motion.div>

        {/* Deliberately not a tick in a circle. Nothing has been paid, nothing
            has been recorded, and the member's membership is exactly as it was
            a second ago — dressing this as a completed transaction is the one
            thing this screen must not do. */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="p-4" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
            What to ask for
          </p>
          <p className="display text-2xl text-white mt-1">{selected.name}</p>
          <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--color-secondary)' }}>
            {free ? 'No payment' : `₱${Number(selected.price).toLocaleString()} in cash`}
            <span className="text-xs font-semibold ml-2" style={{ color: 'var(--color-text-muted)' }}>
              {describeTerm(selected)}
            </span>
          </p>
        </motion.div>

        <div className="rounded-2xl p-4" style={panelStyle}>
          <p className="text-white font-semibold text-sm mb-2">How this works</p>
          <ol className="text-xs space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
            <li><span className="text-white font-semibold">1.</span> Visit the front desk at Core Fitness Mamburao.</li>
            <li>
              <span className="text-white font-semibold">2.</span>{' '}
              {free
                ? `Ask to be moved to ${selected.name}.`
                : `Hand over ₱${Number(selected.price).toLocaleString()} in cash for ${selected.name}.`}
            </li>
            <li><span className="text-white font-semibold">3.</span> Staff record it on the spot — that is what activates the change.</li>
            <li>
              <span className="text-white font-semibold">4.</span>{' '}
              {/* Named because it is the single most common reason a member
                  waits until the last day, which is exactly when a lapse
                  happens. recordPayment() carries unused days forward. */}
              Your access updates immediately, and any days already paid for carry over.
            </li>
          </ol>
        </div>

        <p className="text-xs flex items-center justify-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
          <MapPin size={12} /> Mamburao, Occidental Mindoro
        </p>

        <button onClick={() => navigate('/member/payments')}
          className="w-full h-12 rounded-full font-semibold text-sm text-black"
          style={{ background: 'var(--color-secondary)' }}>
          View payment history
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Membership</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Renew, upgrade or change your plan
          </p>
        </div>
      </motion.div>

      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading plans…</p>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={panelStyle}>
          <Wallet size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="font-medium text-white text-sm">No plans available</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Ask at the front desk about current membership options.
          </p>
        </div>
      ) : (
        <>
          {/* ============ WHAT YOU HAVE ============ */}
          {current && currentPlan && (() => {
            const today = new Date();
            const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const daysLeft = current.expiry_date
              ? Math.round(
                  (new Date(`${current.expiry_date}T00:00:00`).getTime() - midnight.getTime()) / 86_400_000
                )
              : null;
            const usable = current.status === 'active'
              && (current.never_expires || (daysLeft ?? -1) >= 0);
            const term = membershipTerm(daysLeft, current.never_expires);
            const access = planAccess(currentPlan, matrix[currentPlan.id]);

            return (
              <div className="p-4" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Your plan today</p>
                    <p className="display text-lg text-white mt-0.5">{currentPlan.name}</p>
                  </div>
                  <Pill label={usable ? 'Active' : current.status} tone={usable ? 'primary' : 'secondary'} />
                </div>

                {term.kind === 'unlimited' ? (
                  <div className="flex items-center gap-2 mt-3 pt-3"
                    style={{ borderTop: '1px solid var(--color-border)' }}>
                    <InfinityIcon size={16} style={{ color: 'var(--color-primary)' }} className="flex-shrink-0" />
                    <p className="text-sm font-bold text-white">{term.caption}</p>
                  </div>
                ) : current.expiry_date ? (
                  <div className="flex items-end justify-between gap-3 mt-3 pt-3"
                    style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Valid until</p>
                      <p className="text-sm font-bold text-white mt-0.5">
                        {new Date(`${current.expiry_date}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="flex items-baseline gap-1 justify-end">
                        <span className="display text-2xl text-white">{term.value}</span>
                        {term.unit && (
                          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            {term.unit}
                          </span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{term.caption}</p>
                    </div>
                  </div>
                ) : (
                  // No date and not a lifetime plan: the registration was never
                  // activated. Saying nothing here is how that state used to
                  // render as a blank card with no explanation.
                  <p className="text-xs mt-3 pt-3" style={{
                    borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)',
                  }}>
                    Not activated yet — the front desk starts it when you first pay.
                  </p>
                )}

                {access && (
                  <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {access.included.map((item) => (
                      <p key={item} className="text-xs flex items-center gap-1.5"
                        style={{ color: 'var(--color-text-secondary)' }}>
                        <Check size={12} className="flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
                        {item}
                      </p>
                    ))}
                    {access.excluded.map((item) => (
                      <p key={item} className="text-xs flex items-center gap-1.5"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <X size={12} className="flex-shrink-0" />
                        {item} — not on this plan
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ============ WHAT ELSE EXISTS ============ */}
          <div>
            <h2 className="display text-lg text-white mb-3">All plans</h2>
            <div className="space-y-3">
              {plans.map((plan, i) => {
                const isSelected = plan.id === selectedId;
                const isCurrent = plan.id === currentPlan?.id;
                const locked = lockedReason(plan);
                const access = planAccess(plan, matrix[plan.id]);
                const kind = moveFor(plan);

                return (
                  <motion.button key={plan.id}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.06, 0.3) }}
                    disabled={locked != null}
                    onClick={() => setSelectedId(plan.id)}
                    className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98] disabled:active:scale-100"
                    style={{
                      background: 'var(--color-surface-raised)',
                      border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      opacity: locked ? 0.55 : 1,
                    }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white font-bold">{plan.name}</p>
                          {isCurrent && <Pill label="Current" tone="primary" />}
                          {/* The move is named on the card rather than only on
                              the button, so the ladder is legible while
                              scanning and not just after committing. */}
                          {!isCurrent && kind === 'upgrade' && (
                            <span className="text-xs font-semibold flex items-center gap-0.5"
                              style={{ color: 'var(--color-secondary)' }}>
                              <ArrowUpRight size={12} /> Upgrade
                            </span>
                          )}
                          {!isCurrent && kind === 'downgrade' && (
                            <span className="text-xs font-semibold flex items-center gap-0.5"
                              style={{ color: 'var(--color-text-muted)' }}>
                              <ArrowDownRight size={12} /> Costs less
                            </span>
                          )}
                        </div>

                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                          {describeTerm(plan)}
                          {plan.tier === 'freemium' && ' · one per member'}
                        </p>

                        {/* Access before description. The admin's free-text
                            `description` is a sales line; these two lists are
                            the columns the booking triggers actually enforce,
                            so they are what the member needs to compare. */}
                        {access && (
                          <ul className="mt-2 space-y-1">
                            {access.included.map((item) => (
                              <li key={item} className="text-xs flex items-start gap-1.5"
                                style={{ color: 'var(--color-text-secondary)' }}>
                                <Check size={12} className="flex-shrink-0 mt-0.5"
                                  style={{ color: 'var(--color-primary)' }} />
                                {item}
                              </li>
                            ))}
                            {/* Struck through, not merely dimmed. Read as plain
                                text — which is how a list is skimmed — "Personal
                                training" under a ✗ is indistinguishable from
                                "Personal training" under a ✓, and the icon is
                                12px. The line removes the ambiguity at a glance
                                and survives being read aloud badly. */}
                            {access.excluded.map((item) => (
                              <li key={item} className="text-xs flex items-start gap-1.5"
                                style={{ color: 'var(--color-text-muted)' }}>
                                <X size={12} className="flex-shrink-0 mt-0.5" />
                                <span className="line-through">{item}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {locked && (
                          <p className="text-xs mt-2 flex items-center gap-1.5"
                            style={{ color: 'var(--color-secondary)' }}>
                            <Lock size={12} className="flex-shrink-0" /> {locked}
                          </p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold" style={{ color: 'var(--color-secondary)' }}>
                          {Number(plan.price) === 0 ? 'Free' : `₱${Number(plan.price).toLocaleString()}`}
                        </p>
                        {isSelected && (
                          <Check size={16} className="ml-auto mt-1" style={{ color: 'var(--color-primary)' }} />
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl p-4 flex items-start gap-3" style={panelStyle}>
            <Wallet size={18} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Core Fitness takes <span className="text-white font-semibold">cash at the front desk</span>. Your plan
              changes the moment staff record it — nothing is charged through the app, and choosing here does not
              reserve or commit anything.
            </p>
          </div>

          {action.note && (
            <p className="text-xs text-center px-4" style={{ color: 'var(--color-text-muted)' }}>
              {action.note}
            </p>
          )}

          <button
            disabled={!action.enabled}
            onClick={() => setConfirmed(true)}
            className="w-full h-12 rounded-full font-semibold text-black disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--color-secondary)' }}>
            {move === 'current' && action.enabled && <RefreshCw size={16} />}
            {action.label}
          </button>
        </>
      )}
    </div>
  );
}
